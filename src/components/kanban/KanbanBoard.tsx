'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import { Plus, Layout } from 'lucide-react'

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

interface Column {
  id: string
  board_id: string
  name: string
  position: number
  color: string | null
  tasks: Task[]
}

interface Board {
  id: string
  name: string
  description: string | null
  columns: Column[]
}

const priorityColors = {
  low: 'text-gray-400',
  medium: 'text-blue-400',
  high: 'text-orange-400',
  urgent: 'text-red-400',
}

export function KanbanBoard() {
  const [boards, setBoards] = useState<Board[]>([])
  const [activeBoard, setActiveBoard] = useState<Board | null>(null)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  )

  useEffect(() => {
    fetchBoards()
  }, [])

  async function fetchBoards() {
    try {
      const res = await fetch('/api/kanban/boards')
      if (res.ok) {
        const data = await res.json()
        setBoards(data)
        if (data.length > 0 && !activeBoard) {
          setActiveBoard(data[0])
        }
      }
    } catch (e) {
      console.error('Failed to fetch boards:', e)
    } finally {
      setLoading(false)
    }
  }

  async function createBoard() {
    if (!newBoardName.trim()) return
    
    try {
      const res = await fetch('/api/kanban/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBoardName }),
      })
      
      if (res.ok) {
        setNewBoardName('')
        setShowNewBoard(false)
        fetchBoards()
      }
    } catch (e) {
      console.error('Failed to create board:', e)
    }
  }

  async function createTask(columnId: string, title: string) {
    try {
      const res = await fetch('/api/kanban/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_id: columnId, title }),
      })
      
      if (res.ok) {
        fetchBoards()
      }
    } catch (e) {
      console.error('Failed to create task:', e)
    }
  }

  async function updateTask(taskId: string, updates: Partial<Task>) {
    try {
      const res = await fetch('/api/kanban/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, ...updates }),
      })
      
      if (res.ok) {
        fetchBoards()
      }
    } catch (e) {
      console.error('Failed to update task:', e)
    }
  }

  async function moveTask(taskId: string, newColumnId: string, newPosition: number) {
    try {
      const res = await fetch('/api/kanban/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: taskId, 
          column_id: newColumnId, 
          position: newPosition 
        }),
      })
      
      if (res.ok) {
        fetchBoards()
      }
    } catch (e) {
      console.error('Failed to move task:', e)
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    const task = findTask(active.id as string)
    setActiveTask(task ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeTask = findTask(activeId)
    if (!activeTask) return

    // Check if dropping on a column
    const overColumn = activeBoard?.columns.find(c => c.id === overId)
    if (overColumn) {
      const maxPosition = Math.max(...overColumn.tasks.map(t => t.position), -1)
      moveTask(activeId, overId, maxPosition + 1)
      return
    }

    // Check if dropping on another task
    const overTask = findTask(overId)
    if (overTask && activeTask.column_id !== overTask.column_id) {
      moveTask(activeId, overTask.column_id, overTask.position)
    } else if (overTask && activeId !== overId) {
      // Reorder within same column
      const column = activeBoard?.columns.find(c => c.id === activeTask.column_id)
      if (column) {
        const oldIndex = column.tasks.findIndex(t => t.id === activeId)
        const newIndex = column.tasks.findIndex(t => t.id === overId)
        
        const newTasks = [...column.tasks]
        newTasks.splice(oldIndex, 1)
        newTasks.splice(newIndex, 0, activeTask)
        
        // Update positions
        newTasks.forEach((task, index) => {
          if (task.position !== index) {
            updateTask(task.id, { position: index })
          }
        })
      }
    }
  }

  function findTask(taskId: string): Task | undefined {
    for (const board of boards) {
      for (const column of board.columns) {
        const task = column.tasks.find(t => t.id === taskId)
        if (task) return task
      }
    }
    return undefined
  }

  if (loading) {
    return <div className="p-6 text-gray-400">Loading...</div>
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Layout className="w-6 h-6 text-highlight" />
          <h2 className="text-xl font-bold">Project Board</h2>
        </div>
        
        {boards.length > 0 && (
          <div className="flex items-center gap-2">
            {boards.map(board => (
              <button
                key={board.id}
                onClick={() => setActiveBoard(board)}
                className={`px-3 py-1 rounded text-sm ${
                  activeBoard?.id === board.id 
                    ? 'bg-highlight text-white' 
                    : 'bg-secondary hover:bg-accent'
                }`}
              >
                {board.name}
              </button>
            ))}
          </div>
        )}
        
        {showNewBoard ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder="Board name..."
              className="px-3 py-1 bg-secondary border border-gray-600 rounded text-sm text-white"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createBoard()}
            />
            <button
              onClick={createBoard}
              className="px-3 py-1 bg-highlight text-white rounded text-sm"
            >
              Create
            </button>
            <button
              onClick={() => setShowNewBoard(false)}
              className="px-3 py-1 bg-gray-600 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewBoard(true)}
            className="flex items-center gap-2 px-3 py-1 bg-secondary hover:bg-accent rounded text-sm"
          >
            <Plus className="w-4 h-4" />
            New Board
          </button>
        )}
      </div>

      {/* Board */}
      {activeBoard ? (
        <div className="flex-1 overflow-x-auto p-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 h-full">
              {activeBoard.columns
                .sort((a, b) => a.position - b.position)
                .map(column => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    onAddTask={(title) => createTask(column.id, title)}
                    onUpdateTask={(taskId, updates) => updateTask(taskId, updates)}
                  />
                ))}
            </div>

            <DragOverlay>
              {activeTask ? (
                <KanbanCard
                  task={activeTask}
                  isDragging
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Layout className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="mb-4">No boards yet. Create your first board to get started.</p>
            <button
              onClick={() => setShowNewBoard(true)}
              className="px-4 py-2 bg-highlight text-white rounded"
            >
              Create Board
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
