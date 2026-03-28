'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Shield, Users, Eye } from 'lucide-react'
import type { MetricResult } from '@/lib/labor/schemas'

interface ProviderMetrics {
  provider_id: string
  metrics: MetricResult[]
}

interface LaborSummaryResponse {
  status: 'ok' | 'fallback' | 'error'
  summary?: {
    byProvider: ProviderMetrics[]
  }
  message?: string
}

export default function LaborPage() {
  const [data, setData] = useState<ProviderMetrics[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function fetchLabor() {
      try {
        const res = await fetch('/api/labor/summary')
        if (!res.ok) {
          setError(true)
          return
        }
        const json: LaborSummaryResponse = await res.json()
        if (json.status === 'ok' && json.summary) {
          setData(json.summary.byProvider)
        } else {
          setError(true)
        }
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchLabor()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Laden...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-500 p-4 rounded-lg">
        <p className="text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Labor-Footprint Daten nicht verfügbar
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Users className="w-6 h-6 text-amber-400" />
        Hidden Labor Footprint
      </h2>

      <p className="text-sm text-gray-400 max-w-2xl">
        Erste Annäherung an Transparenz- und Labor-Risiken pro Modellanbieter. Alle Werte sind
        <span className="font-semibold"> Exposure/Proxies</span>, keine exakten Messungen.
      </p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((pm) => {
          const transparency = pm.metrics.find((m) => m.metric_id === 'transparency_risk_score_v1')
          if (!transparency) return null

          const score = typeof transparency.value === 'number' ? transparency.value : 0

          return (
            <div
              key={pm.provider_id}
              className="bg-secondary border border-gray-700 rounded-lg p-4 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="font-semibold">{pm.provider_id}</p>
                    <p className="text-xs text-gray-500">Transparency Risk (Proxy)</p>
                  </div>
                </div>
                <span className={badgeClass(score)}>{score.toFixed(0)}</span>
              </div>
              <p className="text-sm text-gray-300 line-clamp-2">{transparency.label}</p>
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                <span>
                  Confidence: <span className="font-semibold">{transparency.confidence}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  Proxy, not exact
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 p-3 bg-amber-900/30 border border-amber-700/50 rounded text-xs text-amber-200 flex gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5" />
        <p>
          Diese Werte sind heuristische Indizes basierend auf öffentlichen Quellen (z.B. HRW, Stanford FM Transparency
          Index). Sie messen <strong>Exposition</strong>, nicht tatsächlich geleistete Arbeitsstunden. Methodology-Details
          folgen auf einer eigenen Seite.
        </p>
      </div>
    </div>
  )
}

function badgeClass(score: number): string {
  if (score <= 25) return 'px-2 py-1 text-xs rounded bg-green-900/60 text-green-300'
  if (score <= 50) return 'px-2 py-1 text-xs rounded bg-yellow-900/60 text-yellow-300'
  if (score <= 75) return 'px-2 py-1 text-xs rounded bg-orange-900/60 text-orange-300'
  return 'px-2 py-1 text-xs rounded bg-red-900/60 text-red-300'
}
