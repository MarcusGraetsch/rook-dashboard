'use client'

import { useEffect, useState } from 'react'

const AUTO_REFRESH_MS = 30_000

interface DiagnosticFinding {
  task_id: string
  project_id: string
  related_repo: string
  branch: string
  reason: string
  classification?: string
  pr_state?: string | null
  pr_number?: number | null
  remediation?: {
    summary: string
    operator_action: string
  }
}

interface DiagnosticsPayload {
  status: 'ok' | 'error'
  checked_at?: string
  message?: string
  summary?: {
    contract_ok: boolean
    control_plane_ok: boolean
    control_plane_warnings: number
    control_plane_errors: number
    control_plane_review_due_soon: number
    control_plane_review_overdue: number
    integrity_ok: boolean
    backup_integrity_ok: boolean
    runtime_smoke_ok: boolean
    dashboard_service_ok: boolean
    reconciliation_findings: number
    reconciliation_open_pr: number
    reconciliation_commit_only: number
    reconciliation_no_evidence: number
    reconciliation_direct_main: number
  }
  contract?: {
    ok: boolean
    checks: Array<{ name: string; ok: boolean; details: string }>
  }
  control_plane?: {
    checked_at?: string
    ok: boolean
    warning_count: number
    error_count: number
    findings: Array<{
      source: string
      severity: 'info' | 'warning' | 'error'
      type: string
      details: string
      acknowledgment_reason?: string
      review_after?: string
      remediation?: {
        summary: string
        operator_action: string
        command?: string
        automation_level: 'manual' | 'guided' | 'dry-run'
      } | null
    }>
  }
  integrity?: {
    ok: boolean
    status?: 'error'
    message?: string
    duplicates: Array<{ task_id: string; files: string[] }>
    mismatches: Array<{ file: string; problem: string }>
  }
  reconciliation?: {
    ok?: boolean
    status?: 'error'
    message?: string
    finding_count: number
    findings: DiagnosticFinding[]
  }
  backup_integrity?: {
    ok: boolean
    status?: 'error'
    message?: string
    latest_backup?: string | null
    checks?: Array<{ name: string; ok: boolean; details: string }>
    issues?: string[]
  }
  runtime_smoke?: {
    ok: boolean
    results?: Array<{ agent_id: string; ok: boolean; reason: string | null }>
  }
  dashboard_service?: {
    active_state: string
    sub_state: string
    result: string
    exec_main_status: string
  }
  tasks?: Array<{
    task_id: string
    project_id: string
    status: string
    related_repo: string
    branch: string
    repo_view_strategy: string
    reconciliation_status: string
    pr_state?: string | null
    pr_number?: number | null
    blocked_reason?: string | null
    failure_reason?: string | null
    updated_at: string
  }>
}

const badgeClass = (ok: boolean) =>
  ok ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'

const findingBadgeClass = (severity: 'info' | 'warning' | 'error') => {
  switch (severity) {
    case 'info':
      return 'bg-cyan-900/40 text-cyan-300'
    case 'warning':
      return 'bg-amber-900/40 text-amber-300'
    default:
      return 'bg-red-900/40 text-red-300'
  }
}

interface ModelModeFinding {
  source: string
  severity: 'info' | 'warning' | 'error'
  type: string
  details: string
}

function formatTimestamp(value?: string) {
  if (!value) return 'unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function reviewStatus(reviewAfter?: string) {
  if (!reviewAfter) {
    return null
  }

  const reviewDate = new Date(`${reviewAfter}T00:00:00Z`)
  if (Number.isNaN(reviewDate.getTime())) {
    return { label: `Review ${reviewAfter}`, className: 'bg-slate-800 text-slate-200' }
  }

  const msPerDay = 24 * 60 * 60 * 1000
  const daysUntilReview = Math.ceil((reviewDate.getTime() - Date.now()) / msPerDay)

  if (daysUntilReview < 0) {
    return { label: `Review overdue ${reviewAfter}`, className: 'bg-red-900/40 text-red-300' }
  }
  if (daysUntilReview <= 7) {
    return { label: `Review soon ${reviewAfter}`, className: 'bg-amber-900/40 text-amber-300' }
  }
  return { label: `Review ${reviewAfter}`, className: 'bg-cyan-900/40 text-cyan-300' }
}

