'use client'

import { useEffect, useState } from 'react'

interface Session {
  key: string;
  displayName: string;
  model: string;
  totalTokens: number;
  updatedAt: number;
  lastChannel: string;
  contextTokens: number;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch('/api/gateway/sessions')
        if (res.ok) {
          const data = await res.json()
          setSessions(data.sessions || [])
        } else {
          setError(true)
        }
      } catch (e) {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    
    fetchSessions()
    const interval = setInterval(fetchSessions, 10000)
    return () => clearInterval(interval)
  }, [])

  function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleString('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  }

  function formatAge(timestamp: number) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return 'Gerade eben'
    if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`
    if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`
    return `vor ${Math.floor(seconds / 86400)} Tagen`
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Sessions</h2>
      
      {error && (
        <div className="bg-red-900/50 border border-red-500 p-4 rounded-lg">
          <p className="text-red-400">⚠️ Gateway nicht erreichbar</p>
        </div>
      )}
      
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : sessions.length === 0 ? (
        <div className="bg-secondary p-6 rounded-lg border border-gray-700">
          <p className="text-gray-400">Keine Sessions gefunden.</p>
        </div>
      ) : (
        <div className="bg-secondary rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-accent">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Session</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Channel</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Model</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Tokens</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Letzte Aktivität</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {sessions.map((session) => (
                <tr key={session.key} className="hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <span className="font-medium font-mono text-sm">{session.displayName}</span>
                    <p className="text-xs text-gray-500">{session.key}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-accent rounded text-sm">{session.lastChannel}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-sm">{session.model}</td>
                  <td className="px-4 py-3 text-gray-400">
                    <span className="text-highlight font-mono">{session.totalTokens.toLocaleString()}</span>
                    <p className="text-xs text-gray-500">/ {session.contextTokens.toLocaleString()} ctx</p>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {formatAge(session.updatedAt)}
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
