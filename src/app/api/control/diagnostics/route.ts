import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { getDb } from '@/lib/db'
import { collectKanbanIntegrityFindings } from '@/lib/control/kanban-integrity'
import { getCanonicalTasks } from '@/lib/control/tasks'

export const dynamic = 'force-dynamic'

const RUNTIME_SMOKE_PATH = '/root/.openclaw/workspace/operations/health/runtime-smoke.json'
const RUNTIME_CONTROL_PLANE_SCRIPT = '/root/.openclaw/workspace/operations/bin/check-runtime-control-plane.mjs'
const ISOLATED_REPO_VIEWS = new Set(['rook-dashboard'])
const REVIEW_SOON_DAYS = 7

interface ControlPlaneFinding {
  source: string
  severity: 'info' | 'warning' | 'error'
  type: string
  details: string
  acknowledgment_reason?: string
  review_after?: string
  [key: string]: any
}

interface FindingRemediation {
  summary: string
  operator_action: string
  command?: string
  automation_level: 'manual' | 'guided' | 'dry-run'
}

interface DiagnosticsCheckError {
  ok: false
  status: 'error'
  message: string
}

function repoTail(relatedRepo: string | null | undefined) {
  return String(relatedRepo || '').split('/').pop() || ''
}

function repoViewStrategy(task: { related_repo?: string | null; branch?: string | null }) {
  const tail = repoTail(task.related_repo)
  if (!tail) return 'no-repo'
  if (ISOLATED_REPO_VIEWS.has(tail)) return 'isolated-task-repo-view'
  if (task.branch) return 'shared-specialist-repo-view'
  return 'n/a'
}

function reconciliationStatus(task: {
  status: string
  related_repo?: string | null
  branch?: string | null
  github_pull_request?: { state?: string | null; number?: number | null } | null
}) {
  if (!task.related_repo || !task.branch) return 'not-code-task'
  if (task.status !== 'done') return task.status
  if (task.github_pull_request?.state === 'merged') return 'merged'
  if (task.github_pull_request?.number) return 'pr-not-merged'
  return 'needs-reconciliation'
}

