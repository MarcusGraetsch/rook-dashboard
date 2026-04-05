'use client'

import { useEffect, useState } from 'react'

interface DiagnosticFinding {
  task_id: string
  project_id: string
  related_repo: string
  branch: string
  reason: string
  pr_state?: string | null
  pr_number?: number | null
}

interface DiagnosticsPayload {
  status: 'ok' | 'error'
  message?: string
  summary?: {
    contract_ok: boolean
    integrity_ok: boolean
    backup_integrity_ok: boolean
    runtime_smoke_ok: boolean
    dashboard_service_ok: boolean
    reconciliation_findings: number
  }
  contract?: {
    ok: boolean
    checks: Array<{ name: string; ok: boolean; details: string }>
  }
  integrity?: {
    ok: boolean
    duplicates: Array<{ task_id: string; files: string[] }>
    mismatches: Array<{ file: string; problem: string }>
  }
  reconciliation?: {
    finding_count: number
    findings: DiagnosticFinding[]
  }
  backup_integrity?: {
    ok: boolean
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

export default function DiagnosticsPage() {
  const [data, setData] = useState<DiagnosticsPayload | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const res = await fetch('/api/control/diagnostics')
      const json = await res.json()
      setData(json)
    } catch (error: any) {
      setData({
        status: 'error',
        message: error?.message || 'Failed to load diagnostics.',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
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
            Contract health, canonical integrity, runtime smoke state, and historical completion reconciliation.
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

      <div className="grid grid-cols-6 gap-4">
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Contract</p>
          <p className={`inline-block mt-2 px-2 py-1 rounded text-xs ${badgeClass(Boolean(data.summary?.contract_ok))}`}>
            {data.summary?.contract_ok ? 'ok' : 'error'}
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
          {data.integrity?.ok ? (
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
        {data.reconciliation?.finding_count ? (
          <div className="space-y-3">
            {data.reconciliation.findings.map((finding) => (
              <div key={`${finding.project_id}:${finding.task_id}`} className="rounded border border-amber-900/50 bg-amber-950/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-amber-300 font-mono">{finding.project_id}</p>
                    <p className="text-sm font-semibold text-amber-200">{finding.task_id}</p>
                    <p className="text-xs text-gray-400 font-mono break-all mt-1">{finding.branch}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-amber-900/40 text-amber-300">
                    {finding.pr_state || 'no merged PR evidence'}
                  </span>
                </div>
                <p className="text-sm text-amber-100 mt-3">{finding.reason}</p>
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
        {data.backup_integrity?.ok ? (
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
