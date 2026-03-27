'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Edit2, Check, X } from 'lucide-react'

interface Task {
  id: string
  column_id: string
  title: string
  description: string | null
  position: number
  priority: 'low' | 'medium' | 'high' | 'urgent'
  labels: string
  assignee: string | null
  due_date: string | null
}

interface Props {
  task: Task
  isDragging?: boolean
  onUpdate?: (updates: Partial<Task>) => void
}

const priorityColors = {
  low: 'bg-gray-500',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
}

export function KanbanCard({ task, isDragging, onUpdate }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDescription, setEditDescription] = useState(task.description || '')

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  }

  function handleSave() {
    if (!editTitle.trim()) return
    onUpdate?.({ title: editTitle, description: editDescription || null })
    setIsEditing(false)
  }

  function handlePriorityChange(priority: Task['priority']) {
    onUpdate?.({ priority })
  }

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="bg-accent rounded p-3 border border-highlight"
      >
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full px-2 py-1 bg-primary border border-gray-600 rounded text-sm text-white mb-2"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          placeholder="Description..."
          className="w-full px-2 py-1 bg-primary border border-gray-600 rounded text-sm text-white mb-2 resize-none h-20"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="p-1 bg-highlight rounded hover:bg-highlight/80"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="p-1 bg-gray-600 rounded hover:bg-gray-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-secondary rounded p-3 border border-gray-700 ${
        isDragging ? 'shadow-lg' : ''
      } ${isSortableDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-1 p-1 hover:bg-accent rounded cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4 text-gray-500" />
        </button>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium break-words">{task.title}</p>
          
          {task.description && (
            <p className="text-xs text-gray-400 mt-1 break-words line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Labels */}
          {task.labels && task.labels !== '[]' && (
            <div className="flex flex-wrap gap-1 mt-2">
              {JSON.parse(task.labels).map((label: string, i: number) => (
                <span
                  key={i}
                  className="text-xs px-1.5 py-0.5 bg-accent rounded"
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {/* Priority */}
              <select
                value={task.priority}
                onChange={(e) => handlePriorityChange(e.target.value as Task['priority'])}
                className={`text-xs px-1.5 py-0.5 rounded text-white ${priorityColors[task.priority]}`}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>

              {/* Due Date */}
              {task.due_date && (
                <span className="text-xs text-gray-400">
                  {new Date(task.due_date).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 hover:bg-accent rounded"
              >
                <Edit2 className="w-3 h-3 text-gray-400" />
              </button>
              {onUpdate && (
                <button
                  onClick={() => onUpdate({ title: '' } as any)}
                  className="p-1 hover:bg-red-900/50 rounded"
                >
                  <Trash2 className="w-3 h-3 text-red-400" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
