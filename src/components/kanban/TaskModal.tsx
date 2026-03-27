'use client'

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isBefore, startOfDay } from 'date-fns'
import { de } from 'date-fns/locale'
import { SubTaskList } from './SubTaskList'

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
  task: Task | null
  isOpen: boolean
  onClose: () => void
  onSave: (task: Partial<Task>) => void
  onDelete?: () => void
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

export function TaskModal({ task, isOpen, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [labels, setLabels] = useState('')
  const [assignee, setAssignee] = useState('')
  const [dueDate, setDueDate] = useState('')

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setPriority(task.priority)
      setLabels(task.labels ? JSON.parse(task.labels).join(', ') : '')
      setAssignee(task.assignee || '')
      setDueDate(task.due_date || '')
    } else {
      setTitle('')
      setDescription('')
      setPriority('medium')
      setLabels('')
      setAssignee('')
      setDueDate('')
    }
  }, [task, isOpen])

  if (!isOpen) return null

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
          
          {/* SubTasks */}
          <div className="pt-4 border-t border-gray-700">
            <SubTaskList taskId={task?.id || null} isOpen={isOpen} />
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex items-center justify-between">
          <div>
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
