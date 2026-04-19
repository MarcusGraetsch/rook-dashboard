import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
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
    child.on('close', () => {
      try {
        resolve(JSON.parse(stdout || '{}'))
      } catch (error: any) {
        reject(new Error(stderr || error?.message || `Failed to parse output from ${scriptPath}`))
      }
    })
    child.on('error', reject)
  })
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
    default:
      return null
  }
}

export async function GET() {
  try {
    const [contract, controlPlane, integrity, reconciliation, backupIntegrity, runtimeSmokeRaw, tasks, dashboardServiceRaw] = await Promise.all([
      runNodeJson('/root/.openclaw/workspace/operations/bin/check-openclaw-contract.mjs'),
      runNodeJson(RUNTIME_CONTROL_PLANE_SCRIPT),
      runNodeJson('/root/.openclaw/workspace/operations/bin/check-canonical-task-integrity.mjs'),
      runNodeJson('/root/.openclaw/workspace/operations/bin/reconcile-done-code-tasks.mjs'),
      runNodeJson('/root/.openclaw/workspace/operations/bin/check-runtime-backup-integrity.mjs'),
      fs.readFile(RUNTIME_SMOKE_PATH, 'utf8').catch(() => '{}'),
      getCanonicalTasks(),
      runText('systemctl', ['--user', 'show', 'rook-dashboard.service', '--property=ActiveState,SubState,Result,ExecMainStatus']).catch(
        (error: any) => `error=${error?.message || 'unknown'}`
      ),
    ])

    const runtimeSmoke = JSON.parse(runtimeSmokeRaw || '{}')
    const controlPlaneReviewSummary = summarizeReviewDue(controlPlane?.findings)
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
        reconciliation_findings: Number(reconciliation?.finding_count || 0),
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