function modelModeDetails(findings: ModelModeFinding[] | undefined) {
  const activeFinding = (findings || []).find((finding) => finding.source === 'model_mode_policy' && finding.type === 'model_mode_active')
  const usageFindings = (findings || []).filter((finding) => finding.source === 'model_mode_policy' && finding.type.startsWith('model_mode_') && finding.type.endsWith('_usage'))

  const details = {
    activeMode: 'unknown',
    effectiveModel: 'unknown',
    windows: {
      hour: 'unknown',
      day: 'unknown',
      week: 'unknown',
    },
    severity: 'info' as 'info' | 'warning' | 'error',
  }

  if (activeFinding?.details) {
    const parts = activeFinding.details.split(';').map((part) => part.trim())
    for (const part of parts) {
      if (part.startsWith('active_mode=')) {
        details.activeMode = part.slice('active_mode='.length)
      }
      if (part.startsWith('effective_model=')) {
        details.effectiveModel = part.slice('effective_model='.length)
      }
    }
    details.severity = activeFinding.severity
  }

  for (const finding of usageFindings) {
    const windowName = finding.type.replace('model_mode_', '').replace('_usage', '')
    const match = finding.details.match(/=(\d+)\/(\d+) \((\d+)%\).*reset_at=([^\s]+)/)
    const label = match
      ? `${match[1]}/${match[2]} (${match[3]}%) reset ${match[4]}`
      : finding.details

    if (windowName in details.windows) {
      details.windows[windowName as keyof typeof details.windows] = label
    }
    if (finding.severity === 'warning') {
      details.severity = 'warning'
    }
  }

  return details
}

