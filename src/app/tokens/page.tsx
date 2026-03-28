'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Coins, Calendar, Clock, AlertCircle, DollarSign } from 'lucide-react'
import { BarChart } from '@/components/charts/BarChart'

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

interface ChartData {
  days: { date: string; tokens: number }[];
  maxTokens: number;
  total: number;
}

export default function TokensPage() {
  const [data, setData] = useState<TokenData | null>(null)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [dailyBudget, setDailyBudget] = useState<string>('')
  const [budgetAlert, setBudgetAlert] = useState<number>(100000) // Default 100k tokens

  useEffect(() => {
    async function fetchTokens() {
      try {
        const [tokensRes, historyRes] = await Promise.all([
          fetch('/api/gateway/tokens'),
          fetch('/api/gateway/history'),
        ])
        
        if (tokensRes.ok) {
          const tokenData = await tokensRes.json()
          setData(tokenData)
          
          // Check budget
          if (tokenData.summary?.todayTokens > budgetAlert) {
            // Could trigger notification here
          }
        } else {
          setError(true)
        }
        
        if (historyRes.ok) {
          const history = await historyRes.json()
          setChartData(history)
        }
      } catch (e) {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    
    fetchTokens()
    const interval = setInterval(fetchTokens, 60000) // Every minute
    return () => clearInterval(interval)
  }, [budgetAlert])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Laden...</p>
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
  const todayTokens = summary.todayTokens || 0
  const budgetPercent = Math.min((todayTokens / budgetAlert) * 100, 100)
  const isOverBudget = todayTokens > budgetAlert

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Token Usage</h2>
        
        {/* Budget Alert Setup */}
        <div className="flex items-center gap-2">
          <AlertCircle className={`w-4 h-4 ${isOverBudget ? 'text-red-400' : 'text-gray-500'}`} />
          <input
            type="number"
            value={dailyBudget || budgetAlert}
            onChange={(e) => setDailyBudget(e.target.value)}
            placeholder="Budget..."
            className="w-32 px-3 py-1.5 bg-secondary border border-gray-700 rounded text-white text-sm"
          />
          <span className="text-sm text-gray-400">Token/Tag</span>
        </div>
      </div>
      
      {/* Budget Progress */}
      {budgetAlert > 0 && (
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Tagesbudget</span>
            <span className={`text-sm font-mono ${isOverBudget ? 'text-red-400' : 'text-gray-400'}`}>
              {todayTokens.toLocaleString()} / {budgetAlert.toLocaleString()} ({budgetPercent.toFixed(0)}%)
            </span>
          </div>
          <div className="h-2 bg-gray-700 rounded overflow-hidden">
            <div 
              className={`h-full transition-all ${isOverBudget ? 'bg-red-500' : 'bg-highlight'}`}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
          {isOverBudget && (
            <p className="mt-2 text-sm text-red-400">⚠️ Tagesbudget überschritten!</p>
          )}
        </div>
      )}
      
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
            <DollarSign className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">Kosten (heute)</p>
              <p className="text-2xl font-bold">${summary.estimatedCostToday}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* 7-Day Chart */}
      {chartData && chartData.days.length > 0 && (
        <div className="bg-secondary p-6 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">Token-Verbrauch (7 Tage)</h3>
            <span className="text-sm text-gray-400">
              Gesamt: {chartData.total.toLocaleString()}
            </span>
          </div>
          <BarChart data={chartData.days} maxValue={chartData.maxTokens} height={150} />
        </div>
      )}
      
      {/* Note */}
      <div className="bg-accent/50 p-4 rounded-lg border border-gray-600">
        <p className="text-sm text-gray-300">
          💡 Token-Zahlen basieren auf Session-Daten. MiniMax M2.7: $0.30/1M input, $1.20/1M output (geschätzt).
          Setze ein Tagesbudget um Alerts zu erhalten.
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
