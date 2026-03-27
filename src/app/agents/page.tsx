'use client'

import { useEffect, useState } from 'react'

interface Agent {
  id: string
  name: string
  emoji: string
  status: 'active' | 'idle' | 'ready'
  workspace: string
  sandbox?: boolean
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => {
      setAgents([
        { id: 'main', name: 'Rook', emoji: '🦅', status: 'active', workspace: '~/.openclaw/workspace', sandbox: false },
        { id: 'consultant', name: 'Consultant', emoji: '💼', status: 'idle', workspace: '~/.openclaw/workspace-consultant', sandbox: false },
        { id: 'coach', name: 'Coach', emoji: '🧠', status: 'ready', workspace: '~/.openclaw/workspace-coach', sandbox: false },
        { id: 'engineer', name: 'Engineer', emoji: '🛠️', status: 'idle', workspace: '~/.openclaw/workspace-engineer', sandbox: true },
        { id: 'researcher', name: 'Researcher', emoji: '📚', status: 'ready', workspace: '~/.openclaw/workspace-researcher', sandbox: false },
        { id: 'health', name: 'Health', emoji: '💪', status: 'ready', workspace: '~/.openclaw/workspace-health', sandbox: false },
      ])
      setLoading(false)
    }, 500)
  }, [])

  const statusColors = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    ready: 'bg-blue-500',
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Agents</h2>
      
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-secondary p-4 rounded-lg border border-gray-700">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{agent.emoji}</span>
                  <div>
                    <h3 className="font-bold">{agent.name}</h3>
                    <p className="text-sm text-gray-400 font-mono">{agent.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {agent.sandbox && (
                    <span className="text-xs bg-purple-600 px-2 py-1 rounded">sandbox</span>
                  )}
                  <span className={`w-2 h-2 rounded-full ${statusColors[agent.status]}`}></span>
                </div>
              </div>
              <p className="mt-3 text-sm text-gray-400 font-mono">{agent.workspace}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
