'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Shield, Users, Eye, Scale } from 'lucide-react'
import type { MetricResult, SocialMetrics } from '@/lib/labor/schemas'

interface ProviderMetrics {
  provider_id: string
  metrics: MetricResult[]
  socialMetrics?: SocialMetrics
}

interface LaborSummaryResponse {
  status: 'ok' | 'fallback' | 'error'
  summary?: {
    byProvider: ProviderMetrics[]
    social?: Record<string, SocialMetrics>
  }
  message?: string
}

interface ProviderDetailDrawerProps {
  provider: ProviderMetrics
  onClose: () => void
}

function ProviderDetailDrawer({ provider, onClose }: ProviderDetailDrawerProps) {
  const transparency = provider.metrics.find((m) => m.metric_id === 'transparency_risk_score_v1')
  const exposure = provider.metrics.find((m) => m.metric_id === 'hidden_labor_exposure_score_v1')
  const coverage = provider.metrics.find((m) => m.metric_id === 'source_coverage_score_v1')
  const social = provider.socialMetrics

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-secondary border-l border-gray-700 w-full max-w-md p-6 overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <AlertCircle className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold mb-6">{provider.provider_id}</h3>

        <div className="space-y-6">
          {/* Ecological Metrics */}
          {transparency && (
            <MetricSection
              title="Transparency Risk Score"
              metric={transparency}
              methodology={`Formel: 100 - transparency_score (direkter Index 0-100). Inputs: ${Array.isArray(transparency.sources) ? transparency.sources.join(', ') : 'keine'}. Annahmen: Höhere Werte = weniger Offenlegung.`}
            />
          )}

          {exposure && (
            <MetricSection
              title="Hidden Labor Exposure Score"
              metric={exposure}
              methodology={`Formel: 0.35 * (100 - labor_disclosure) + 0.25 * (100 - transparency) + outsourcing_penalty + contested_penalty. Inputs: labor_disclosure_score, transparency_score, outsourcing_opacity_flag, contested_labor_practices_flag. Annahmen: Proxy-basierte Schätzung, keine realen Arbeitsstunden.`}
            />
          )}

          {coverage && (
            <MetricSection
              title="Source Coverage Score"
              metric={coverage}
              methodology={`Formel: evidence_coverage_score (direkter Index 0-100). Inputs: empirische Abstützung der Quellen. Annahmen: Höhere Werte = besser empirisch abgestützt.`}
            />
          )}

          {/* Social Metrics */}
          {social && (
            <div className="border border-amber-700/50 rounded-lg p-4 bg-amber-900/20">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-400" />
                Social Metrics
              </h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Labor-Praktiken:</span>
                  <span className={ratingColor(social.laborRating)}>{social.laborRating} - {ratingDesc(social.laborRating)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Datenethik:</span>
                  <span className={ratingColor(social.dataEthics)}>{social.dataEthics} - {ratingDesc(social.dataEthics)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Kolonialismus-Index:</span>
                  <span className="font-bold text-amber-400">{social.colonialismIndex}/10</span>
                </div>
                {social.provider && (
                  <div className="pt-2 border-t border-gray-700">
                    <p className="text-xs text-gray-500">Provider:</p>
                    <p className="text-sm">{social.provider}</p>
                  </div>
                )}
                {social.clickworkerNotes && (
                  <div className="pt-2 border-t border-gray-700">
                    <p className="text-xs text-gray-500 mb-1">Notes:</p>
                    <p className="text-xs text-gray-400 whitespace-pre-line">{social.clickworkerNotes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ratingColor(rating: string): string {
  const colors: Record<string, string> = {
    'A': 'text-green-400 font-bold',
    'B': 'text-blue-400 font-bold',
    'C': 'text-yellow-400 font-bold',
    'D': 'text-orange-400 font-bold',
    'F': 'text-red-400 font-bold',
  }
  return colors[rating] || 'text-gray-400'
}

function ratingDesc(rating: string): string {
  const descs: Record<string, string> = {
    'A': 'Sehr gut',
    'B': 'Gut',
    'C': 'Befriedigend',
    'D': 'Mangelhaft',
    'F': 'Unzureichend',
  }
  return descs[rating] || ''
}

function MetricSection({ title, metric, methodology }: { title: string; metric: MetricResult; methodology: string }) {
  const score = typeof metric.value === 'number' ? metric.value : 0

  return (
    <div className="border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-sm">{title}</h4>
        <span className={badgeClass(score)}>{score.toFixed(1)}</span>
      </div>
      <p className="text-sm text-gray-300 mb-2">{metric.label}</p>
      <div className="text-xs text-gray-500 space-y-1">
        <p><span className="font-semibold">Version:</span> {metric.methodology_version}</p>
        <p><span className="font-semibold">Confidence:</span> {metric.confidence}</p>
        <p><span className="font-semibold">Unit:</span> {metric.unit}</p>
        <div className="mt-2 p-2 bg-gray-800/50 rounded">
          <p className="font-semibold text-gray-400 mb-1">Methodology:</p>
          <p className="text-gray-400">{methodology}</p>
        </div>
      </div>
    </div>
  )
}

export default function LaborPage() {
  const [data, setData] = useState<ProviderMetrics[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<ProviderMetrics | null>(null)

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
    <>
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
            const exposure = pm.metrics.find((m) => m.metric_id === 'hidden_labor_exposure_score_v1')
            const coverage = pm.metrics.find((m) => m.metric_id === 'source_coverage_score_v1')
            const social = pm.socialMetrics
            if (!transparency) return null

            const score = typeof transparency.value === 'number' ? transparency.value : 0

            return (
              <div
                key={pm.provider_id}
                className="bg-secondary border border-gray-700 rounded-lg p-4 flex flex-col gap-2 cursor-pointer hover:border-blue-500 transition-colors"
                onClick={() => setSelectedProvider(pm)}
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
                {exposure && coverage && (
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs px-2 py-1 rounded bg-amber-900/40 text-amber-300">
                      Exposure: {typeof exposure.value === 'number' ? exposure.value.toFixed(0) : '?'}
                    </span>
                    <span className="text-xs px-2 py-1 rounded bg-purple-900/40 text-purple-300">
                      Coverage: {typeof coverage.value === 'number' ? coverage.value.toFixed(0) : '?'}
                    </span>
                  </div>
                )}
                {social && (
                  <div className="flex gap-2 mt-2 border-t border-gray-700 pt-2">
                    <span className={`text-xs px-2 py-1 rounded ${ratingBg(social.laborRating)}`}>
                      Labor: {social.laborRating}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${ratingBg(social.dataEthics)}`}>
                      Ethics: {social.dataEthics}
                    </span>
                    <span className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-300">
                      Col: {social.colonialismIndex}/10
                    </span>
                  </div>
                )}
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

      {selectedProvider && (
        <ProviderDetailDrawer
          provider={selectedProvider}
          onClose={() => setSelectedProvider(null)}
        />
      )}
    </>
  )
}

function ratingBg(rating: string): string {
  const bgs: Record<string, string> = {
    'A': 'bg-green-900/40 text-green-300',
    'B': 'bg-blue-900/40 text-blue-300',
    'C': 'bg-yellow-900/40 text-yellow-300',
    'D': 'bg-orange-900/40 text-orange-300',
    'F': 'bg-red-900/40 text-red-300',
  }
  return bgs[rating] || 'bg-gray-700 text-gray-300'
}

function badgeClass(score: number): string {
  if (score <= 25) return 'px-2 py-1 text-xs rounded bg-green-900/60 text-green-300'
  if (score <= 50) return 'px-2 py-1 text-xs rounded bg-yellow-900/60 text-yellow-300'
  if (score <= 75) return 'px-2 py-1 text-xs rounded bg-orange-900/60 text-orange-300'
  return 'px-2 py-1 text-xs rounded bg-red-900/60 text-red-300'
}