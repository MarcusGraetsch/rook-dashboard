import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { getCanonicalTasks } from '@/lib/control/tasks'

export const dynamic = 'force-dynamic'

const RUNTIME_SMOKE_PATH = '/root/.openclaw/workspace/operations/health/runtime-smoke.json'
const ISOLATED_REPO_VIEWS = new Set(['rook-dashboard'])

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

export async function GET() {
  try {
    const [contract, integrity, reconciliation, backupIntegrity, runtimeSmokeRaw, tasks, dashboardServiceRaw] = await Promise.all([
      runNodeJson('/root/.openclaw/workspace/operations/bin/check-openclaw-contract.mjs'),
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

    return NextResponse.json({
      status: 'ok',
      contract,
      integrity,
      reconciliation,
      backup_integrity: backupIntegrity,
      runtime_smoke: runtimeSmoke,
      dashboard_service: dashboardService,
      tasks: taskDiagnostics,
      summary: {
        contract_ok: Boolean(contract?.ok),
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
