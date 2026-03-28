'use client'

import { useEffect, useState } from 'react'
import { Bot, Folder, Shield, Clock, ExternalLink } from 'lucide-react'

interface Agent {
  id: string
  name: string
  emoji: string
  workspace: string
  sandbox?: boolean
  model?: string
}

interface Session {
  key: string
  displayName: string
  updatedAt: number
  totalTokens: number
}

const AGENT_COLORS: Record<string, string> = {
  main: 'from-amber-600 to-orange-700',
  consultant: 'from-blue-600 to-blue-800',
  coach: 'from-purple-600 to-purple-800',
  engineer: 'from-cyan-600 to-cyan-800',
  researcher: 'from-green-600 to-green-800',
  health: 'from-red-600 to-red-800',
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/gateway/sessions')
        if (res.ok) {
          const data = await res.json()
          setAgents(data.agents || [])
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
    return sessions.filter(s => s.key.includes(`:${agentId}:`))
  }

  function getLastActivity(agentId: string) {
    const agentSessions = getAgentSessions(agentId)
    if (agentSessions.length === 0) return null
    return Math.max(...agentSessions.map(s => s.updatedAt))
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
          {agents.map((agent) => {
            const agentSessions = getAgentSessions(agent.id)
            const lastActivity = getLastActivity(agent.id)
            const totalTokens = agentSessions.reduce((sum, s) => sum + s.totalTokens, 0)
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
                      <p className="text-sm">{agentSessions.length} • {totalTokens.toLocaleString()} Tokens</p>
                    </div>
                  </div>
                  
                  {agentSessions.length > 0 && (
                    <div className="pt-2 border-t border-gray-700">
                      <p className="text-xs text-gray-500 mb-2">Letzte Sessions</p>
                      <div className="space-y-1">
                        {agentSessions.slice(0, 3).map((s, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-gray-400">{s.displayName}</span>
                            <span className="font-mono text-highlight">{s.totalTokens.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
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
