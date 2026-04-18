'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
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
  target_board_id?: string | null
  target_status?: 'intake' | 'ready' | 'backlog' | 'in_progress' | 'testing' | 'review' | 'blocked' | 'done'
  title: string
  description: string | null
  intake_brief?: string | null
  handoff_notes?: string | null
  refinement_source?: string | null
  refinement_summary?: string | null
  refined_at?: string | null
  checklist?: Array<{ title: string; completed: boolean; position: number }>
  column_name?: string | null
  position: number
  priority: 'low' | 'medium' | 'high' | 'urgent'
  labels: string
  assignee: string | null
  due_date: string | null
  canonical_task_id?: string | null
  project_id?: string | null
  related_repo?: string | null
  github_issue_number?: number | null
  github_issue_url?: string | null
  sync_status?: string | null
  sync_error?: string | null
  canonical_status?: string | null
  canonical_assigned_agent?: string | null
  claimed_by?: string | null
  current_worker?: string | null
  pipeline_state?: 'running' | 'idle' | 'done' | 'blocked' | string | null
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

function statusToColumnName(status: string | null | undefined): string | null {
  switch (status) {
    case 'backlog':
      return 'Backlog'
    case 'intake':
      return 'Intake'
    case 'ready':
      return 'Ready'
    case 'in_progress':
      return 'In Progress'
    case 'testing':
      return 'Testing'
    case 'review':
      return 'Review'
    case 'blocked':
      return 'Blocked'
    case 'done':
      return 'Done'
    default:
      return null
  }
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function boardDropId(boardId: string): string {
  return `board-tab:${boardId}`
}

function BoardTab({
  board,
  isActive,
  onSelect,
  onDelete,
}: {
  board: Board
  isActive: boolean
  onSelect: (boardId: string) => void
  onDelete: (boardId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: boardDropId(board.id),
  })

  return (
    <div key={board.id} ref={setNodeRef} className="flex items-center gap-1">
      <button
        onClick={() => onSelect(board.id)}
        className={`px-3 py-1 rounded text-sm transition-colors ${
          isActive
            ? 'bg-highlight text-white'
            : isOver
              ? 'bg-emerald-700 text-white'
              : 'bg-secondary hover:bg-accent'
        }`}
      >
        {board.name}
      </button>
      <button
        onClick={() => onDelete(board.id)}
        className="px-2 py-1 text-xs text-red-400 hover:bg-red-900/50 rounded"
        title="Board löschen"
      >
        ×
      </button>
    </div>
  )
}

export function KanbanBoard() {
  const [boards, setBoards] = useState<Board[]>([])
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const activeBoard = activeBoardId
    ? boards.find((board) => board.id === activeBoardId) || null
    : null
  const activeBoardStorageKey = 'rook-dashboard.active-board-id'

  function readStoredBoardId(): string | null {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(activeBoardStorageKey)
  }

  function writeStoredBoardId(boardId: string | null) {
    if (typeof window === 'undefined') return
    if (boardId) {
      window.localStorage.setItem(activeBoardStorageKey, boardId)
      return
    }
    window.localStorage.removeItem(activeBoardStorageKey)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  )

  useEffect(() => {
    setActiveBoardId(readStoredBoardId())
    fetchBoards()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchBoards()
    }, 5000)

    return () => window.clearInterval(timer)
  }, [])

  async function fetchBoards() {
    try {
      const res = await fetch('/api/kanban/boards')
      if (res.ok) {
        const data = await res.json()
        setBoards(data)
        setActiveBoardId((currentBoardId) => {
          if (data.length === 0) {
            writeStoredBoardId(null)
            return null
          }
          const preferredBoardId = currentBoardId || readStoredBoardId()
          if (preferredBoardId) {
            const hasPreferredBoard = data.some((board: Board) => board.id === preferredBoardId)
            if (hasPreferredBoard) {
              writeStoredBoardId(preferredBoardId)
              return preferredBoardId
            }
          }
          writeStoredBoardId(data[0].id)
          return data[0].id
        })
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

  async function deleteBoard(boardId: string) {
    if (!confirm('Board wirklich löschen? Alle Spalten und Tasks werden gelöscht.')) return
    
    try {
      const res = await fetch(`/api/kanban/boards?id=${boardId}`, {
        method: 'DELETE',
      })
      
      if (res.ok) {
        if (activeBoardId === boardId) {
          setActiveBoardId(null)
          writeStoredBoardId(null)
        }
        fetchBoards()
      }
    } catch (e) {
      console.error('Failed to delete board:', e)
    }
  }

  async function createTask(columnId: string, title: string, extraData: Partial<Task> = {}) {
    try {
      const res = await fetch('/api/kanban/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column_id: columnId, title, ...extraData }),
      })
      
      if (res.ok) {
        const json = await res.json().catch(() => null)
        if (json?.dispatch?.triggered && !json.dispatch.ok) {
          window.alert(
            `Ticket created, but auto-dispatch from Ready failed: ${json.dispatch.reason || 'unknown error'}`
          )
        }
        fetchBoards()
      } else {
        const json = await res.json().catch(() => null)
        window.alert(json?.error || 'Failed to create task.')
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
        const json = await res.json().catch(() => null)
        if (json?.dispatch?.triggered && !json.dispatch.ok) {
          window.alert(
            `Ticket moved to Ready, but auto-dispatch failed: ${json.dispatch.reason || 'unknown error'}`
          )
        }
        fetchBoards()
        return true
      } else {
        const json = await res.json().catch(() => null)
        window.alert(json?.error || 'Failed to update task.')
      }
    } catch (e) {
      console.error('Failed to update task:', e)
    }

    fetchBoards()
    return false
  }

  async function deleteTask(taskId: string) {
    try {
      const res = await fetch(`/api/kanban/tasks?id=${taskId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchBoards()
      }
    } catch (e) {
      console.error('Failed to delete task:', e)
    }
  }

  async function archiveTask(taskId: string) {
    try {
      const res = await fetch('/api/kanban/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      })

      if (res.ok) {
        fetchBoards()
      }
    } catch (e) {
      console.error('Failed to archive task:', e)
    }
  }

  async function moveTask(taskId: string, newColumnId: string, newPosition: number, taskSnapshot?: Task) {
    try {
      const res = await fetch('/api/kanban/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: taskId, 
          column_id: newColumnId, 
          position: newPosition,
          intake_brief: taskSnapshot?.intake_brief ?? null,
          handoff_notes: taskSnapshot?.handoff_notes ?? null,
          checklist: Array.isArray(taskSnapshot?.checklist) ? taskSnapshot?.checklist : undefined,
        }),
      })
      
      if (res.ok) {
        const json = await res.json().catch(() => null)
        const dispatchStatus = typeof json?.dispatch?.status === 'string' ? json.dispatch.status : null
        const dispatchColumnName = statusToColumnName(dispatchStatus)
        const dispatchColumn = dispatchColumnName
          ? activeBoard?.columns.find((column) => column.name === dispatchColumnName) || null
          : null

        if (json?.dispatch?.accepted && dispatchColumn) {
          const dispatchPosition = Math.max(...dispatchColumn.tasks.map((task) => task.position), -1) + 1
          applyTaskMoveLocally(taskId, dispatchColumn.id, dispatchPosition)
        }
        fetchBoards()
        return true
      } else {
        const json = await res.json().catch(() => null)
        window.alert(json?.error || 'Failed to move task.')
      }
    } catch (e) {
      console.error('Failed to move task:', e)
    }

    fetchBoards()
    return false
  }

  async function moveTaskToBoard(taskId: string, targetBoardId: string, taskSnapshot?: Task) {
    try {
      const res = await fetch('/api/kanban/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          target_board_id: targetBoardId,
          intake_brief: taskSnapshot?.intake_brief ?? null,
          handoff_notes: taskSnapshot?.handoff_notes ?? null,
          checklist: Array.isArray(taskSnapshot?.checklist) ? taskSnapshot?.checklist : undefined,
        }),
      })

      if (res.ok) {
        fetchBoards()
        return true
      }

      const json = await res.json().catch(() => null)
      window.alert(json?.error || 'Failed to move task to board.')
    } catch (e) {
      console.error('Failed to move task to board:', e)
    }

    fetchBoards()
    return false
  }

  function updateBoardState(transform: (board: Board) => Board) {
    setBoards((currentBoards) => currentBoards.map(transform))
  }

  function applyTaskMoveLocally(taskId: string, targetColumnId: string, targetPosition: number) {
    updateBoardState((board) => {
      const sourceColumn = board.columns.find((column) =>
        column.tasks.some((task) => task.id === taskId)
      )
      const destinationColumn = board.columns.find((column) => column.id === targetColumnId)

      if (!sourceColumn || !destinationColumn) {
        return board
      }

      const movingTask = sourceColumn.tasks.find((task) => task.id === taskId)
      if (!movingTask) {
        return board
      }

      const sourceTasks = sourceColumn.tasks
        .filter((task) => task.id !== taskId)
        .map((task, index) => ({ ...task, position: index }))

      const destinationBase =
        sourceColumn.id === destinationColumn.id ? sourceTasks : destinationColumn.tasks
      const insertAt = Math.max(0, Math.min(targetPosition, destinationBase.length))
      const destinationTasks = [...destinationBase]

      destinationTasks.splice(insertAt, 0, {
        ...movingTask,
        column_id: destinationColumn.id,
        position: insertAt,
      })

      const normalizedDestinationTasks = destinationTasks.map((task, index) => ({
        ...task,
        column_id: destinationColumn.id,
        position: index,
      }))

      return {
        ...board,
        columns: board.columns.map((column) => {
          if (column.id === sourceColumn.id && column.id === destinationColumn.id) {
            return { ...column, tasks: normalizedDestinationTasks }
          }

          if (column.id === sourceColumn.id) {
            return { ...column, tasks: sourceTasks }
          }

          if (column.id === destinationColumn.id) {
            return { ...column, tasks: normalizedDestinationTasks }
          }

          return column
        }),
      }
    })
  }

  function applyTaskMoveToBoardLocally(taskId: string, targetBoardId: string) {
    const targetBoard = boards.find((board) => board.id === targetBoardId) || null
    const targetBacklogColumn = targetBoard?.columns.find((column) => normalizeName(column.name) === 'backlog') || null

    if (!targetBacklogColumn) {
      return
    }

    updateBoardState((board) => {
      const sourceColumn = board.columns.find((column) =>
        column.tasks.some((task) => task.id === taskId)
      )

      if (!sourceColumn) {
        return board
      }

      const movingTask = sourceColumn.tasks.find((task) => task.id === taskId)
      if (!movingTask) {
        return board
      }

      const sourceTasks = sourceColumn.tasks
        .filter((task) => task.id !== taskId)
        .map((task, index) => ({ ...task, position: index }))

      if (board.id !== targetBoardId) {
        if (board.id !== sourceColumn.board_id) {
          return board
        }

        return {
          ...board,
          columns: board.columns.map((column) => (
            column.id === sourceColumn.id
              ? { ...column, tasks: sourceTasks }
              : column
          )),
        }
      }

      return {
        ...board,
        columns: board.columns.map((column) => {
          if (column.id !== targetBacklogColumn.id) {
            return column
          }

          const nextTasks = [
            ...column.tasks,
            {
              ...movingTask,
              column_id: targetBacklogColumn.id,
              column_name: targetBacklogColumn.name,
              position: column.tasks.length,
            },
          ].map((task, index) => ({
            ...task,
            column_id: targetBacklogColumn.id,
            column_name: targetBacklogColumn.name,
            position: index,
          }))

          return { ...column, tasks: nextTasks }
        }),
      }
    })
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

    if (overId.startsWith('board-tab:')) {
      const targetBoardId = overId.replace(/^board-tab:/, '')
      const sourceBoard = boards.find((board) =>
        board.columns.some((column) => column.id === activeTask.column_id)
      ) || null

      if (!targetBoardId || sourceBoard?.id === targetBoardId) {
        return
      }

      applyTaskMoveToBoardLocally(activeId, targetBoardId)
      moveTaskToBoard(activeId, targetBoardId, activeTask)
      return
    }

    // Find over item (could be column or task)
    const overColumnId = findColumnId(overId)
    if (!overColumnId) return

    // If dropping on same column and same position, do nothing
    if (overColumnId === activeTask.column_id) {
      // Check if it's just a reorder
      const overTask = findTask(overId)
      if (overTask && overTask.id !== activeId) {
        // Same column reorder
        const column = activeBoard?.columns.find(c => c.id === overColumnId)
        if (column) {
          const oldIndex = column.tasks.findIndex(t => t.id === activeId)
          const newIndex = column.tasks.findIndex(t => t.id === overId)
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const newTasks = [...column.tasks]
            newTasks.splice(oldIndex, 1)
            newTasks.splice(newIndex, 0, activeTask)
            applyTaskMoveLocally(activeId, overColumnId, newIndex)
            newTasks.forEach((task, index) => {
              if (task.position !== index) {
                updateTask(task.id, { position: index })
              }
            })
          }
        }
      }
      return
    }

    // Cross-column move
    const targetColumn = activeBoard?.columns.find(c => c.id === overColumnId)
    if (targetColumn) {
      const maxPosition = Math.max(...targetColumn.tasks.map(t => t.position), -1)
      applyTaskMoveLocally(activeId, overColumnId, maxPosition + 1)
      moveTask(activeId, overColumnId, maxPosition + 1, activeTask)
    }
  }

  function findColumnId(itemId: string): string | null {
    // Check if it's a column
    for (const board of boards) {
      const column = board.columns.find(c => c.id === itemId)
      if (column) return column.id
    }
    // Check if it's a task
    for (const board of boards) {
      for (const column of board.columns) {
        const task = column.tasks.find(t => t.id === itemId)
        if (task) return column.id
      }
    }
    return null
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Layout className="w-6 h-6 text-highlight" />
            <h2 className="text-xl font-bold">Project Board</h2>
          </div>
          
          {boards.length > 0 && (
            <div className="flex items-center gap-2">
              {boards.map((board) => (
                <BoardTab
                  key={board.id}
                  board={board}
                  isActive={activeBoard?.id === board.id}
                  onSelect={(boardId) => {
                    setActiveBoardId(boardId)
                    writeStoredBoardId(boardId)
                  }}
                  onDelete={deleteBoard}
                />
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  fetch('/api/kanban/sync', { method: 'POST' })
                    .then(r => { if (r.ok) fetchBoards() })
                    .catch(console.error)
                }}
                className="flex items-center gap-2 px-3 py-1 bg-secondary hover:bg-accent rounded text-sm"
                title="Trigger manual reconcile from canonical files"
              >
                <Plus className="w-4 h-4" />
                Sync
              </button>
              <button
                onClick={() => setShowNewBoard(true)}
                className="flex items-center gap-2 px-3 py-1 bg-secondary hover:bg-accent rounded text-sm"
              >
                <Plus className="w-4 h-4" />
                New Board
              </button>
            </div>
          )}
        </div>

        {/* Board */}
        {activeBoard ? (
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-4 h-full">
              {activeBoard.columns
                .sort((a, b) => a.position - b.position)
                .map(column => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    boards={boards.map((board) => ({ id: board.id, name: board.name }))}
                    onAddTask={(colId, title, data) => createTask(colId, title, data)}
                    onUpdateTask={(taskId, updates) => updateTask(taskId, updates)}
                    onDeleteTask={(taskId) => deleteTask(taskId)}
                    onArchiveTask={(taskId) => archiveTask(taskId)}
                  />
                ))}
            </div>
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

        <DragOverlay>
          {activeTask ? (
            <KanbanCard
              task={activeTask}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  )
}
