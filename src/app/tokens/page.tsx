'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Coins, Calendar, Clock } from 'lucide-react'

interface TokenData {
  summary: {
    totalTokens: number;
    todayTokens: number;
    weekTokens: number;
    estimatedCostToday: string;
    sessionCount: number;
  };
  sessions: {
    name: string;
    tokens: number;
    updatedAt: string;
  }[];
}

export default function TokensPage() {
  const [data, setData] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function fetchTokens() {
      try {
        const res = await fetch('/api/gateway/tokens')
        if (res.ok) {
          const tokenData = await res.json()
          setData(tokenData)
        } else {
          setError(true)
        }
      } catch (e) {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    
    fetchTokens()
    const interval = setInterval(fetchTokens, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-900/50 border border-red-500 p-4 rounded-lg">
        <p className="text-red-400">⚠️ Token-Daten nicht verfügbar</p>
      </div>
    )
  }

  const { summary, sessions } = data

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Token Usage</h2>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Coins className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">Heute</p>
              <p className="text-2xl font-bold">{summary.todayTokens.toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Calendar className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">Diese Woche</p>
              <p className="text-2xl font-bold">{summary.weekTokens.toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">Gesamt</p>
              <p className="text-2xl font-bold">{summary.totalTokens.toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Clock className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">Kosten (heute)</p>
              <p className="text-2xl font-bold">${summary.estimatedCostToday}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Note */}
      <div className="bg-accent/50 p-4 rounded-lg border border-gray-600">
        <p className="text-sm text-gray-300">
          💡 <strong>Hinweis:</strong> Token-Zahlen basieren auf Session-Daten. 
          Tatsächliche Kosten hängen von Input/Output-Verteilung und Model-Preisen ab.
          MiniMax M2.7: $0.30/1M input, $1.20/1M output (geschätzt).
        </p>
      </div>
      
      {/* Session Breakdown */}
      <div className="bg-secondary rounded-lg border border-gray-700 overflow-hidden">
        <div className="px-4 py-3 bg-accent">
          <h3 className="font-bold">Session Breakdown</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-400 border-b border-gray-700">
              <th className="px-4 py-2">Session</th>
              <th className="px-4 py-2">Tokens</th>
              <th className="px-4 py-2">Letzte Aktivität</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {sessions.slice(0, 10).map((session, idx) => (
              <tr key={idx} className="hover:bg-accent/30">
                <td className="px-4 py-2 font-mono text-sm">{session.name}</td>
                <td className="px-4 py-2">
                  <span className="text-highlight font-mono">{session.tokens.toLocaleString()}</span>
                </td>
                <td className="px-4 py-2 text-gray-400 text-sm">
                  {new Date(session.updatedAt).toLocaleString('de-DE')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
