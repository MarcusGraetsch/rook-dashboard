'use client'

import { useEffect, useState, useMemo } from 'react'
import { Search, Filter, Clock, MessageSquare, Zap } from 'lucide-react'

interface Session {
  key: string;
  displayName: string;
  model: string;
  totalTokens: number;
  updatedAt: number;
  lastChannel: string;
  contextTokens: number;
  agent?: string;
}

const CHANNELS = ['all', 'telegram', 'cli', 'web', 'discord']

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'time' | 'tokens'>('time')

  useEffect(() => {
    async function fetchSessions() {
      try {
        // Try the new memory/tokens API first, fallback to gateway
        const res = await fetch('/api/memory/tokens')
        if (res.ok) {
          const data = await res.json()
          setSessions((data.sessions || []).map((s: any) => ({
            key: s.name,
            displayName: s.agent + ' / ' + s.name.substring(0, 8),
            model: 'unknown',
            totalTokens: s.tokens,
            updatedAt: new Date(s.updatedAt).getTime(),
            lastChannel: 'web',
            contextTokens: 0,
            agent: s.agent,
          })))
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

  const filteredSessions = useMemo(() => {
    let result = sessions
    
    // Filter by channel
    if (channelFilter !== 'all') {
      result = result.filter(s => s.lastChannel === channelFilter)
    }
    
    // Filter by search
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      result = result.filter(s => 
        s.key.toLowerCase().includes(searchLower) ||
        s.displayName.toLowerCase().includes(searchLower) ||
        s.model.toLowerCase().includes(searchLower)
      )
    }
    
    // Sort
    if (sortBy === 'tokens') {
      result = [...result].sort((a, b) => b.totalTokens - a.totalTokens)
    } else {
      result = [...result].sort((a, b) => b.updatedAt - a.updatedAt)
    }
    
    return result
  }, [sessions, search, channelFilter, sortBy])

  function formatAge(timestamp: number) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return 'Gerade eben'
    if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`
    if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`
    return `vor ${Math.floor(seconds / 86400)} Tagen`
  }

  function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleString('de-DE', {
      dateStyle: 'short',
      timeStyle: 'medium',
    })
  }

  const totalSessionTokens = sessions.reduce((sum, s) => sum + s.totalTokens, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Sessions</h2>
        
        {/* Summary */}
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            {sessions.length} Sessions
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-4 h-4" />
            {totalSessionTokens.toLocaleString()} Tokens
          </span>
        </div>
      </div>
      
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Session suchen..."
            className="w-full pl-10 pr-4 py-2 bg-secondary border border-gray-700 rounded-lg text-white placeholder-gray-500"
          />
        </div>
        
        {/* Channel Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          {CHANNELS.map(channel => (
            <button
              key={channel}
              onClick={() => setChannelFilter(channel)}
              className={`px-3 py-1.5 rounded text-sm ${
                channelFilter === channel
                  ? 'bg-highlight text-white'
                  : 'bg-secondary hover:bg-accent'
              }`}
            >
              {channel === 'all' ? 'Alle' : channel}
            </button>
          ))}
        </div>
        
        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'time' | 'tokens')}
          className="px-3 py-2 bg-secondary border border-gray-700 rounded-lg text-white"
        >
          <option value="time">Neueste zuerst</option>
          <option value="tokens">Meiste Tokens</option>
        </select>
      </div>
      
      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border border-red-500 p-4 rounded-lg">
          <p className="text-red-400">⚠️ Gateway nicht erreichbar</p>
        </div>
      )}
      
      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-gray-400">Laden...</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="bg-secondary p-6 rounded-lg border border-gray-700 text-center">
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
              {filteredSessions.map((session) => (
                <tr key={session.key} className="hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <span className="font-medium font-mono text-sm">{session.displayName}</span>
                    <p className="text-xs text-gray-500 font-mono truncate max-w-[200px]">{session.key}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-accent rounded text-sm">{session.lastChannel}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-sm">{session.model}</td>
                  <td className="px-4 py-3">
                    <span className="text-highlight font-mono">{session.totalTokens.toLocaleString()}</span>
                    <p className="text-xs text-gray-500">/ {session.contextTokens.toLocaleString()} ctx</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-gray-400">{formatAge(session.updatedAt)}</p>
                        <p className="text-xs text-gray-600">{formatTime(session.updatedAt)}</p>
                      </div>
                    </div>
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
