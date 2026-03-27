'use client'

import { useState } from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { KanbanCard } from './KanbanCard'
import { TaskModal } from './TaskModal'
import { Plus, X } from 'lucide-react'

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
  subtask_count?: number
  subtask_done?: number
}

interface Column {
  id: string
  board_id: string
  name: string
  position: number
  color: string | null
  tasks: Task[]
}

interface Props {
  column: Column
  onAddTask: (columnId: string, title: string, data: Partial<Task>) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
}

export function KanbanColumn({ column, onAddTask, onUpdateTask, onDeleteTask }: Props) {
  const [isAdding, setIsAdding] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [showFullModal, setShowFullModal] = useState(false)

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  })

  function handleAddTask() {
    if (!newTaskTitle.trim()) return
    onAddTask(column.id, newTaskTitle, {})
    setNewTaskTitle('')
    setIsAdding(false)
  }

  function handleFullCreate(taskData: Partial<Task>) {
    if (!taskData.title?.trim()) return
    onAddTask(column.id, taskData.title, taskData)
    setShowFullModal(false)
    setNewTaskTitle('')
    setIsAdding(false)
  }

  const taskIds = column.tasks.map(t => t.id)

  return (
    <>
      <div
        className={`flex-shrink-0 w-72 bg-secondary rounded-lg border ${
          isOver ? 'border-highlight' : 'border-gray-700'
        }`}
      >
        {/* Header */}
        <div
          className="p-3 border-b border-gray-700 flex items-center justify-between"
          style={{ borderTopColor: column.color || '#6b7280', borderTopWidth: 3 }}
        >
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{column.name}</h3>
            <span className="text-xs text-gray-400 bg-accent px-2 py-0.5 rounded-full">
              {column.tasks.length}
            </span>
          </div>
          <button
            onClick={() => setShowFullModal(true)}
            className="p-1 hover:bg-accent rounded"
            title="Neues Ticket (mit allen Feldern)"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Tasks */}
        <div
          ref={setNodeRef}
          className="p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto"
        >
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {column.tasks
              .sort((a, b) => a.position - b.position)
              .map(task => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  onUpdate={onUpdateTask}
                  onDelete={onDeleteTask}
                />
              ))}
          </SortableContext>

          {/* Quick Add */}
          {isAdding && (
            <div className="bg-accent rounded p-2">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Ticket-Titel..."
                className="w-full px-2 py-1 bg-primary border border-gray-600 rounded text-sm text-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTask()
                  if (e.key === 'Escape') setIsAdding(false)
                }}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleAddTask}
                  className="px-2 py-1 bg-highlight text-white rounded text-xs"
                >
                  Schnell hinzufügen
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false)
                    setShowFullModal(true)
                  }}
                  className="px-2 py-1 bg-gray-600 rounded text-xs"
                >
                  Mit Details
                </button>
                <button
                  onClick={() => setIsAdding(false)}
                  className="px-2 py-1 bg-gray-700 rounded text-xs"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Add Button */}
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full p-2 text-gray-400 hover:text-white hover:bg-accent/50 rounded text-sm"
            >
              + Neues Ticket
            </button>
          )}
        </div>
      </div>

      {/* Full Task Creation Modal */}
      <TaskModal
        task={null}
        isOpen={showFullModal}
        onClose={() => setShowFullModal(false)}
        onSave={handleFullCreate}
      />
    </>
  )
}
