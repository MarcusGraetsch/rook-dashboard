'use client'

import { useEffect, useState } from 'react'
import { Bot, Folder, Shield, Clock } from 'lucide-react'

interface Agent {
  id: string
  name: string
  emoji: string
  workspace: string
  sandbox?: boolean
  model?: string
  sessions?: number
  tokens?: number
  healthStatus?: string
  currentTaskId?: string | null
  queueDepth?: number
  lastError?: string | null
  lastCompletedTask?: string | null
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

const AGENT_COLORS: Record<string, string> = {
  rook: 'from-amber-600 to-orange-700',
  consultant: 'from-blue-600 to-blue-800',
  coach: 'from-purple-600 to-purple-800',
  engineer: 'from-cyan-600 to-cyan-800',
  researcher: 'from-green-600 to-green-800',
  health: 'from-red-600 to-red-800',
}

const AGENT_EMOJIS: Record<string, string> = {
  rook: '🦅',
  consultant: '💼',
  coach: '🧠',
  engineer: '🛠️',
  researcher: '📚',
  health: '💪',
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
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
          
          // Build agent list from all agents
          const allAgents = ['rook', 'consultant', 'coach', 'engineer', 'researcher', 'health']
          const sessionsByAgent: Record<string, Session[]> = {}
          
          // Group sessions by agent
          data.sessions?.forEach((s: any) => {
            const agentId = s.agent || 'unknown'
            if (!sessionsByAgent[agentId]) sessionsByAgent[agentId] = []
            sessionsByAgent[agentId].push(s)
          })
          
          // Build agent list
          const agentList: Agent[] = allAgents.map(id => {
            const agentSessions = sessionsByAgent[id] || []
            const totalTokens = agentSessions.reduce((sum: number, s: any) => sum + s.tokens, 0)
            const snapshot = healthByAgent[id]
            return {
              id,
              name: id.charAt(0).toUpperCase() + id.slice(1),
              emoji: AGENT_EMOJIS[id] || '🤖',
              workspace: snapshot?.workspace || `/root/.openclaw/workspace-${id}`,
              sandbox: ['engineer', 'researcher', 'health', 'coach'].includes(id),
              sessions: agentSessions.length,
              tokens: totalTokens,
              healthStatus: snapshot?.status || 'offline',
              currentTaskId: snapshot?.current_task_id || null,
              queueDepth: snapshot?.queue_depth || 0,
              lastError: snapshot?.last_error || null,
              lastCompletedTask: snapshot?.last_completed_task || null,
            }
          })
          
          setAgents(agentList)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Agents</h2>
        <span className="text-sm text-gray-400">{agents.length} Agenten</span>
      </div>
      
      {loading ? (
        <p className="text-gray-400">Laden...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {agents.filter(a => a.sessions && a.sessions > 0).map((agent) => {
            const agentSessions = getAgentSessions(agent.id)
            const lastActivity = getLastActivity(agent.id)
            const totalTokens = agentSessions.reduce((sum, s) => sum + (s.tokens || 0), 0)
            const colorClass = AGENT_COLORS[agent.id] || 'from-gray-600 to-gray-800'
            
            return (
              <div 
                key={agent.id} 
                className="bg-secondary rounded-lg border border-gray-700 overflow-hidden"
              >
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
                </div>
              </div>
            )
          })}
        </div>
      )}
      
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
    </div>
  )
}
