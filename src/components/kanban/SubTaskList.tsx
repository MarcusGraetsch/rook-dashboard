'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'

interface SubTask {
  id: string
  title: string
  completed: boolean
  position: number
}

interface Props {
  taskId: string | null
  isOpen: boolean
}

export function SubTaskList({ taskId, isOpen }: Props) {
  const [subtasks, setSubtasks] = useState<SubTask[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (taskId && isOpen) {
      loadSubtasks()
    }
  }, [taskId, isOpen])

  async function loadSubtasks() {
    if (!taskId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/kanban/subtasks?task_id=${taskId}`)
      if (res.ok) {
        const data = await res.json()
        setSubtasks(data)
      }
    } catch (e) {
      console.error('Failed to load subtasks:', e)
    } finally {
      setLoading(false)
    }
  }

  async function addSubtask() {
    if (!newTitle.trim() || !taskId) return
    
    try {
      const res = await fetch('/api/kanban/subtasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, title: newTitle }),
      })
      
      if (res.ok) {
        const subtask = await res.json()
        setSubtasks([...subtasks, subtask])
        setNewTitle('')
      }
    } catch (e) {
      console.error('Failed to add subtask:', e)
    }
  }

  async function toggleSubtask(id: string, completed: boolean) {
    try {
      await fetch('/api/kanban/subtasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed: !completed }),
      })
      
      setSubtasks(subtasks.map(s => 
        s.id === id ? { ...s, completed: !completed } : s
      ))
    } catch (e) {
      console.error('Failed to toggle subtask:', e)
    }
  }

  async function deleteSubtask(id: string) {
    try {
      await fetch(`/api/kanban/subtasks?id=${id}`, { method: 'DELETE' })
      setSubtasks(subtasks.filter(s => s.id !== id))
    } catch (e) {
      console.error('Failed to delete subtask:', e)
    }
  }

  if (!isOpen || !taskId) return null

  const doneCount = subtasks.filter(s => s.completed).length

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm text-gray-400">Checkliste</label>
        {subtasks.length > 0 && (
          <span className="text-xs text-gray-500">
            {doneCount}/{subtasks.length}
          </span>
        )}
      </div>
      
      {/* Progress bar */}
      {subtasks.length > 0 && (
        <div className="h-1 bg-gray-700 rounded mb-3 overflow-hidden">
          <div 
            className="h-full bg-green-500 transition-all"
            style={{ width: `${subtasks.length > 0 ? (doneCount / subtasks.length) * 100 : 0}%` }}
          />
        </div>
      )}
      
      {/* Subtask list */}
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {subtasks.map(subtask => (
          <div key={subtask.id} className="flex items-center gap-2 group">
            <button
              onClick={() => toggleSubtask(subtask.id, subtask.completed)}
              className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                subtask.completed 
                  ? 'bg-green-500 border-green-500 text-white' 
                  : 'border-gray-500 hover:border-highlight'
              }`}
            >
              {subtask.completed && <Check className="w-3 h-3" />}
            </button>
            <span className={`flex-1 text-sm ${subtask.completed ? 'line-through text-gray-500' : ''}`}>
              {subtask.title}
            </span>
            <button
              onClick={() => deleteSubtask(subtask.id)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/50 rounded transition-opacity"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
            </button>
          </div>
        ))}
      </div>
      
      {/* Add subtask */}
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
          placeholder="Neuer Eintrag..."
          className="flex-1 px-2 py-1 bg-primary border border-gray-600 rounded text-sm text-white"
        />
        <button
          onClick={addSubtask}
          disabled={!newTitle.trim()}
          className="p-1 bg-accent hover:bg-accent/80 disabled:opacity-50 rounded"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
