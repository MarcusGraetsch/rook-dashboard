'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Coins, Calendar, Clock, AlertCircle, DollarSign, Info } from 'lucide-react'
import { BarChart } from '@/components/charts/BarChart'
import { getModelPricingInfo, calculateCost } from '@/lib/pricing'

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

interface Session {
  key: string;
  displayName: string;
  model: string;
  totalTokens: number;
  contextTokens: number;
  updatedAt: number;
}

export default function TokensPage() {
  const [data, setData] = useState<TokenData | null>(null)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [dailyBudget, setDailyBudget] = useState<number>(100000)
  const [budgetAlert, setBudgetAlert] = useState<number>(100000)
  const [showPricingInfo, setShowPricingInfo] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTokens() {
      try {
        const [tokensRes, historyRes, sessionsRes] = await Promise.all([
          fetch('/api/gateway/tokens'),
          fetch('/api/gateway/history'),
          fetch('/api/gateway/sessions'),
        ])
        
        if (tokensRes.ok) {
          const tokenData = await tokensRes.json()
          setData(tokenData)
        } else {
          setError(true)
        }
        
        if (historyRes.ok) {
          const history = await historyRes.json()
          setChartData(history)
        }
        
        if (sessionsRes.ok) {
          const sessData = await sessionsRes.json()
          setSessions(sessData.sessions || [])
        }
      } catch (e) {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    
    fetchTokens()
    const interval = setInterval(fetchTokens, 60000)
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

  const { summary, sessions: summarySessions } = data
  const todayTokens = summary.todayTokens || 0
  const budgetPercent = Math.min((todayTokens / budgetAlert) * 100, 100)
  const isOverBudget = todayTokens > budgetAlert

  // Calculate actual vs pay-per-use cost for our sessions
  const costAnalysis = sessions.reduce((acc, session) => {
    const modelId = session.model || 'unknown'
    const cost = calculateCost(modelId, session.contextTokens || 0, session.totalTokens - (session.contextTokens || 0))
    
    if (!acc[modelId]) {
      acc[modelId] = {
        modelId,
        displayName: getModelPricingInfo(modelId)?.displayName || modelId,
        provider: getModelPricingInfo(modelId)?.provider || 'Unknown',
        actualCostEur: 0,
        payPerUseCostEur: 0,
        tokens: 0
      }
    }
    
    acc[modelId].actualCostEur += cost.actualCostEur
    acc[modelId].payPerUseCostEur += cost.payPerUseCostEur
    acc[modelId].tokens += session.totalTokens
    
    return acc
  }, {} as Record<string, { modelId: string; displayName: string; provider: string; actualCostEur: number; payPerUseCostEur: number; tokens: number }>)

  const totalActualCostEur = Object.values(costAnalysis).reduce((sum, m) => sum + m.actualCostEur, 0)
  const totalPayPerUseCostEur = Object.values(costAnalysis).reduce((sum, m) => sum + m.payPerUseCostEur, 0)

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
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0
              setDailyBudget(val)
              setBudgetAlert(val)
            }}
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
              <p className="text-sm text-gray-400">Kosten (geschätzt)</p>
              <p className="text-2xl font-bold">{totalActualCostEur.toFixed(2)} €</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Cost Comparison */}
      <div className="grid grid-cols-2 gap-6">
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
        
        {/* Model Cost Breakdown */}
        <div className="bg-secondary p-6 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">Kosten nach Model</h3>
          </div>
          
          {Object.values(costAnalysis).length === 0 ? (
            <p className="text-gray-400 text-sm">Keine Model-Daten verfügbar</p>
          ) : (
            <div className="space-y-3">
              {Object.values(costAnalysis).map((model) => (
                <div 
                  key={model.modelId}
                  className="p-3 bg-accent/30 rounded-lg relative"
                  onMouseEnter={() => setShowPricingInfo(model.modelId)}
                  onMouseLeave={() => setShowPricingInfo(null)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{model.displayName}</span>
                      <span className="text-xs text-gray-500">{model.provider}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-highlight">{model.actualCostEur.toFixed(2)} €</p>
                      {model.actualCostEur < model.payPerUseCostEur && (
                        <p className="text-xs text-green-400">
                          (API: {model.payPerUseCostEur.toFixed(2)} €)
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Tooltip with pricing info */}
                  {showPricingInfo === model.modelId && (
                    <div className="absolute left-full top-0 ml-2 w-64 p-3 bg-secondary border border-gray-600 rounded-lg shadow-xl z-50">
                      <p className="font-medium mb-2">{model.displayName}</p>
                      <div className="text-sm space-y-1">
                        <p><span className="text-gray-400">Tokens:</span> {model.tokens.toLocaleString()}</p>
                        {(() => {
                          const info = getModelPricingInfo(model.modelId)
                          return info ? (
                            <>
                              <p><span className="text-gray-400">Input:</span> {info.inputDisplay}</p>
                              <p><span className="text-gray-400">Output:</span> {info.outputDisplay}</p>
                              {info.subscriptionDisplay && (
                                <p><span className="text-gray-400">Sub:</span> {info.subscriptionDisplay}</p>
                              )}
                              {info.notes && (
                                <p className="text-xs text-gray-500 mt-1">{info.notes}</p>
                              )}
                            </>
                          ) : null
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {/* Summary */}
              <div className="pt-3 border-t border-gray-700">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Gesamt (tatsächlich):</span>
                  <span className="font-bold text-highlight">{totalActualCostEur.toFixed(2)} €</span>
                </div>
                {totalPayPerUseCostEur > totalActualCostEur && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-gray-400">Wenn API (pay-per-use):</span>
                    <span className="text-green-400">{totalPayPerUseCostEur.toFixed(2)} €</span>
                  </div>
                )}
                {totalPayPerUseCostEur > totalActualCostEur && (
                  <p className="text-xs text-green-400 mt-2">
                    ✓ Du sparst {(totalPayPerUseCostEur - totalActualCostEur).toFixed(2)} € durch Subscription/niedrigere API-Preise
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Note */}
      <div className="bg-accent/50 p-4 rounded-lg border border-gray-600">
        <p className="text-sm text-gray-300">
          💡 <strong>Hinweis:</strong> Kosten in EUR basierend auf deinen Subscription-Preisen.
          "API" zeigt was es bei Pay-per-Use kosten würde. Hover über ein Model für Details.
          {Object.keys(costAnalysis).length === 0 && ' Keine Model-Daten verfügbar.'}
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
              <th className="px-4 py-2">Model</th>
              <th className="px-4 py-2">Tokens</th>
              <th className="px-4 py-2">Kosten (geschätzt)</th>
              <th className="px-4 py-2">Letzte Aktivität</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {sessions.slice(0, 10).map((session, idx) => {
              const cost = calculateCost(
                session.model,
                session.contextTokens || 0,
                session.totalTokens - (session.contextTokens || 0)
              )
              return (
                <tr key={idx} className="hover:bg-accent/30">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{session.model}</span>
                      <button
                        onMouseEnter={() => setShowPricingInfo(session.model)}
                        onMouseLeave={() => setShowPricingInfo(null)}
                        className="p-1 hover:bg-accent rounded"
                      >
                        <Info className="w-3 h-3 text-gray-500" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-mono">{session.totalTokens.toLocaleString()}</span>
                    <span className="text-xs text-gray-500 ml-1">({session.contextTokens?.toLocaleString() || 0} ctx)</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-highlight font-mono">{cost.actualCostEur.toFixed(4)} €</span>
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-sm">
                    {new Date(session.updatedAt).toLocaleString('de-DE')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