export default function DiagnosticsPage() {
  const [data, setData] = useState<DiagnosticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null)
  const modelMode = modelModeDetails(data?.control_plane?.findings)

  async function load(background = false) {
    if (background) {
      setRefreshing(true)
    }
    try {
      const res = await fetch('/api/control/diagnostics')
      const json = await res.json()
      setData(json)
      setNextRefreshAt(Date.now() + AUTO_REFRESH_MS)
    } catch (error: any) {
      setData({
        status: 'error',
        message: error?.message || 'Failed to load diagnostics.',
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      load(true)
    }, AUTO_REFRESH_MS)

    setNextRefreshAt(Date.now() + AUTO_REFRESH_MS)

    return () => window.clearInterval(intervalId)
  }, [])

  if (loading) {
    return <p className="text-gray-400">Loading diagnostics...</p>
  }

  if (!data || data.status !== 'ok') {
    return (
      <div className="bg-red-900/50 border border-red-500 p-4 rounded-lg">
        <p className="text-red-300">Diagnostics could not be loaded.</p>
        {data?.message && <p className="text-sm text-red-200 mt-2">{data.message}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Diagnostics</h2>
          <p className="text-sm text-gray-400 mt-1">
            Contract health, control-plane posture, canonical integrity, runtime smoke state, and historical completion reconciliation.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Last checked {formatTimestamp(data.checked_at)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {refreshing
              ? 'Updating diagnostics...'
              : `Next refresh ${formatTimestamp(nextRefreshAt ? new Date(nextRefreshAt).toISOString() : undefined)}`}
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true)
            load()
          }}
          className="px-3 py-2 rounded bg-accent hover:bg-accent/80 text-sm"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Contract</p>
          <p className={`inline-block mt-2 px-2 py-1 rounded text-xs ${badgeClass(Boolean(data.summary?.contract_ok))}`}>
            {data.summary?.contract_ok ? 'ok' : 'error'}
          </p>
        </div>
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Control Plane</p>
          <p className={`inline-block mt-2 px-2 py-1 rounded text-xs ${badgeClass(Boolean(data.summary?.control_plane_ok))}`}>
            {data.summary?.control_plane_ok ? 'ok' : 'error'}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {data.summary?.control_plane_warnings || 0} warnings • {data.summary?.control_plane_errors || 0} errors
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {data.summary?.control_plane_review_due_soon || 0} due soon • {data.summary?.control_plane_review_overdue || 0} overdue
          </p>
        </div>
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Model Mode</p>
          <p className={`inline-block mt-2 px-2 py-1 rounded text-xs ${findingBadgeClass(modelMode.severity)}`}>
            {modelMode.activeMode}
          </p>
          <p className="text-xs text-gray-500 mt-2 break-all">
            {modelMode.effectiveModel}
          </p>
        </div>
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Integrity</p>
          <p className={`inline-block mt-2 px-2 py-1 rounded text-xs ${badgeClass(Boolean(data.summary?.integrity_ok))}`}>
            {data.summary?.integrity_ok ? 'ok' : 'error'}
          </p>
        </div>
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Runtime Smoke</p>
          <p className={`inline-block mt-2 px-2 py-1 rounded text-xs ${badgeClass(Boolean(data.summary?.runtime_smoke_ok))}`}>
            {data.summary?.runtime_smoke_ok ? 'ok' : 'error'}
          </p>
        </div>
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Backups</p>
          <p className={`inline-block mt-2 px-2 py-1 rounded text-xs ${badgeClass(Boolean(data.summary?.backup_integrity_ok))}`}>
            {data.summary?.backup_integrity_ok ? 'ok' : 'error'}
          </p>
        </div>
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Dashboard Service</p>
          <p className={`inline-block mt-2 px-2 py-1 rounded text-xs ${badgeClass(Boolean(data.summary?.dashboard_service_ok))}`}>
            {data.summary?.dashboard_service_ok ? 'ok' : 'error'}
          </p>
        </div>
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Done Findings</p>
          <p className="text-2xl font-bold">{data.summary?.reconciliation_findings || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-secondary p-5 rounded-lg border border-gray-700 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Control Plane</h3>
              <p className="text-sm text-gray-400 mt-1">
                Aggregated runtime posture, drift, stale state, and task-binding findings from the operator check.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Checked {formatTimestamp(data.control_plane?.checked_at)}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="text-gray-400">Warnings</p>
              <p className="text-xl font-semibold">{data.control_plane?.warning_count || 0}</p>
            </div>
          </div>
          {(data.control_plane?.findings || []).length > 0 ? (
            <div className="space-y-3">
              {(data.control_plane?.findings || []).map((finding, index) => (
                <div key={`${finding.type}:${index}`} className="rounded border border-gray-700 p-4">
                  {(() => {
                    const status = reviewStatus(finding.review_after)
                    return status ? (
                      <div className="mb-3">
                        <span className={`px-2 py-1 rounded text-xs ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                    ) : null
                  })()}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-gray-400 font-mono">{finding.source}</p>
                      <p className="text-sm font-semibold mt-1">{finding.type}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${findingBadgeClass(finding.severity)}`}>
                      {finding.severity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-200 mt-3">{finding.details}</p>
                  {finding.remediation ? (
                    <div className="mt-4 rounded border border-cyan-900/40 bg-cyan-950/10 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
                          What to do
                        </p>
                        <span className="px-2 py-1 rounded text-xs bg-slate-800 text-slate-200">
                          {finding.remediation.automation_level}
                        </span>
                      </div>
                      <p className="text-sm text-cyan-100">{finding.remediation.summary}</p>
                      <p className="text-xs text-cyan-200/90">{finding.remediation.operator_action}</p>
                      {finding.remediation.command ? (
                        <pre className="mt-2 overflow-x-auto rounded bg-slate-950/80 p-3 text-xs text-cyan-200">
                          <code>{finding.remediation.command}</code>
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                  {finding.acknowledgment_reason ? (
                    <div className="mt-3 text-xs text-cyan-200/90 space-y-1">
                      <p>{finding.acknowledgment_reason}</p>
                      {finding.review_after ? <p>Policy review date {finding.review_after}</p> : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-green-300 text-sm">No control-plane findings reported.</p>
          )}
        </div>

        <div className="bg-secondary p-5 rounded-lg border border-gray-700 space-y-3">
          <h3 className="text-lg font-semibold">Dashboard Service</h3>
          <div className="text-sm space-y-2">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-400">Active state</span>
              <span>{data.dashboard_service?.active_state || 'unknown'}</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-400">Sub state</span>
              <span>{data.dashboard_service?.sub_state || 'unknown'}</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-400">Result</span>
              <span>{data.dashboard_service?.result || 'unknown'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Exec main status</span>
              <span>{data.dashboard_service?.exec_main_status || 'unknown'}</span>
            </div>
          </div>
        </div>

        <div className="bg-secondary p-5 rounded-lg border border-gray-700 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Model Mode</h3>
              <p className="text-sm text-gray-400 mt-1">
                Active default/fallback state derived from the control-plane model policy and runtime usage counters.
              </p>
            </div>
            <span className={`px-2 py-1 rounded text-xs ${findingBadgeClass(modelMode.severity)}`}>
              {modelMode.activeMode}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-400">Effective model</span>
              <span className="font-mono break-all">{modelMode.effectiveModel}</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-400">Hour window</span>
              <span className="font-mono text-right">{modelMode.windows.hour}</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-400">Day window</span>
              <span className="font-mono text-right">{modelMode.windows.day}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Week window</span>
              <span className="font-mono text-right">{modelMode.windows.week}</span>
            </div>
          </div>
        </div>

        <div className="bg-secondary p-5 rounded-lg border border-gray-700 space-y-3">
          <h3 className="text-lg font-semibold">Runtime Smoke</h3>
          {(data.runtime_smoke?.results || []).map((result) => (
            <div key={result.agent_id} className="flex items-center justify-between text-sm border-b border-gray-800 pb-2">
              <span className="font-mono">{result.agent_id}</span>
              <span className={result.ok ? 'text-green-300' : 'text-red-300'}>
                {result.ok ? 'ok' : (result.reason || 'error')}
              </span>
            </div>
          ))}
        </div>

        <div className="bg-secondary p-5 rounded-lg border border-gray-700 space-y-3 col-span-2">
          <h3 className="text-lg font-semibold">Integrity</h3>
          {data.integrity?.status === 'error' ? (
            <div className="rounded border border-red-900/50 bg-red-950/20 p-4 space-y-2">
              <p className="text-red-300 text-sm font-medium">Integrity check failed to run.</p>
              <p className="text-xs text-red-200 break-all">{data.integrity.message || 'Unknown integrity check error.'}</p>
              <pre className="overflow-x-auto rounded bg-slate-950/80 p-3 text-xs text-red-200">
                <code>node /root/.openclaw/workspace/operations/bin/check-canonical-task-integrity.mjs</code>
              </pre>
            </div>
          ) : data.integrity?.ok ? (
            <p className="text-green-300 text-sm">No duplicate task ids or path mismatches detected.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {(data.integrity?.duplicates || []).map((duplicate) => (
                <div key={duplicate.task_id} className="rounded border border-red-900/50 bg-red-950/20 p-3">
                  <p className="text-red-300 font-medium">{duplicate.task_id}</p>
                  {(duplicate.files || []).map((file) => (
                    <p key={file} className="text-red-200 font-mono break-all">{file}</p>
                  ))}
                </div>
              ))}
              {(data.integrity?.mismatches || []).map((mismatch) => (
                <div key={mismatch.file} className="rounded border border-red-900/50 bg-red-950/20 p-3">
                  <p className="text-red-300 font-medium">{mismatch.problem}</p>
                  <p className="text-red-200 font-mono break-all">{mismatch.file}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-secondary p-5 rounded-lg border border-gray-700 space-y-4">
        <h3 className="text-lg font-semibold">Done Reconciliation</h3>
        {data.reconciliation?.status !== 'error' ? (
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="rounded border border-gray-700 p-3">
              <p className="text-gray-500">Open PR</p>
              <p className="text-lg font-semibold">{data.summary?.reconciliation_open_pr || 0}</p>
            </div>
            <div className="rounded border border-gray-700 p-3">
              <p className="text-gray-500">Commit Only</p>
              <p className="text-lg font-semibold">{data.summary?.reconciliation_commit_only || 0}</p>
            </div>
            <div className="rounded border border-gray-700 p-3">
              <p className="text-gray-500">No Evidence</p>
              <p className="text-lg font-semibold">{data.summary?.reconciliation_no_evidence || 0}</p>
            </div>
            <div className="rounded border border-gray-700 p-3">
              <p className="text-gray-500">Direct Main</p>
              <p className="text-lg font-semibold">{data.summary?.reconciliation_direct_main || 0}</p>
            </div>
          </div>
        ) : null}
        {data.reconciliation?.status === 'error' ? (
          <div className="rounded border border-red-900/50 bg-red-950/20 p-4 space-y-2">
            <p className="text-red-300 text-sm font-medium">Done reconciliation check failed to run.</p>
            <p className="text-xs text-red-200 break-all">{data.reconciliation.message || 'Unknown reconciliation check error.'}</p>
            <pre className="overflow-x-auto rounded bg-slate-950/80 p-3 text-xs text-red-200">
              <code>node /root/.openclaw/workspace/operations/bin/reconcile-done-code-tasks.mjs</code>
            </pre>
          </div>
        ) : data.reconciliation?.finding_count ? (
          <div className="space-y-3">
            {data.reconciliation.findings.map((finding) => (
              <div key={`${finding.project_id}:${finding.task_id}`} className="rounded border border-amber-900/50 bg-amber-950/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-amber-300 font-mono">{finding.project_id}</p>
                    <p className="text-sm font-semibold text-amber-200">{finding.task_id}</p>
                    <p className="text-xs text-gray-400 font-mono break-all mt-1">{finding.branch}</p>
                    {finding.classification ? (
                      <p className="text-xs text-gray-500 mt-2">{finding.classification}</p>
                    ) : null}
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-amber-900/40 text-amber-300">
                    {finding.pr_state || 'no merged PR evidence'}
                  </span>
                </div>
                <p className="text-sm text-amber-100 mt-3">{finding.reason}</p>
                {finding.remediation ? (
                  <div className="mt-4 rounded border border-amber-800/40 bg-slate-950/30 p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                      What to do
                    </p>
                    <p className="text-sm text-amber-100">{finding.remediation.summary}</p>
                    <p className="text-xs text-amber-200/90">{finding.remediation.operator_action}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-green-300 text-sm">No historical done tasks are missing merged completion evidence.</p>
        )}
      </div>

      <div className="bg-secondary p-5 rounded-lg border border-gray-700 space-y-4">
        <h3 className="text-lg font-semibold">Task Execution View</h3>
        <div className="space-y-3">
          {(data.tasks || []).map((task) => (
            <div key={`${task.project_id}:${task.task_id}`} className="rounded border border-gray-700 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-400 font-mono">{task.project_id}</p>
                  <p className="text-sm font-semibold">{task.task_id}</p>
                  <p className="text-xs text-gray-500 mt-1">{task.related_repo}</p>
                  <p className="text-xs text-gray-500 font-mono break-all mt-1">{task.branch}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200 inline-block">
                    {task.status}
                  </p>
                  <p className="text-xs text-gray-400">{task.updated_at}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs mt-4 text-gray-300">
                <div>
                  <p className="text-gray-500">Repo view</p>
                  <p>{task.repo_view_strategy}</p>
                </div>
                <div>
                  <p className="text-gray-500">Reconciliation</p>
                  <p>{task.reconciliation_status}</p>
                </div>
                <div>
                  <p className="text-gray-500">PR state</p>
                  <p>{task.pr_number ? `#${task.pr_number} ${task.pr_state || 'unknown'}` : (task.pr_state || 'none')}</p>
                </div>
                <div>
                  <p className="text-gray-500">Failure</p>
                  <p>{task.failure_reason || task.blocked_reason || 'none'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-secondary p-5 rounded-lg border border-gray-700 space-y-4">
        <h3 className="text-lg font-semibold">Backup Integrity</h3>
        {data.backup_integrity?.status === 'error' ? (
          <div className="rounded border border-red-900/50 bg-red-950/20 p-4 space-y-2">
            <p className="text-red-300 text-sm font-medium">Backup integrity check failed to run.</p>
            <p className="text-xs text-red-200 break-all">{data.backup_integrity.message || 'Unknown backup integrity check error.'}</p>
            <pre className="overflow-x-auto rounded bg-slate-950/80 p-3 text-xs text-red-200">
              <code>node /root/.openclaw/workspace/operations/bin/check-runtime-backup-integrity.mjs</code>
            </pre>
          </div>
        ) : data.backup_integrity?.ok ? (
          <p className="text-green-300 text-sm">
            Latest backup looks restorable. {data.backup_integrity.latest_backup || 'No backup path reported.'}
          </p>
        ) : (
          <div className="space-y-2">
            {((data.backup_integrity?.issues?.length ? data.backup_integrity.issues : ['Backup integrity check failed.'])).map((issue) => (
              <p key={issue} className="text-sm text-red-300">{issue}</p>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {(data.backup_integrity?.checks || []).map((check) => (
            <div key={check.name} className="rounded border border-gray-700 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs text-gray-300">{check.name}</p>
                <span className={`px-2 py-1 rounded text-xs ${badgeClass(check.ok)}`}>
                  {check.ok ? 'ok' : 'error'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2 break-all">{check.details}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-secondary p-5 rounded-lg border border-gray-700 space-y-3">
        <h3 className="text-lg font-semibold">Contract Checks</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {(data.contract?.checks || []).map((check) => (
            <div key={check.name} className="rounded border border-gray-700 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs text-gray-300">{check.name}</p>
                <span className={`px-2 py-1 rounded text-xs ${badgeClass(check.ok)}`}>
                  {check.ok ? 'ok' : 'error'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2">{check.details}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
