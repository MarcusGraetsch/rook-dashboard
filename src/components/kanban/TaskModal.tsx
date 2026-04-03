'use client'

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isBefore, startOfDay } from 'date-fns'
import { de } from 'date-fns/locale'
import { SubTaskList } from './SubTaskList'

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
  commit_count?: number
  pr_state?: 'open' | 'closed' | 'merged' | null
  pr_number?: number | null
  test_status?: 'passed' | 'failed' | null
  test_commands?: string[]
  test_summary?: string | null
  review_verdict?: 'approved' | 'changes_requested' | null
  review_summary?: string | null
  has_handoff_notes?: boolean
  handoff_notes?: string | null
  failure_reason?: string | null
}

interface ProjectOption {
  project_id: string
  name: string
  related_repo: string
  type: string
}

interface TaskGitContext {
  branch: string
  related_repo: string
  branch_exists: boolean
  activity_status: 'planned' | 'branch_pushed' | 'commits_pushed' | 'pr_open' | 'merged' | 'error'
  issue?: {
    repo: string
    number: number | null
    url: string | null
    state: 'open' | 'closed' | null
    sync_status: 'not_requested' | 'pending' | 'synced' | 'error'
    last_synced_at: string | null
    last_error: string | null
  } | null
  pull_request?: {
    number: number | null
    url: string | null
    state: 'open' | 'closed' | 'merged' | null
    title: string | null
  } | null
  commits: Array<{
    sha: string
    short_sha: string
    message: string
    url: string | null
    committed_at: string | null
  }>
}

const GIT_ACTIVITY_LABELS: Record<TaskGitContext['activity_status'], string> = {
  planned: 'Planned only',
  branch_pushed: 'Branch pushed',
  commits_pushed: 'Commits pushed',
  pr_open: 'PR open',
  merged: 'Merged',
  error: 'Git lookup error',
}

