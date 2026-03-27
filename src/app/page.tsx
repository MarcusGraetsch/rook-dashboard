'use client'

import { useEffect, useState } from 'react'
import { Activity, Cpu, HardDrive, Clock, Users } from 'lucide-react'

interface Session {
  key: string;
  displayName: string;
  model: string;
  totalTokens: number;
  updatedAt: number;
  lastChannel: string;
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  workspace: string;
  sandbox?: boolean;
}

interface SystemStats {
  uptime: string;
  cpu: string;
  memory: { total: string; used: string; free: string };
  disk: string;
}

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [gatewayError, setGatewayError] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch from our API routes
        const [sessionsRes, statsRes] = await Promise.all([
          fetch('/api/gateway/sessions'),
          fetch('/api/gateway/stats'),
        ])
        
        if (sessionsRes.ok) {
          const data = await sessionsRes.json()
          setSessions(data.sessions || [])
          setAgents(data.agents || [])
        } else {
          setGatewayError(true)
        }
        
        if (statsRes.ok) {
          const statsData = await statsRes.json()
          setStats(statsData)
        }
      } catch (e) {
        console.error('Failed to fetch data:', e)
        setGatewayError(true)
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  // Get active session count (sessions updated in last 5 minutes)
  const activeSessions = sessions.filter(s => 
    Date.now() - s.updatedAt < 5 * 60 * 1000
  ).length

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>
      
      {gatewayError && (
        <div className="bg-red-900/50 border border-red-500 p-4 rounded-lg">
          <p className="text-red-400">⚠️ Gateway nicht erreichbar. Dashboard-Daten nicht aktuell.</p>
        </div>
      )}
      
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Activity className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">Sessions</p>
              <p className="text-2xl font-bold">{sessions.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Users className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">Agents</p>
              <p className="text-2xl font-bold">{agents.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Cpu className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">CPU Load</p>
              <p className="text-2xl font-bold">{stats?.cpu?.split(' ')[0] || '—'}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <HardDrive className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">Memory</p>
              <p className="text-2xl font-bold">{stats?.memory?.used || '—'}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Agent Status */}
      <div className="bg-secondary p-6 rounded-lg border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Agent Status</h3>
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => {
              const agentSession = sessions.find(s => s.key.includes(`:${agent.id}:`));
              const isActive = agentSession && (Date.now() - agentSession.updatedAt < 5 * 60 * 1000);
              
              return (
                <div key={agent.id} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                    <span className="text-xl">{agent.emoji}</span>
                    <span className="font-medium">{agent.name}</span>
                    {agent.sandbox && (
                      <span className="text-xs bg-purple-600 px-2 py-0.5 rounded">sandbox</span>
                    )}
                  </span>
                  <span className="text-sm text-gray-400">
                    {isActive ? 'Active' : 'Idle'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Gateway Info */}
      <div className="bg-secondary p-6 rounded-lg border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Gateway</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400">Version</p>
            <p>2026.3.13</p>
          </div>
          <div>
            <p className="text-gray-400">Port</p>
            <p>18789</p>
          </div>
          <div>
            <p className="text-gray-400">Default Model</p>
            <p>MiniMax-M2.7</p>
          </div>
          <div>
            <p className="text-gray-400">Uptime</p>
            <p>{stats?.uptime || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
