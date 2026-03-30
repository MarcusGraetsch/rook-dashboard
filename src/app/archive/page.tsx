'use client'

import { useEffect, useState } from 'react'

interface ArchivedTask {
  id: string
  title: string
  description: string | null
  board_name: string
  column_name: string
  canonical_task_id?: string | null
  github_issue_number?: number | null
  github_issue_url?: string | null
  archived_at: string
}

export default function ArchivePage() {
  const [tasks, setTasks] = useState<ArchivedTask[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringTaskId, setRestoringTaskId] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/kanban/archive')
      const json = await res.json()
      setTasks(json.tasks || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function restoreTask(taskId: string) {
    setRestoringTaskId(taskId)
    try {
      const res = await fetch('/api/kanban/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, action: 'restore' }),
      })

      if (res.ok) {
        await load()
      }
    } finally {
      setRestoringTaskId(null)
    }
  }

  if (loading) {
    return <p className="text-gray-400">Loading archive...</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Archive</h2>
        <p className="text-sm text-gray-400 mt-1">
          Completed tickets that were removed from the active Kanban but kept for history.
        </p>
      </div>

      <div className="space-y-4">
        {tasks.length === 0 ? (
          <div className="bg-secondary border border-gray-700 rounded-lg p-5 text-gray-400">
            No archived tasks yet.
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="bg-secondary border border-gray-700 rounded-lg p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-500 font-mono">{task.canonical_task_id || task.id}</p>
                  <h3 className="text-lg font-semibold mt-1">{task.title}</h3>
                  {task.description && <p className="text-sm text-gray-300 mt-2">{task.description}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">
                    {new Date(task.archived_at).toLocaleString('de-DE')}
                  </span>
                  <button
                    onClick={() => restoreTask(task.id)}
                    disabled={restoringTaskId === task.id}
                    className="px-3 py-1 rounded text-xs bg-accent hover:bg-accent/80 disabled:opacity-50"
                  >
                    {restoringTaskId === task.id ? 'Restoring...' : 'Restore to Backlog'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                <div>
                  <p className="text-gray-500">Board</p>
                  <p>{task.board_name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Final Column</p>
                  <p>{task.column_name}</p>
                </div>
                <div>
                  <p className="text-gray-500">GitHub Issue</p>
                  {task.github_issue_number && task.github_issue_url ? (
                    <a href={task.github_issue_url} target="_blank" rel="noreferrer" className="text-blue-300 hover:underline">
                      #{task.github_issue_number}
                    </a>
                  ) : (
                    <p>None</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