const GIT_ACTIVITY_CLASSES: Record<TaskGitContext['activity_status'], string> = {
  planned: 'bg-gray-700 text-gray-300',
  branch_pushed: 'bg-sky-900/50 text-sky-300',
  commits_pushed: 'bg-blue-900/50 text-blue-300',
  pr_open: 'bg-amber-900/50 text-amber-300',
  merged: 'bg-green-900/50 text-green-300',
  error: 'bg-red-900/50 text-red-300',
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

interface Props {
  task: Task | null
  isOpen: boolean
  onClose: () => void
  onSave: (task: Partial<Task>) => void
  onDelete?: () => void
  onArchive?: () => void
}

interface ChecklistDraftItem {
  title: string
  completed: boolean
  position: number
}

const AGENTS = [
  { id: 'rook', name: 'Rook 🦅' },
  { id: 'coach', name: 'Coach 🧠' },
  { id: 'engineer', name: 'Engineer 🛠️' },
  { id: 'researcher', name: 'Researcher 📚' },
  { id: 'health', name: 'Health 💪' },
  { id: 'consultant', name: 'Consultant 💼' },
]

const PRIORITY_COLORS = {
  low: 'bg-gray-500',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
}

function DatePicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [month, setMonth] = useState(value ? new Date(value) : new Date())
  const ref = useRef<HTMLDivElement>(null)

  const days = eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  })

  // Pad start with empty cells
  const firstDayOfMonth = startOfMonth(month).getDay()
  const emptyCells = Array(firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1).fill(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const today = startOfDay(new Date())

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value ? format(new Date(value), 'dd.MM.yyyy') : ''}
        onFocus={() => setIsOpen(true)}
        readOnly
        placeholder="Datum wählen..."
        className="w-full px-3 py-2 bg-primary border border-gray-600 rounded text-white cursor-pointer"
      />
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-secondary border border-gray-600 rounded-lg shadow-xl z-50 p-3 w-64">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1))}
              className="p-1 hover:bg-accent rounded"
            >
              ‹
            </button>
            <span className="font-medium">
              {format(month, 'MMMM yyyy', { locale: de })}
            </span>
            <button
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1))}
              className="p-1 hover:bg-accent rounded"
            >
              ›
            </button>
          </div>
          
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1 text-center text-xs text-gray-400">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
              <div key={d}>{d}</div>
            ))}
          </div>
          
          {/* Days */}
          <div className="grid grid-cols-7 gap-1">
            {emptyCells.map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map(day => {
              const isPast = isBefore(day, today)
              const isSelected = value && isSameDay(day, new Date(value))
              
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(day.toISOString())
                    setIsOpen(false)
                  }}
                  disabled={isPast && !value}
                  className={`
                    p-1 text-sm rounded
                    ${isSelected ? 'bg-highlight text-white' : ''}
                    ${isToday(day) && !isSelected ? 'ring-1 ring-highlight' : ''}
                    ${isPast && !isSelected ? 'text-gray-600' : 'hover:bg-accent'}
                  `}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
          
          {/* Quick buttons */}
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-600">
            <button
              type="button"
              onClick={() => { onChange(addDays(today, 1).toISOString()); setIsOpen(false) }}
              className="text-xs px-2 py-1 bg-accent rounded hover:bg-accent/80"
            >
              Morgen
            </button>
            <button
              type="button"
              onClick={() => { onChange(addDays(today, 7).toISOString()); setIsOpen(false) }}
              className="text-xs px-2 py-1 bg-accent rounded hover:bg-accent/80"
            >
              +7 Tage
            </button>
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false) }}
              className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"
            >
              Leeren
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function TaskModal({ task, isOpen, onClose, onSave, onDelete, onArchive }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [intakeBrief, setIntakeBrief] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [labels, setLabels] = useState('')
  const [assignee, setAssignee] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [projectId, setProjectId] = useState('')
  const [relatedRepo, setRelatedRepo] = useState('')
  const [handoffNotes, setHandoffNotes] = useState('')
  const [draftChecklist, setDraftChecklist] = useState<ChecklistDraftItem[]>([])
  const [refinementLoading, setRefinementLoading] = useState(false)
  const [refinementError, setRefinementError] = useState<string | null>(null)
  const [refinementSummary, setRefinementSummary] = useState<string | null>(null)
  const [refinementSource, setRefinementSource] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [gitContext, setGitContext] = useState<TaskGitContext | null>(null)
  const [gitContextLoading, setGitContextLoading] = useState(false)
  const [gitContextError, setGitContextError] = useState<string | null>(null)

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setIntakeBrief(task.intake_brief || task.description || task.title)
      setPriority(task.priority)
      setLabels(task.labels ? JSON.parse(task.labels).join(', ') : '')
      setAssignee(task.assignee || '')
      setDueDate(task.due_date || '')
      setProjectId(task.project_id || '')
      setRelatedRepo(task.related_repo || '')
      setHandoffNotes(task.handoff_notes || '')
      setDraftChecklist(Array.isArray(task.checklist) ? task.checklist : [])
      setRefinementSource(task.refinement_source || null)
      setRefinementSummary(task.refinement_summary || (task.refinement_source ? `Last refinement source: ${task.refinement_source}` : null))
    } else {
      setTitle('')
      setDescription('')
      setIntakeBrief('')
      setPriority('medium')
      setLabels('')
      setAssignee('')
      setDueDate('')
      setProjectId('')
      setRelatedRepo('')
      setHandoffNotes('')
      setDraftChecklist([])
      setRefinementSource(null)
      setRefinementSummary(null)
    }
    setRefinementError(null)
    setRefinementLoading(false)
  }, [task?.id, isOpen])

  useEffect(() => {
    let cancelled = false

    async function loadProjects() {
      try {
        const res = await fetch('/api/control/projects')
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json.error || 'Failed to load projects.')
        }
        if (!cancelled) {
          setProjects(Array.isArray(json.projects) ? json.projects : [])
        }
      } catch (error) {
        if (!cancelled) {
          setProjects([])
        }
      }
    }

    if (isOpen) {
      loadProjects()
    }

    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    let cancelled = false

    async function loadGitContext() {
      if (!isOpen || !task?.canonical_task_id) {
        setGitContext(null)
        setGitContextError(null)
        setGitContextLoading(false)
        return
      }

      setGitContextLoading(true)
      setGitContextError(null)

      try {
        const params = new URLSearchParams({ task_id: task.canonical_task_id })
        if (task.project_id) {
          params.set('project_id', task.project_id)
        }
        const res = await fetch(`/api/control/tasks/git?${params.toString()}`)
        const json = await res.json()

        if (!res.ok) {
          throw new Error(json.error || 'Failed to load git context.')
        }

        if (!cancelled) {
          setGitContext(json.context || null)
        }
      } catch (error: any) {
        if (!cancelled) {
          setGitContext(null)
          setGitContextError(error?.message || 'Failed to load git context.')
        }
      } finally {
        if (!cancelled) {
          setGitContextLoading(false)
        }
      }
    }

    loadGitContext()

    return () => {
      cancelled = true
    }
  }, [task?.canonical_task_id, task?.project_id, isOpen])

  if (!isOpen) return null

  const isDoneTask = task?.column_name?.toLowerCase() === 'done'
  const selectedProject = projects.find((project) => project.project_id === projectId) || null
  const hasCommits = (gitContext?.commits?.length || 0) > 0
  const normalizedTestStatus = normalizeTestStatus(task?.test_status)
  const normalizedReviewVerdict = normalizeReviewVerdict(task?.review_verdict)
  const gitActivityStatus =
    gitContext?.activity_status === 'error' && (gitContext?.pull_request?.state === 'merged' || task?.pr_state === 'merged' || isDoneTask)
      ? 'merged'
      : (gitContext?.activity_status || 'planned')
  const evidenceState = {
    handoff: Boolean(task?.has_handoff_notes),
    commits: hasCommits,
    pr: Boolean(gitContext?.pull_request?.number),
    tests: normalizedTestStatus === 'passed',
    review: normalizedReviewVerdict === 'approved',
  }

  async function handleRefine() {
    const brief = intakeBrief.trim() || description.trim() || title.trim()
    if (!brief) {
      setRefinementError('Enter a rough brief first.')
      return
    }

    setRefinementLoading(true)
    setRefinementError(null)

    try {
      const res = await fetch('/api/control/tasks/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          intake_brief: brief,
          project_id: projectId || null,
          related_repo: relatedRepo || selectedProject?.related_repo || task?.related_repo || null,
          priority,
          assignee: assignee || null,
          labels: labels.split(',').map((label) => label.trim()).filter(Boolean),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Refinement failed.')
      }

      const refinement = json.refinement
      setTitle(refinement.title || title)
      setDescription(refinement.description || description)
      setIntakeBrief(refinement.intake_brief || brief)
      setPriority(refinement.priority || priority)
      setAssignee(refinement.assignee || '')
      setLabels(Array.isArray(refinement.labels) ? refinement.labels.join(', ') : labels)
      if (refinement.project_id) {
        setProjectId(refinement.project_id)
      }
      if (refinement.related_repo) {
        setRelatedRepo(refinement.related_repo)
        const matchedProject = projects.find((project) => project.related_repo === refinement.related_repo)
        if (matchedProject) {
          setProjectId(matchedProject.project_id)
        }
      }
      if (Array.isArray(refinement.checklist)) {
        setDraftChecklist(refinement.checklist)
      }
      setRefinementSource(refinement.refinement_source || null)
      setRefinementSummary(refinement.refinement_summary || 'Ticket refined.')
    } catch (error: any) {
      setRefinementError(error?.message || 'Refinement failed.')
    } finally {
      setRefinementLoading(false)
    }
  }

  function handleSave() {
    if (!title.trim()) return
    
    const labelArray = labels.split(',').map(l => l.trim()).filter(l => l)
    
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      labels: JSON.stringify(labelArray),
      assignee: assignee || null,
      due_date: dueDate || null,
      intake_brief: intakeBrief.trim() || null,
      refinement_source: refinementSource || null,
      refinement_summary: refinementSummary || null,
      refined_at: refinementSource ? (task?.refined_at || new Date().toISOString()) : null,
      project_id: projectId || null,
      related_repo: relatedRepo || selectedProject?.related_repo || task?.related_repo || null,
      handoff_notes: handoffNotes.trim() || null,
      checklist: draftChecklist,
    })
  }

  function handleSendToIntake() {
    if (!title.trim()) return

    const labelArray = labels.split(',').map(l => l.trim()).filter(l => l)
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      labels: JSON.stringify(labelArray),
      assignee: assignee || 'coach',
      due_date: dueDate || null,
      intake_brief: intakeBrief.trim() || description.trim() || title.trim(),
      refinement_source: refinementSource || null,
      refinement_summary: refinementSummary || null,
      refined_at: refinementSource ? (task?.refined_at || new Date().toISOString()) : null,
      project_id: projectId || null,
      related_repo: relatedRepo || selectedProject?.related_repo || task?.related_repo || null,
      handoff_notes: handoffNotes.trim() || null,
      checklist: draftChecklist,
      target_status: 'intake',
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-secondary rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-600">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-bold">{task ? 'Ticket bearbeiten' : 'Neues Ticket'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Titel *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ticket-Titel..."
              className="w-full px-3 py-2 bg-primary border border-gray-600 rounded text-white"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>
          
          {/* Description */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Beschreibung</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detaillierte Beschreibung..."
              className="w-full px-3 py-2 bg-primary border border-gray-600 rounded text-white h-24 resize-none"
            />
          </div>

          <div className="rounded border border-blue-900/50 bg-blue-950/20 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-blue-200">AI Ticket Intake</p>
                <p className="text-xs text-blue-300/80">Paste rough notes here, then let the system turn them into a structured ticket before moving it to `ready`.</p>
              </div>
              <button
                type="button"
                onClick={handleRefine}
                disabled={refinementLoading}
                className="px-3 py-2 rounded bg-blue-700 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {refinementLoading ? 'Refining...' : 'Refine Ticket'}
              </button>
            </div>
            <textarea
              value={intakeBrief}
              onChange={(e) => setIntakeBrief(e.target.value)}
              placeholder="Write the ticket in plain words. The refiner will turn it into a clearer title, description, repo suggestion, and checklist."
              className="w-full px-3 py-2 bg-primary border border-gray-600 rounded text-white h-24 resize-none"
            />
            {(refinementSummary || refinementError) && (
              <div className="text-xs">
                {refinementSummary && (
                  <p className="text-blue-200">
                    {refinementSummary}
                    {refinementSource && <span className="text-blue-300/70"> ({refinementSource})</span>}
                  </p>
                )}
                {refinementError && <p className="text-red-300">{refinementError}</p>}
              </div>
            )}
          </div>
          
          {/* Priority & Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Priorität</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task['priority'])}
                className={`w-full px-3 py-2 rounded text-white ${PRIORITY_COLORS[priority]}`}
              >
                <option value="low">🩶 Low</option>
                <option value="medium">🔵 Medium</option>
                <option value="high">🟠 High</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Fällig am</label>
              <DatePicker value={dueDate} onChange={setDueDate} />
            </div>
          </div>
          
          {/* Assignee */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Agent</label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full px-3 py-2 bg-primary border border-gray-600 rounded text-white"
            >
              <option value="">— Kein Agent —</option>
              {AGENTS.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Project Registry Entry</label>
              <select
                value={projectId}
                onChange={(e) => {
                  const nextProjectId = e.target.value
                  setProjectId(nextProjectId)
                  const nextProject = projects.find((project) => project.project_id === nextProjectId) || null
                  setRelatedRepo(nextProject?.related_repo || '')
                }}
                className="w-full px-3 py-2 bg-primary border border-gray-600 rounded text-white"
              >
                <option value="">Auto-detect from board</option>
                {projects.map((project) => (
                  <option key={project.project_id} value={project.project_id}>
                    {project.name} ({project.project_id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Target Repo</label>
              <select
                value={relatedRepo}
                onChange={(e) => {
                  const nextRepo = e.target.value
                  setRelatedRepo(nextRepo)
                  const matchedProject = projects.find((project) => project.related_repo === nextRepo) || null
                  if (matchedProject) {
                    setProjectId(matchedProject.project_id)
                  }
                }}
                className="w-full px-3 py-2 bg-primary border border-gray-600 rounded text-white"
              >
                <option value="">Select target repo</option>
                {projects.map((project) => (
                  <option key={project.related_repo} value={project.related_repo}>
                    {project.related_repo}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Repos come from `/root/.openclaw/workspace/operations/projects/projects.json`. Add a new entry there when you want Kanban to target another repository.
          </p>
          
          {/* Labels */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Labels (kommagetrennt)</label>
            <input
              type="text"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              placeholder="research, urgent, bug..."
              className="w-full px-3 py-2 bg-primary border border-gray-600 rounded text-white"
            />
            {labels && (
              <div className="flex flex-wrap gap-1 mt-2">
                {labels.split(',').map(l => l.trim()).filter(l => l).map((label, i) => (
                  <span key={i} className="text-xs px-2 py-1 bg-accent rounded">{label}</span>
                ))}
              </div>
            )}
          </div>

          {draftChecklist.length > 0 && (
            <div className="pt-4 border-t border-gray-700 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm text-gray-400">Generated Checklist</label>
                <span className="text-xs text-gray-500">{draftChecklist.length} items</span>
              </div>
              <div className="space-y-2">
                {draftChecklist.map((item) => (
                  <div key={`${item.position}-${item.title}`} className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-200">
                    {item.title}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                The checklist is a draft until you click `Speichern`.
              </p>
            </div>
          )}

          <p className="text-xs text-gray-500">
            `Ready` is now gated: the ticket needs a non-empty intake brief and at least one checklist item before it can move out of intake/planning.
          </p>

          {task && (
            <div className="pt-4 border-t border-gray-700 space-y-4">
              <h4 className="text-sm font-semibold text-gray-300">Delivery Evidence</h4>

              <div className="grid grid-cols-5 gap-2 text-xs">
                <div className={`rounded px-2 py-2 text-center ${evidenceState.handoff ? 'bg-sky-900/50 text-sky-300' : 'bg-gray-800 text-gray-400'}`}>
                  Engineer
                </div>
                <div className={`rounded px-2 py-2 text-center ${evidenceState.commits ? 'bg-blue-900/50 text-blue-300' : 'bg-gray-800 text-gray-400'}`}>
                  Commits
                </div>
                <div className={`rounded px-2 py-2 text-center ${evidenceState.pr ? 'bg-amber-900/50 text-amber-300' : 'bg-gray-800 text-gray-400'}`}>
                  PR
                </div>
                <div className={`rounded px-2 py-2 text-center ${evidenceState.tests ? 'bg-green-900/50 text-green-300' : 'bg-gray-800 text-gray-400'}`}>
                  Tests
                </div>
                <div className={`rounded px-2 py-2 text-center ${evidenceState.review ? 'bg-green-900/50 text-green-300' : 'bg-gray-800 text-gray-400'}`}>
                  Review
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Canonical Task</p>
                  <p className="font-mono text-xs">{task.canonical_task_id || 'Pending'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Project</p>
                  <p>{task.project_id || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Repo</p>
                  <p className="font-mono text-xs">{task.related_repo || 'Not mapped'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Branch</p>
                  <p className="font-mono text-xs break-all">{gitContext?.branch || 'Pending'}</p>
                </div>
                <div>
                  <p className="text-gray-500">GitHub Sync</p>
                  <p>{task.sync_status || 'pending'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Git Activity</p>
                  <span
                    className={`inline-block rounded px-2 py-1 text-xs ${GIT_ACTIVITY_CLASSES[gitActivityStatus]}`}
                  >
                    {GIT_ACTIVITY_LABELS[gitActivityStatus]}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Engineer Handoff</p>
                  <p className={task.has_handoff_notes ? 'text-sky-300' : 'text-gray-300'}>
                    {task.has_handoff_notes ? 'Present in canonical task' : 'Missing'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Commit Evidence</p>
                  <p className={hasCommits ? 'text-blue-300' : 'text-gray-300'}>
                    {hasCommits ? `${gitContext?.commits.length || 0} commit(s) on branch` : 'No pushed commits detected'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Test Evidence</p>
                  <p className={normalizedTestStatus === 'passed' ? 'text-green-300' : normalizedTestStatus === 'failed' ? 'text-red-300' : 'text-gray-300'}>
                    {normalizedTestStatus === 'passed'
                      ? 'Passed'
                      : normalizedTestStatus === 'failed'
                        ? 'Failed'
                        : 'No recorded test result'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Review Verdict</p>
                  <p className={normalizedReviewVerdict === 'approved' ? 'text-green-300' : normalizedReviewVerdict === 'changes_requested' ? 'text-red-300' : 'text-gray-300'}>
                    {normalizedReviewVerdict === 'approved'
                      ? 'Approved'
                      : normalizedReviewVerdict === 'changes_requested'
                        ? 'Changes requested'
                        : 'No recorded review verdict'}
                  </p>
                </div>
              </div>

              {task.failure_reason && (
                <div className="rounded border border-red-900/50 bg-red-950/20 px-3 py-3 text-sm">
                  <p className="text-red-300 font-medium">Failure Reason</p>
                  <p className="mt-1 text-red-200">{task.failure_reason}</p>
                </div>
              )}

              {task.handoff_notes && (
                <div className="text-sm space-y-2">
                  <p className="text-gray-500">Engineer Handoff Notes</p>
                  <div className="rounded border border-gray-700 px-3 py-3 text-gray-200 whitespace-pre-wrap">
                    {task.handoff_notes}
                  </div>
                </div>
              )}

              <div className="text-sm space-y-2">
                <label className="block text-gray-500">Update Handoff Notes</label>
                <textarea
                  value={handoffNotes}
                  onChange={(e) => setHandoffNotes(e.target.value)}
                  placeholder="What changed, what was validated, and any handoff notes for the next stage..."
                  className="w-full px-3 py-2 bg-primary border border-gray-600 rounded text-white h-28 resize-none"
                />
                <p className="text-xs text-gray-500">
                  Engineer-stage completion requires `handoff_notes`. Use this to recover blocked tasks after the implementation is already done.
                </p>
              </div>

              <div className="text-sm">
                <p className="text-gray-500">GitHub Issue</p>
                {task.github_issue_number ? (
                  task.github_issue_url ? (
                    <a
                      href={task.github_issue_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-300 hover:underline break-all"
                    >
                      #{task.github_issue_number} {task.github_issue_url}
                    </a>
                  ) : (
                    <p>#{task.github_issue_number}</p>
                  )
                ) : (
                  <p className="text-gray-300">Will be synced automatically after save.</p>
                )}
              </div>

              {task.sync_error && (
                <div className="text-sm">
                  <p className="text-gray-500">Last Sync Error</p>
                  <p className="text-red-300">{task.sync_error}</p>
                </div>
              )}

              <div className="text-sm space-y-2">
                <p className="text-gray-500">Pull Request</p>
                {gitContextLoading ? (
                  <p className="text-gray-300">Loading branch and PR context...</p>
                ) : gitContext?.pull_request?.number && gitContext.pull_request.url ? (
                  <a
                    href={gitContext.pull_request.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-300 hover:underline break-all"
                  >
                    PR #{gitContext.pull_request.number} {gitContext.pull_request.title || ''}
                  </a>
                ) : (
                  <p className="text-gray-300">
                    {gitContext?.activity_status === 'planned'
                      ? 'No Git activity yet. This task exists in planning, but no branch has been pushed.'
                      : gitContext?.activity_status === 'branch_pushed' || gitContext?.activity_status === 'commits_pushed'
                        ? 'No pull request linked to this branch yet.'
                        : 'No pull request linked to this branch yet.'}
                  </p>
                )}
                {gitContext?.pull_request?.state && (
                  <p className="text-xs text-gray-400">State: {gitContext.pull_request.state}</p>
                )}
                {gitContextError && gitActivityStatus === 'error' && <p className="text-red-300">{gitContextError}</p>}
              </div>

              <div className="text-sm space-y-2">
                <p className="text-gray-500">Recent Commits</p>
                {gitContextLoading ? (
                  <p className="text-gray-300">Loading commits...</p>
                ) : gitContext?.commits && gitContext.commits.length > 0 ? (
                  <div className="space-y-2">
                    {gitContext.commits.map((commit) => (
                      <div key={commit.sha} className="rounded border border-gray-700 p-2">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {commit.url ? (
                            <a href={commit.url} target="_blank" rel="noreferrer" className="font-mono text-blue-300 hover:underline">
                              {commit.short_sha}
                            </a>
                          ) : (
                            <span className="font-mono">{commit.short_sha}</span>
                          )}
                          {commit.committed_at && (
                            <span>{format(new Date(commit.committed_at), 'dd.MM.yyyy HH:mm')}</span>
                          )}
                        </div>
                        <p className="mt-1 text-gray-200">{commit.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-300">
                    {gitContext?.activity_status === 'planned'
                      ? 'No commits yet because the task branch has not been pushed.'
                      : 'No commits recorded for this branch yet.'}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="text-sm space-y-2">
                  <p className="text-gray-500">Test Evidence</p>
                  {task.test_summary ? (
                    <div className="rounded border border-gray-700 px-3 py-3 text-gray-200 whitespace-pre-wrap">
                      {task.test_summary}
                    </div>
                  ) : (
                    <p className="text-gray-300">No test summary recorded.</p>
                  )}
                  {task.test_commands && task.test_commands.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-gray-500">Recorded Commands</p>
                      {task.test_commands.map((command, index) => (
                        <div key={`${index}-${command}`} className="rounded border border-gray-700 px-3 py-2 font-mono text-xs text-gray-200 break-all">
                          {command}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="text-sm space-y-2">
                  <p className="text-gray-500">Review Evidence</p>
                  {task.review_summary ? (
                    <div className="rounded border border-gray-700 px-3 py-3 text-gray-200 whitespace-pre-wrap">
                      {task.review_summary}
                    </div>
                  ) : (
                    <p className="text-gray-300">No review summary recorded.</p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* SubTasks */}
          <div className="pt-4 border-t border-gray-700">
            <SubTaskList taskId={task?.id || null} isOpen={isOpen} />
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex items-center justify-between">
          <div>
            {task && isDoneTask && onArchive && (
              <button
                onClick={onArchive}
                className="px-4 py-2 bg-amber-900/50 text-amber-300 hover:bg-amber-900/70 rounded mr-2"
              >
                Archive
              </button>
            )}
            {task && onDelete && (
              <button
                onClick={onDelete}
                className="px-4 py-2 text-red-400 hover:bg-red-900/50 rounded"
              >
                🗑️ Löschen
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {task && task.column_name?.toLowerCase() !== 'intake' && (
              <button
                onClick={handleSendToIntake}
                className="px-4 py-2 bg-blue-900/60 text-blue-200 hover:bg-blue-900/80 rounded"
              >
                Send to Intake
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim()}
              className="px-4 py-2 bg-highlight hover:bg-highlight/80 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            >
              {task ? 'Speichern' : 'Erstellen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
