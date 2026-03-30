'use client'

import { useEffect, useState } from 'react'

interface RepoDiagnostic {
  project_id: string
  name: string
  repo: string
  type: string
  auth: 'ok' | 'invalid'
  repo_access: 'ok' | 'error'
  issues_access: 'ok' | 'error'
  status: 'ok' | 'error'
  message: string
}

interface DiagnosticsResponse {
  status: 'ok' | 'error'
  source?: string
  auth?: 'ok' | 'invalid'
  summary?: {
    total: number
    ok: number
    error: number
  }
  repos?: RepoDiagnostic[]
  message?: string
}

const badgeClass: Record<string, string> = {
  ok: 'bg-green-900/40 text-green-300',
  error: 'bg-red-900/40 text-red-300',
  invalid: 'bg-red-900/40 text-red-300',
}

export default function GithubPage() {
  const [data, setData] = useState<DiagnosticsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const res = await fetch('/api/control/github/diagnostics')
      const json = await res.json()
      setData(json)
    } catch (error: any) {
      setData({
        status: 'error',
        message: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) {
    return <p className="text-gray-400">Loading GitHub diagnostics...</p>
  }

  if (!data || data.status !== 'ok') {
    return (
      <div className="bg-red-900/50 border border-red-500 p-4 rounded-lg">
        <p className="text-red-300">GitHub diagnostics could not be loaded.</p>
        {data?.message && <p className="text-sm text-red-200 mt-2">{data.message}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">GitHub Diagnostics</h2>
          <p className="text-sm text-gray-400 mt-1">
            Per-repo access checks for GitHub issue sync across the registered workspace projects.
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

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">GitHub Auth</p>
          <p className={`inline-block mt-2 px-2 py-1 rounded text-xs ${badgeClass[data.auth || 'invalid']}`}>
            {data.auth}
          </p>
        </div>
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Repos</p>
          <p className="text-2xl font-bold">{data.summary?.total || 0}</p>
        </div>
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Healthy</p>
          <p className="text-2xl font-bold text-green-300">{data.summary?.ok || 0}</p>
        </div>
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <p className="text-sm text-gray-400">Failing</p>
          <p className="text-2xl font-bold text-red-300">{data.summary?.error || 0}</p>
        </div>
      </div>

      <div className="space-y-4">
        {(data.repos || []).map((repo) => (
          <div key={repo.repo} className="bg-secondary border border-gray-700 rounded-lg p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500 font-mono">{repo.project_id}</p>
                <h3 className="text-lg font-semibold mt-1">{repo.name}</h3>
                <p className="text-sm text-gray-300 mt-2 font-mono">{repo.repo}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${badgeClass[repo.status]}`}>
                {repo.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
              <div>
                <p className="text-gray-500">Repo Access</p>
                <p className={repo.repo_access === 'ok' ? 'text-green-300' : 'text-red-300'}>{repo.repo_access}</p>
              </div>
              <div>
                <p className="text-gray-500">Issues Access</p>
                <p className={repo.issues_access === 'ok' ? 'text-green-300' : 'text-red-300'}>{repo.issues_access}</p>
              </div>
              <div>
                <p className="text-gray-500">Type</p>
                <p>{repo.type}</p>
              </div>
            </div>

            <div className="mt-4 text-sm">
              <p className="text-gray-500">Diagnosis</p>
              <p className={repo.status === 'ok' ? 'text-gray-300' : 'text-red-300'}>{repo.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
