'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import { TaskModal } from './TaskModal'

interface Task {
  id: string
  column_id: string
  target_status?: 'intake' | 'ready' | 'backlog' | 'in_progress' | 'testing' | 'review' | 'blocked' | 'done'
  title: string
  description: string | null
  intake_brief?: string | null
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
  subtask_count?: number
  subtask_done?: number
  canonical_status?: string | null
  canonical_assigned_agent?: string | null
  commit_count?: number
  pr_state?: 'open' | 'closed' | 'merged' | null
  pr_number?: number | null
  test_status?: 'passed' | 'failed' | null
  review_verdict?: 'approved' | 'changes_requested' | null
  has_handoff_notes?: boolean
  claimed_by?: string | null
  current_worker?: string | null
  pipeline_state?: 'running' | 'idle' | 'done' | 'blocked' | string | null
}

interface Props {
  task: Task
  isDragging?: boolean
  onUpdate?: (taskId: string, updates: Partial<Task>) => void
  onDelete?: (taskId: string) => void
  onArchive?: (taskId: string) => void
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
  test: '🧪 Test',
  review: '🔍 Review',
  health: '💪 Health',
  consultant: '💼 Consultant',
}

const SYNC_STATUS_CLASSES: Record<string, string> = {
  synced: 'bg-green-900/50 text-green-300',
  error: 'bg-red-900/50 text-red-300',
  not_requested: 'bg-gray-700 text-gray-300',
  pending: 'bg-amber-900/50 text-amber-300',
  local_only: 'bg-gray-700 text-gray-300',
}

function normalizeTestStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'pass') return 'passed'
  if (normalized === 'passed' || normalized === 'failed') return normalized
  return null
}

function normalizeReviewVerdict(verdict: string | null | undefined) {
  const normalized = String(verdict || '').trim().toLowerCase()
  if (normalized === 'pass') return 'approved'
  if (normalized === 'approved' || normalized === 'changes_requested') return normalized
  return null
}

export function KanbanCard({ task, isDragging, onUpdate, onDelete, onArchive }: Props) {
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

  let labels: string[] = []
  try {
    if (task.labels && task.labels !== '[]') {
      const parsed = JSON.parse(task.labels)
      labels = Array.isArray(parsed) ? parsed : []
    }
  } catch (e) {
    labels = []
  }
  const isOverdue = task.due_date && new Date(task.due_date) < new Date()
  const normalizedTestStatus = normalizeTestStatus(task.test_status)
  const normalizedReviewVerdict = normalizeReviewVerdict(task.review_verdict)

  const priorityBorder = {
    low: 'border-l-gray-400',
    medium: 'border-l-blue-500',
    high: 'border-l-orange-500',
    urgent: 'border-l-red-500',
  }[task.priority]

  const runtimeBadge = (() => {
    if (task.pipeline_state === 'running' && task.current_worker) {
      return {
        className: 'bg-emerald-900/50 text-emerald-300',
        text: `Running: ${ASSIGNEE_NAMES[task.current_worker] || task.current_worker}`,
      }
    }

    if (task.pipeline_state === 'blocked') {
      return {
        className: 'bg-red-900/50 text-red-300',
        text: 'Pipeline blocked',
      }
    }

    if (task.pipeline_state === 'done') {
      return {
        className: 'bg-sky-900/50 text-sky-300',
        text: 'Pipeline complete',
      }
    }

    return {
      className: 'bg-gray-700 text-gray-300',
      text: 'Pipeline idle',
    }
  })()

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`bg-secondary rounded p-3 border border-gray-700 border-l-4 ${priorityBorder} cursor-pointer hover:border-highlight ${
          isDragging ? 'shadow-lg' : ''
        } ${isSortableDragging ? 'opacity-50' : ''} touch-none`}
        onClick={() => setShowModal(true)}
      >
        <div className="flex items-start gap-2">
          <button
            className="mt-1 p-1 hover:bg-accent rounded cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
            type="button"
            aria-label="Drag ticket"
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

                <span className={`text-xs px-1.5 py-0.5 rounded ${runtimeBadge.className}`}>
                  {runtimeBadge.text}
                </span>

                {task.canonical_assigned_agent && (
                  <span className="text-xs bg-slate-800 text-slate-200 px-1.5 py-0.5 rounded">
                    Stage owner: {ASSIGNEE_NAMES[task.canonical_assigned_agent] || task.canonical_assigned_agent}
                  </span>
                )}

                {task.commit_count ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-950/50 text-blue-300">
                    {task.commit_count} commit{task.commit_count === 1 ? '' : 's'}
                  </span>
                ) : null}

                {task.pr_state ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    task.pr_state === 'merged'
                      ? 'bg-green-900/50 text-green-300'
                      : task.pr_state === 'open'
                        ? 'bg-amber-900/50 text-amber-300'
                        : 'bg-gray-700 text-gray-300'
                  }`}>
                    {task.pr_state === 'merged'
                      ? `PR merged${task.pr_number ? ` #${task.pr_number}` : ''}`
                      : task.pr_state === 'open'
                        ? `PR open${task.pr_number ? ` #${task.pr_number}` : ''}`
                        : 'PR closed'}
                  </span>
                ) : null}

                {normalizedTestStatus ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    normalizedTestStatus === 'passed'
                      ? 'bg-green-900/50 text-green-300'
                      : 'bg-red-900/50 text-red-300'
                  }`}>
                    Tests {normalizedTestStatus}
                  </span>
                ) : null}

                {normalizedReviewVerdict ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    normalizedReviewVerdict === 'approved'
                      ? 'bg-green-900/50 text-green-300'
                      : 'bg-red-900/50 text-red-300'
                  }`}>
                    Review {normalizedReviewVerdict === 'approved' ? 'approved' : 'changes requested'}
                  </span>
                ) : null}

                {task.has_handoff_notes ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-sky-900/50 text-sky-300">
                    Handoff
                  </span>
                ) : null}

                {task.github_issue_number ? (
                  <a
                    href={task.github_issue_url || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    GH #{task.github_issue_number}
                  </a>
                ) : (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${SYNC_STATUS_CLASSES[task.sync_status || 'not_requested'] || SYNC_STATUS_CLASSES.not_requested}`}
                  >
                    {task.sync_status === 'error' ? 'GitHub error' : 'GitHub pending'}
                  </span>
                )}

                {task.related_repo && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono">
                    {task.related_repo.split('/').at(-1)}
                  </span>
                )}
                
                {/* Subtask Progress */}
                {task.subtask_count !== undefined && task.subtask_count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${
                    task.subtask_done === task.subtask_count 
                      ? 'bg-green-900/50 text-green-400' 
                      : 'bg-accent text-gray-400'
                  }`}>
                    ☑ {task.subtask_done}/{task.subtask_count}
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
        onArchive={onArchive ? () => {
          onArchive(task.id)
          setShowModal(false)
        } : undefined}
      />
    </>
  )
}
