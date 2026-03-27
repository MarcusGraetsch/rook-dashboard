'use client'

import { useEffect, useState } from 'react'

interface Session {
  key: string
  agentId: string
  model: string
  lastActive: string
  messageCount: number
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Mock data for now - Gateway API integration pending
    setTimeout(() => {
      setSessions([
        { key: 'main', agentId: 'main', model: 'MiniMax-M2.7', lastActive: new Date().toISOString(), messageCount: 156 },
        { key: 'consultant', agentId: 'consultant', model: 'MiniMax-M2.7', lastActive: new Date().toISOString(), messageCount: 23 },
        { key: 'coach', agentId: 'coach', model: 'MiniMax-M2.7', lastActive: new Date().toISOString(), messageCount: 8 },
        { key: 'engineer', agentId: 'engineer', model: 'MiniMax-M2.7', lastActive: new Date().toISOString(), messageCount: 12 },
        { key: 'researcher', agentId: 'researcher', model: 'MiniMax-M2.7', lastActive: new Date().toISOString(), messageCount: 45 },
        { key: 'health', agentId: 'health', model: 'MiniMax-M2.7', lastActive: new Date().toISOString(), messageCount: 3 },
      ])
      setLoading(false)
    }, 500)
  }, [])

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Sessions</h2>
      
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <div className="bg-secondary rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-accent">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Agent</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Session Key</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Model</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Messages</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {sessions.map((session) => (
                <tr key={session.key} className="hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <span className="font-medium">{session.agentId}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-sm">{session.key}</td>
                  <td className="px-4 py-3 text-gray-400">{session.model}</td>
                  <td className="px-4 py-3 text-gray-400">{session.messageCount}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {new Date(session.lastActive).toLocaleTimeString('de-DE')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
