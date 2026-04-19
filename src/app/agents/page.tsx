'use client'

import { useEffect, useState } from 'react'
import { Bot, Folder, Shield, Clock, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'

interface QueuedTask {
  task_id: string
  title: string
  status: string
  priority: string
}

interface BlockedTaskInfo {
  task_id: string
  title: string
  blocked_by: string[]
}

interface CrossAgentWait {
  taskId: string
  taskTitle: string
  blockedOn: string
  blockerStatus: string
}

interface AgentStats {
  id: string
  name: string
  emoji: string
  workspace: string
  sandbox?: boolean
  sessions?: number
  tokens?: number
  healthStatus?: string
  currentTaskId?: string | null
  queueDepth?: number
  lastError?: string | null
  lastCompletedTask?: string | null
  queuedTasks: QueuedTask[]
  blockedTasks: BlockedTaskInfo[]
  crossAgentWaits: CrossAgentWait[]
}

interface Session {
  key: string
  displayName: string
  updatedAt: number
  totalTokens: number
  agent?: string
  tokens?: number
}

interface HealthSnapshot {
  agent_id: string
  status: 'idle' | 'ready' | 'in_progress' | 'blocked' | 'error' | 'offline'
  current_task_id: string | null
  last_seen_at: string
  workspace: string
  queue_depth: number
  last_error: string | null
  last_completed_task: string | null
  repo_heads: Record<string, string>
  runtime: {
    session_count: number
    latest_session_update_at: string | null
  }
}

interface KanbanTask {
  task_id: string
  status: string
  assigned_agent: string
  title: string
  blocked_by?: string[]
}

const AGENT_COLORS: Record<string, string> = {
  rook: 'from-amber-600 to-orange-700',
  consultant: 'from-blue-600 to-blue-800',
  coach: 'from-purple-600 to-purple-800',
  engineer: 'from-cyan-600 to-cyan-800',
  researcher: 'from-green-600 to-green-800',
  test: 'from-lime-600 to-emerald-800',
  review: 'from-fuchsia-600 to-pink-800',
  health: 'from-red-600 to-red-800',
}

const AGENT_EMOJIS: Record<string, string> = {
  rook: '🦅',
  consultant: '💼',
  coach: '🧠',
  engineer: '🛠️',
  researcher: '📚',
  test: '🧪',
  review: '🔍',
  health: '💪',
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    urgent: 'bg-red-500/20 text-red-400 border-red-500/40',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    medium: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    low: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border ${colors[priority] || colors.medium}`}>
      {priority}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className={`w-2 h-2 rounded-full shrink-0 ${
      status === 'done' ? 'bg-green-400' :
      status === 'in_progress' ? 'bg-blue-400' :
      status === 'review' ? 'bg-purple-400' :
      status === 'testing' ? 'bg-cyan-400' :
      status === 'blocked' ? 'bg-orange-400' :
      status === 'ready' ? 'bg-yellow-400' :
      'bg-gray-500'
    }`} />
  )
}

export default function AgentsPage() {
  const [agentStats, setAgentStats] = useState<AgentStats[]>([])
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({})
  const [taskMap, setTaskMap] = useState<Record<string, KanbanTask>>({})
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [tokensRes, healthRes] = await Promise.all([
          fetch('/api/memory/tokens'),
          fetch('/api/control/health', { method: 'POST' }),
        ])
        if (tokensRes.ok) {
          const data = await tokensRes.json()
          const healthJson = healthRes.ok ? await healthRes.json() : { snapshots: [] }
          const healthByAgent: Record<string, HealthSnapshot> = {}
          ;(healthJson.snapshots || []).forEach((snapshot: HealthSnapshot) => {
            healthByAgent[snapshot.agent_id] = snapshot
          })

          const statsRes = await fetch('/api/agent/stats')
          const statsJson = statsRes.ok ? await statsRes.json() : { agents: [] }
          const statsByAgent: Record<string, any> = {}
          ;(statsJson.agents || []).forEach((a: any) => { statsByAgent[a.id] = a })

          // Fetch tasks for cross-agent wait analysis
          const tasksRes = await fetch('/api/kanban/tasks')
          const allTasks: KanbanTask[] = tasksRes.ok ? await tasksRes.json() : []
          const taskMapLocal: Record<string, KanbanTask> = {}
          allTasks.forEach((t: KanbanTask) => { taskMapLocal[t.task_id] = t })
          setTaskMap(taskMapLocal)

          const allAgents = ['rook', 'consultant', 'coach', 'engineer', 'researcher', 'test', 'review', 'health']
          const sessionsByAgent: Record<string, Session[]> = {}
          data.sessions?.forEach((s: any) => {
            const agentId = s.agent || 'unknown'
            if (!sessionsByAgent[agentId]) sessionsByAgent[agentId] = []
            sessionsByAgent[agentId].push(s)
          })

          const agentList: AgentStats[] = allAgents.map(id => {
            const agentSessions = sessionsByAgent[id] || []
            const totalTokens = agentSessions.reduce((sum: number, s: any) => sum + s.tokens, 0)
            const snapshot = healthByAgent[id]
            const stats = statsByAgent[id] || {}
            const queuedTasks: QueuedTask[] = stats.queuedTasks || []
            const blockedTasks: BlockedTaskInfo[] = stats.blockedTasks || []

            // Cross-agent waits: blocked tasks whose blocker is owned by another agent
            const crossAgentWaits: CrossAgentWait[] = []
            blockedTasks.forEach((bt: BlockedTaskInfo) => {
              bt.blocked_by?.forEach((blockerId: string) => {
                const blockerTask = taskMapLocal[blockerId]
                if (blockerTask && blockerTask.assigned_agent !== id) {
                  crossAgentWaits.push({
                    taskId: bt.task_id,
                    taskTitle: bt.title,
                    blockedOn: blockerId,
                    blockerStatus: blockerTask.status || 'unknown',
                  })
                }
              })
            })

            return {
              id,
              name: id.charAt(0).toUpperCase() + id.slice(1),
              emoji: AGENT_EMOJIS[id] || '🤖',
              workspace: snapshot?.workspace || `/root/.openclaw/workspace-${id}`,
              sandbox: ['engineer', 'researcher', 'test', 'review', 'health', 'coach'].includes(id),
              sessions: agentSessions.length,
              tokens: totalTokens,
              healthStatus: snapshot?.status || 'offline',
              currentTaskId: snapshot?.current_task_id || null,
              queueDepth: snapshot?.queue_depth || 0,
              lastError: snapshot?.last_error || null,
              lastCompletedTask: snapshot?.last_completed_task || null,
              queuedTasks,
              blockedTasks,
              crossAgentWaits,
            }
          })

          setAgentStats(agentList)
          setSessions(data.sessions || [])
        }
      } catch (e) {
        console.error('Failed to fetch:', e)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [])

  function getAgentSessions(agentId: string) {
    return sessions.filter(s => s.agent === agentId)
  }

  function getLastActivity(agentId: string) {
    const agentSessions = getAgentSessions(agentId)
    if (agentSessions.length === 0) return null
    return Math.max(...agentSessions.map(s => new Date(s.updatedAt).getTime()))
  }

  function formatLastActivity(timestamp: number | null) {
    if (!timestamp) return 'Nie'
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return 'Gerade eben'
    if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`
    if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`
    return `vor ${Math.floor(seconds / 86400)} Tagen`
  }

  function toggleAgent(agentId: string) {
    setExpandedAgents(prev => ({ ...prev, [agentId]: !prev[agentId] }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Agents</h2>
        <span className="text-sm text-gray-400">{agentStats.length} Agenten</span>
      </div>

      {loading ? (
        <p className="text-gray-400">Laden...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            {agentStats.map((agent) => {
              const agentSessions = getAgentSessions(agent.id)
              const lastActivity = getLastActivity(agent.id)
              const colorClass = AGENT_COLORS[agent.id] || 'from-gray-600 to-gray-800'
              const isExpanded = expandedAgents[agent.id] || false
              const hasQueueItems =
                agent.queuedTasks.length > 0 ||
                agent.blockedTasks.length > 0 ||
                agent.crossAgentWaits.length > 0

              return (
                <div key={agent.id} className="bg-secondary rounded-lg border border-gray-700 overflow-hidden">
                  {/* Header with gradient */}
                  <div className={`bg-gradient-to-r ${colorClass} p-4`}>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{agent.emoji}</span>
                      <div>
                        <h3 className="font-bold text-lg">{agent.name}</h3>
                        <p className="text-sm opacity-80 font-mono">{agent.id}</p>
                      </div>
                      {agent.sandbox && (
                        <span className="ml-auto flex items-center gap-1 text-xs bg-black/30 px-2 py-1 rounded">
                          <Shield className="w-3 h-3" />
                          sandbox
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <Folder className="w-4 h-4 text-gray-500 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">Workspace</p>
                        <p className="text-sm font-mono truncate">{agent.workspace}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-400">Letzte Aktivität</p>
                        <p className="text-sm">{formatLastActivity(lastActivity)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-400">Sessions</p>
                        <p className="text-sm">{agent.sessions} • {(agent.tokens || 0).toLocaleString()} Tokens</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        agent.healthStatus === 'error' ? 'bg-red-400' :
                        agent.healthStatus === 'blocked' ? 'bg-orange-400' :
                        agent.healthStatus === 'in_progress' ? 'bg-blue-400' :
                        agent.healthStatus === 'ready' ? 'bg-cyan-400' :
                        'bg-gray-500'
                      }`} />
                      <div>
                        <p className="text-xs text-gray-400">Health</p>
                        <p className="text-sm">{agent.healthStatus} • queue {agent.queueDepth || 0}</p>
                      </div>
                    </div>

                    {(agent.currentTaskId || agent.lastCompletedTask || agent.lastError) && (
                      <div className="text-xs space-y-1">
                        {agent.currentTaskId && (
                          <p><span className="text-gray-400">Current:</span> <span className="font-mono">{agent.currentTaskId}</span></p>
                        )}
                        {agent.lastCompletedTask && (
                          <p><span className="text-gray-400">Completed:</span> <span className="font-mono">{agent.lastCompletedTask}</span></p>
                        )}
                        {agent.lastError && (
                          <p className="text-red-300"><span className="text-gray-400">Error:</span> {agent.lastError}</p>
                        )}
                      </div>
                    )}

                    {/* Queue & Blockers toggle — only shown if there's content */}
                    {hasQueueItems && (
                      <button
                        onClick={() => toggleAgent(agent.id)}
                        className="w-full flex items-center gap-2 mt-2 px-3 py-2 rounded bg-accent/30 hover:bg-accent/50 transition-colors text-sm"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="font-medium">Queue & Blockers</span>
                        {agent.blockedTasks.length > 0 && (
                          <span className="ml-auto flex items-center gap-1 text-orange-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {agent.blockedTasks.length}
                          </span>
                        )}
                        <span className="ml-auto text-gray-400">
                          {agent.queuedTasks.length} queued
                        </span>
                      </button>
                    )}

                    {/* Collapsible Queue & Blockers panel */}
                    {isExpanded && hasQueueItems && (
                      <div className="mt-2 space-y-3 border-t border-gray-700 pt-3">
                        {/* Per-agent queue */}
                        {agent.queuedTasks.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Queued Tasks</p>
                            <div className="space-y-1">
                              {agent.queuedTasks.slice(0, 5).map((qt) => (
                                <div key={qt.task_id} className="flex items-center gap-2 text-xs">
                                  <StatusDot status={qt.status} />
                                  <span className="font-mono text-gray-300">{qt.task_id}</span>
                                  <span className="flex-1 truncate text-gray-300">{qt.title}</span>
                                  <PriorityBadge priority={qt.priority} />
                                </div>
                              ))}
                              {agent.queuedTasks.length > 5 && (
                                <a href="/kanban" className="text-xs text-blue-400 hover:text-blue-300 pl-2">
                                  +{agent.queuedTasks.length - 5} more → Kanban
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Blocked tasks */}
                        {agent.blockedTasks.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-1.5">Blocked</p>
                            <div className="space-y-1">
                              {agent.blockedTasks.map((bt) => (
                                <div key={bt.task_id} className="text-xs">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                    <span className="font-mono text-gray-300">{bt.task_id}</span>
                                    <span className="flex-1 truncate text-gray-300">{bt.title}</span>
                                  </div>
                                  {bt.blocked_by.length > 0 && (
                                    <div className="pl-5 mt-0.5 space-y-0.5">
                                      {bt.blocked_by.map((blockerId) => {
                                        const blockerTask = taskMap[blockerId]
                                        return (
                                          <div key={blockerId} className="flex items-center gap-1.5 text-gray-500">
                                            <span>blocked by</span>
                                            <span className="font-mono text-gray-400">{blockerId}</span>
                                            {blockerTask && (
                                              <>
                                                <StatusDot status={blockerTask.status} />
                                                <span className="text-gray-500">({blockerTask.status})</span>
                                              </>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Cross-agent waits */}
                        {agent.crossAgentWaits.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-1.5">Waiting on Other Agents</p>
                            <div className="space-y-1">
                              {agent.crossAgentWaits.map((wait) => (
                                <div key={`${wait.taskId}-${wait.blockedOn}`} className="flex items-center gap-2 text-xs">
                                  <span className="text-gray-500">⏳</span>
                                  <span className="font-mono text-gray-300">{wait.taskId}</span>
                                  <span className="flex-1 truncate text-gray-300">{wait.taskTitle}</span>
                                  <span className="text-gray-500">← waiting on</span>
                                  <span className="font-mono text-purple-300">{wait.blockedOn}</span>
                                  <StatusDot status={wait.blockerStatus} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Agent Capabilities */}
          <div className="bg-secondary p-6 rounded-lg border border-gray-700">
            <h3 className="font-bold mb-4">Agent Fähigkeiten</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-accent/30 rounded">
                <p className="font-medium">🦅 Rook</p>
                <p className="text-gray-400">Hauptassistent, Koordination, Memory</p>
              </div>
              <div className="p-3 bg-accent/30 rounded">
                <p className="font-medium">🛠️ Engineer</p>
                <p className="text-gray-400">Code, DevOps, Architektur (sandboxed)</p>
              </div>
              <div className="p-3 bg-accent/30 rounded">
                <p className="font-medium">📚 Researcher</p>
                <p className="text-gray-400">Digital Capitalism, Kritische Theorie</p>
              </div>
              <div className="p-3 bg-accent/30 rounded">
                <p className="font-medium">🧠 Coach</p>
                <p className="text-gray-400">Mental Health, Life Balance</p>
              </div>
              <div className="p-3 bg-accent/30 rounded">
                <p className="font-medium">💪 Health</p>
                <p className="text-gray-400">Ernährung, Bewegung, Schlaf</p>
              </div>
              <div className="p-3 bg-accent/30 rounded">
                <p className="font-medium">💼 Consultant</p>
                <p className="text-gray-400">IT Management, Kubernetes</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
