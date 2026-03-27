'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import { TaskModal } from './TaskModal'

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
  onUpdate?: (taskId: string, updates: Partial<Task>) => void
  onDelete?: (taskId: string) => void
}

const priorityColors = {
  low: 'bg-gray-500',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
}

const priorityLabels = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

const ASSIGNEE_NAMES: Record<string, string> = {
  rook: '🦅 Rook',
  coach: '🧠 Coach',
  engineer: '🛠️ Engineer',
  researcher: '📚 Researcher',
  health: '💪 Health',
  consultant: '💼 Consultant',
}

export function KanbanCard({ task, isDragging, onUpdate, onDelete }: Props) {
  const [showModal, setShowModal] = useState(false)

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

  function handleSave(updates: Partial<Task>) {
    onUpdate?.(task.id, updates)
    setShowModal(false)
  }

  function handleDelete() {
    onDelete?.(task.id)
    setShowModal(false)
  }

  const labels = task.labels && task.labels !== '[]' ? JSON.parse(task.labels) : []
  const isOverdue = task.due_date && new Date(task.due_date) < new Date()

  const priorityBorder = {
    low: 'border-l-gray-400',
    medium: 'border-l-blue-500',
    high: 'border-l-orange-500',
    urgent: 'border-l-red-500',
  }[task.priority]

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`bg-secondary rounded p-3 border border-gray-700 border-l-4 ${priorityBorder} cursor-pointer hover:border-highlight ${
          isDragging ? 'shadow-lg' : ''
        } ${isSortableDragging ? 'opacity-50' : ''}`}
        onClick={() => setShowModal(true)}
      >
        <div className="flex items-start gap-2">
          <button
            {...attributes}
            {...listeners}
            className="mt-1 p-1 hover:bg-accent rounded cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4 text-gray-500" />
          </button>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium break-words">{task.title}</p>
            
            {/* Description Preview */}
            {task.description && (
              <p className="text-xs text-gray-400 mt-1 break-words line-clamp-2">
                {task.description}
              </p>
            )}
            
            {/* Labels */}
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {labels.map((label: string, i: number) => (
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
            <div className="flex items-center justify-between mt-2 gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Priority Badge */}
                <span className={`text-xs px-1.5 py-0.5 rounded text-white ${priorityColors[task.priority]}`}>
                  {priorityLabels[task.priority]}
                </span>

                {/* Due Date */}
                {task.due_date && (
                  <span className={`text-xs ${isOverdue ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                    {isOverdue && '⚠️ '}
                    📅 {new Date(task.due_date).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                )}

                {/* Assignee */}
                {task.assignee && (
                  <span className="text-xs bg-accent px-1.5 py-0.5 rounded">
                    {ASSIGNEE_NAMES[task.assignee] || task.assignee}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <TaskModal
        task={task}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </>
  )
}