function runNodeJson(scriptPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath], {
      cwd: '/root/.openclaw/workspace',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('close', (code) => {
      if ((code ?? 1) !== 0) {
        reject(new Error(stderr.trim() || `${scriptPath} exited with ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout || '{}'))
      } catch (error: any) {
        reject(new Error(stderr || error?.message || `Failed to parse output from ${scriptPath}`))
      }
    })
    child.on('error', reject)
  })
}

async function runNodeJsonCheck(scriptPath: string): Promise<any | DiagnosticsCheckError> {
  try {
    return await runNodeJson(scriptPath)
  } catch (error: any) {
    return {
      ok: false,
      status: 'error',
      message: error?.message || `Failed to run ${scriptPath}`,
    }
  }
}

function runText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: '/root/.openclaw/workspace',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('close', (code) => {
      if ((code ?? 1) !== 0) {
        reject(new Error(stderr.trim() || `${command} exited with ${code}`))
        return
      }
      resolve(stdout)
    })
    child.on('error', reject)
  })
}

function parseSystemctlShow(output: string) {
  const record = Object.fromEntries(
    output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=')
        return index === -1 ? null : [line.slice(0, index), line.slice(index + 1)]
      })
      .filter(Boolean) as Array<[string, string]>
  )
  return {
    active_state: record.ActiveState || 'unknown',
    sub_state: record.SubState || 'unknown',
    result: record.Result || 'unknown',
    exec_main_status: record.ExecMainStatus || 'unknown',
  }
}

function summarizeReviewDue(findings: Array<{ review_after?: string }> | undefined) {
  let review_due_soon = 0
  let review_overdue = 0

  for (const finding of findings || []) {
    if (!finding.review_after) {
      continue
    }
    const reviewDate = new Date(`${finding.review_after}T00:00:00Z`)
    if (Number.isNaN(reviewDate.getTime())) {
      continue
    }

    const msPerDay = 24 * 60 * 60 * 1000
    const daysUntilReview = Math.ceil((reviewDate.getTime() - Date.now()) / msPerDay)
    if (daysUntilReview < 0) {
      review_overdue += 1
    } else if (daysUntilReview <= REVIEW_SOON_DAYS) {
      review_due_soon += 1
    }
  }

  return { review_due_soon, review_overdue }
}

function summarizeReconciliation(findings: Array<{ classification?: string }> | undefined) {
  const summary = {
    open_or_unmerged_pr: 0,
    commit_evidence_without_pr_metadata: 0,
    done_without_merge_evidence: 0,
    direct_to_main_without_merge_evidence: 0,
  }

  for (const finding of findings || []) {
    const key = finding.classification
    if (key && key in summary) {
      summary[key as keyof typeof summary] += 1
    }
  }

  return summary
}

function remediationForFinding(finding: ControlPlaneFinding): FindingRemediation | null {
  switch (finding.type) {
    case 'unbound_agent_dirs':
      return {
        summary: 'Agent directories exist on disk that are no longer bound in openclaw.json.',
        operator_action: 'Inspect the listed agent directories and dry-run stale-agent archival before any cleanup.',
        command: `node /root/.openclaw/workspace/operations/bin/archive-stale-agent-dir.mjs --agent ${finding.agent_ids?.[0] || '<agent-id>'}`,
        automation_level: 'dry-run',
      }
    case 'stale_agent_dir':
      return {
        summary: 'A stale agent directory still exists and has not met archive-readiness requirements.',
        operator_action: 'Review the blockers first. If the agent is truly stale, run the archive helper in dry-run mode, then rerun with --apply only after the blockers are gone.',
        command: `node /root/.openclaw/workspace/operations/bin/archive-stale-agent-dir.mjs --agent ${finding.agent_id || '<agent-id>'}`,
        automation_level: 'dry-run',
      }
    case 'runtime_state_coverage_mismatch':
      return {
        summary: 'Canonical tasks and runtime overlay state are out of sync for this project.',
        operator_action: 'Inspect which canonical tasks are missing runtime state and decide whether the task is intentionally idle, needs fresh dispatch, or needs stale runtime cleanup.',
        command: 'node /root/.openclaw/workspace/operations/bin/check-runtime-state-coverage.mjs',
        automation_level: 'guided',
      }
    case 'dispatcher_hook_model_not_provider_qualified':
      return {
        summary: 'The dispatcher hook model is set, but not with the provider-qualified contract expected by runtime checks.',
        operator_action: 'Align the dispatcher model in openclaw.json and the installed user unit, then rerun the contract and control-plane checks.',
        command: 'node /root/.openclaw/workspace/operations/bin/check-openclaw-contract.mjs',
        automation_level: 'manual',
      }
    case 'telegram_group_allowlist_empty':
      return {
        summary: 'Telegram group ingress is disabled because allowlist mode has no groups configured.',
        operator_action: 'If this is intentional, keep the policy acknowledgment current. If not, add the intended groups before enabling group ingress.',
        command: 'node /root/.openclaw/workspace/operations/bin/check-runtime-posture.mjs',
        automation_level: 'manual',
      }
    case 'gateway_insecure_auth_enabled':
      return {
        summary: 'The control UI currently allows insecure auth and depends on loopback binding plus token discipline.',
        operator_action: 'Review whether loopback-only access is still guaranteed. If not, disable insecure auth and revalidate gateway access.',
        command: 'node /root/.openclaw/workspace/operations/bin/check-runtime-posture.mjs',
        automation_level: 'manual',
      }
    case 'kanban_nonworkflow_column':
      return {
        summary: 'A dashboard board contains a column outside the canonical workflow schema.',
        operator_action: 'Inspect the board columns, move any tasks out of the legacy column, then remove or reconcile the drifted column.',
        command: 'curl -sS http://127.0.0.1:3001/api/control/diagnostics',
        automation_level: 'guided',
      }
    case 'kanban_missing_workflow_column':
      return {
        summary: 'A dashboard board is missing one of the required workflow columns.',
        operator_action: 'Reload the board through the dashboard APIs or recreate the missing workflow column using the guarded API path.',
        command: 'curl -sS http://127.0.0.1:3001/api/control/diagnostics',
        automation_level: 'guided',
      }
    case 'kanban_duplicate_workflow_column':
      return {
        summary: 'A dashboard board contains duplicate workflow columns and may project tasks ambiguously.',
        operator_action: 'Merge tasks into the intended column and remove the duplicate manually from the SQLite data only after confirming task placement.',
        command: 'curl -sS http://127.0.0.1:3001/api/control/diagnostics',
        automation_level: 'manual',
      }
    case 'kanban_task_missing_canonical_link':
      return {
        summary: 'A live dashboard task has no canonical task linkage metadata.',
        operator_action: 'Resync the task from Kanban to canonical state, then verify that canonical_task_id and project_id are populated.',
        command: 'curl -sS http://127.0.0.1:3001/api/kanban/sync',
        automation_level: 'guided',
      }
    case 'kanban_task_missing_canonical_record':
      return {
        summary: 'A live dashboard task points to a canonical task file that no longer exists.',
        operator_action: 'Compare the dashboard row with operations/tasks and either restore the canonical task or recreate the task from Kanban deliberately.',
        command: 'curl -sS http://127.0.0.1:3001/api/control/diagnostics',
        automation_level: 'manual',
      }
    default:
      return null
  }
}

export async function GET() {
  try {
    const [contract, controlPlane, integrity, reconciliation, backupIntegrity, runtimeSmokeRaw, tasks, dashboardServiceRaw, kanbanIntegrity] = await Promise.all([
      runNodeJsonCheck('/root/.openclaw/workspace/operations/bin/check-openclaw-contract.mjs'),
      runNodeJsonCheck(RUNTIME_CONTROL_PLANE_SCRIPT),
      runNodeJsonCheck('/root/.openclaw/workspace/operations/bin/check-canonical-task-integrity.mjs'),
      runNodeJsonCheck('/root/.openclaw/workspace/operations/bin/reconcile-done-code-tasks.mjs'),
      runNodeJsonCheck('/root/.openclaw/workspace/operations/bin/check-runtime-backup-integrity.mjs'),
      fs.readFile(RUNTIME_SMOKE_PATH, 'utf8').catch(() => '{}'),
      getCanonicalTasks(),
      runText('systemctl', ['--user', 'show', 'rook-dashboard.service', '--property=ActiveState,SubState,Result,ExecMainStatus']).catch(
        (error: any) => `error=${error?.message || 'unknown'}`
      ),
      collectKanbanIntegrityFindings(getDb()),
    ])

    const runtimeSmoke = JSON.parse(runtimeSmokeRaw || '{}')
    const controlPlaneReviewSummary = summarizeReviewDue(controlPlane?.findings)
    const reconciliationSummary = summarizeReconciliation(reconciliation?.findings)
    const dashboardService = dashboardServiceRaw.startsWith('error=')
      ? {
          active_state: 'unknown',
          sub_state: 'unknown',
          result: dashboardServiceRaw,
          exec_main_status: 'unknown',
        }
      : parseSystemctlShow(dashboardServiceRaw)
    const taskDiagnostics = tasks
      .filter((task) => task.related_repo && task.branch)
      .sort((left, right) => right.timestamps.updated_at.localeCompare(left.timestamps.updated_at))
      .slice(0, 12)
      .map((task) => ({
        task_id: task.task_id,
        project_id: task.project_id,
        status: task.status,
        related_repo: task.related_repo,
        branch: task.branch,
        repo_view_strategy: repoViewStrategy(task),
        reconciliation_status: reconciliationStatus(task),
        pr_state: task.github_pull_request?.state || null,
        pr_number: task.github_pull_request?.number || null,
        blocked_reason: task.blocked_reason || null,
        failure_reason: task.failure_reason || null,
        updated_at: task.timestamps.updated_at,
      }))

    const controlPlaneWithRemediation = controlPlane
      ? {
          ...controlPlane,
          findings: Array.isArray(controlPlane.findings)
            ? controlPlane.findings.map((finding: ControlPlaneFinding) => ({
                ...finding,
                remediation: remediationForFinding(finding),
              }))
            : [],
        }
      : controlPlane

    const kanbanIntegrityWithRemediation = kanbanIntegrity
      ? {
          ...kanbanIntegrity,
          findings: Array.isArray(kanbanIntegrity.findings)
            ? (kanbanIntegrity.findings as ControlPlaneFinding[]).map((finding) => ({
                ...finding,
                remediation: remediationForFinding(finding),
              }))
            : [],
        }
      : kanbanIntegrity

    return NextResponse.json({
      status: 'ok',
      checked_at: new Date().toISOString(),
      contract,
      control_plane: controlPlaneWithRemediation,
      integrity,
      reconciliation,
      backup_integrity: backupIntegrity,
      runtime_smoke: runtimeSmoke,
      dashboard_service: dashboardService,
      kanban_integrity: kanbanIntegrityWithRemediation,
      tasks: taskDiagnostics,
      summary: {
        contract_ok: Boolean(contract?.ok),
        control_plane_ok: Boolean(controlPlaneWithRemediation?.ok),
        control_plane_warnings: Number(controlPlaneWithRemediation?.warning_count || 0),
        control_plane_errors: Number(controlPlaneWithRemediation?.error_count || 0),
        control_plane_review_due_soon: controlPlaneReviewSummary.review_due_soon,
        control_plane_review_overdue: controlPlaneReviewSummary.review_overdue,
        integrity_ok: Boolean(integrity?.ok),
        backup_integrity_ok: Boolean(backupIntegrity?.ok),
        runtime_smoke_ok: Boolean(runtimeSmoke?.ok),
        dashboard_service_ok: dashboardService.active_state === 'active' && dashboardService.sub_state === 'running',
        kanban_integrity_ok: Boolean(kanbanIntegrityWithRemediation?.ok),
        kanban_integrity_warnings: Number(kanbanIntegrityWithRemediation?.warning_count || 0),
        reconciliation_findings: Number(reconciliation?.finding_count || 0),
        reconciliation_open_pr: reconciliationSummary.open_or_unmerged_pr,
        reconciliation_commit_only: reconciliationSummary.commit_evidence_without_pr_metadata,
        reconciliation_no_evidence: reconciliationSummary.done_without_merge_evidence,
        reconciliation_direct_main: reconciliationSummary.direct_to_main_without_merge_evidence,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        message: error?.message || 'Failed to load diagnostics.',
      },
      { status: 500 },
    )
  }
}
