'use client'

import { useEffect, useState } from 'react'
import { Leaf, Zap, CloudRain, Factory, Globe, Users, ChevronDown, Database, RefreshCw, AlertTriangle } from 'lucide-react'

interface DbMetric {
  id: string
  source_id: string
  category: string
  metric_type: string
  provider?: string
  model_id?: string
  value: number
  value_unit: string
  confidence: string
  source_note?: string
  fetched_at: string
}

interface SourceStatus {
  id: string
  name: string
  url: string
  fetch_status?: string
  last_fetched?: string
}

interface ModelImpact {
  modelId: string
  sessions: number
  totalTokens: number
  energyKwh: number
  co2G: number
  waterMl: number
  hardwareManufacturingCo2G: number
  totalCo2G: number
}

interface SocialMetrics {
  modelId: string
  provider: string
  laborRating: string
  dataEthics: string
  colonialismIndex: number
  clickworkerNotes: string
}

interface Summary {
  totalEnergyKwh: number
  totalCo2G: number
  totalWaterMl: number
  totalHardwareCo2G: number
  totalCo2AllG: number
  co2EquivalentDescription: string
  sessionCount: number
}

interface Infrastructure {
  cpuHours: number
  memoryGbHours: number
  networkMb: number
  energyKwh: number
  co2G: number
  waterMl: number
}

// Tooltip explanations for metrics
const METRIC_EXPLANATIONS = {
  energy: {
    title: 'Energieberechnung',
    formula: 'Energie (kWh) = Σ (Model-Daten × Token/1M) + Infrastructure',
    variables: [
      'Model-Daten: Energieverbrauch pro 1M Tokens (Quelle: EcoLogits, UC Riverside)',
      'Token-Zählung: inputTokens + outputTokens aus Session-Daten',
      'Infrastructure: CPU-Stunden × 0.05 + RAM-GBh × 0.005 + Netzwerk-MB × 0.001',
    ],
    measurement: 'Token-Tracking: API-Response liefert inputTokens, outputTokens, totalTokens pro Session',
  },
  co2: {
    title: 'CO₂-Berechnung',
    formula: 'CO₂ (g) = Energie (kWh) × Grid-Faktor + Hardware-Manufacturing',
    variables: [
      'Grid-Faktor: ~400 gCO₂/kWh (globaler Durchschnitt)',
      'Hardware-Manufacturing: CO₂ × (Lifecycle-Faktor - 1)',
      'Lifecycle-Faktor: 1.8-2.0 je nach Model (GPU-Herstellung)',
    ],
    measurement: 'CO₂ = Operativ + Hardware (amortisiert über Nutzungsdauer)',
  },
  water: {
    title: 'Wasserverbrauch',
    formula: 'Wasser (ml) = Energie (kWh) × 500 ml/kWh',
    variables: [
      'Kühlung: ~500ml Wasser pro kWh (Durchschnitt Rechenzentrum)',
      'Bezogen auf Inference-Energieverbrauch',
    ],
    measurement: 'Schätzung basierend auf Energieverbrauch und Kühlbedarf',
  },
  hardware: {
    title: 'Hardware-CO₂',
    formula: 'Hardware-CO₂ = Operational-CO₂ × (Lifecycle-Faktor - 1)',
    variables: [
      'Lifecycle-Faktor: 1.8 (MiniMax) bis 2.0 (GPT-4)',
      'Beinhaltet GPU-Herstellung, Transport, Entsorgung',
    ],
    measurement: 'Amortisiert über geschätzte GPU-Lebensdauer (3-5 Jahre)',
  },
  infrastructure: {
    title: 'Infrastructure',
    formula: 'Infra-CO₂ = (CPUh × 0.05 + RAMh × 0.005 + NetMB × 0.001) × 400',
    variables: [
      'CPU: ~0.05 kWh pro Core-Stunde',
      'RAM: ~0.005 kWh pro GB-Stunde',
      'Netzwerk: ~0.001 kWh pro MB',
      'Grid: ~400 gCO₂/kWh',
    ],
    measurement: 'Basierend auf System-Uptime und geschätzter Auslastung (2 vCPU × 20%)',
  },
}

export default function EcologyPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [infrastructure, setInfrastructure] = useState<Infrastructure | null>(null)
  const [modelImpacts, setModelImpacts] = useState<ModelImpact[]>([])
  const [socialMetrics, setSocialMetrics] = useState<Record<string, SocialMetrics>>({})
  const [dbMetrics, setDbMetrics] = useState<DbMetric[]>([])
  const [sources, setSources] = useState<SourceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [usingFallback, setUsingFallback] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [tooltip, setTooltip] = useState<{key: string, x: number, y: number, placement: 'top' | 'bottom'} | null>(null)

  // Fetch from metrics API
  useEffect(() => {
    async function fetchMetrics() {
      try {
        // Try to fetch from metrics database
        const res = await fetch('/api/metrics')
        if (res.ok) {
          const data = await res.json()
          
          if (data.status === 'fallback') {
            // Metrics DB not available, use fallback
            setUsingFallback(true)
            setDbMetrics([
              ...(data.fallback?.ecological || []),
              ...(data.fallback?.social || []),
              ...(data.fallback?.supply_chain || [])
            ])
          } else {
            // Got data from metrics DB
            setUsingFallback(false)
            setDbMetrics([
              ...(data.metrics?.ecological || []),
              ...(data.metrics?.social || []),
              ...(data.metrics?.supply_chain || [])
            ])
          }
          
          // Also get source status
          const sourceRes = await fetch('/api/metrics?sources=true')
          if (sourceRes.ok) {
            const sourceData = await sourceRes.json()
            setSources(sourceData.sources || [])
          }
        } else {
          setError(true)
        }
      } catch (e) {
        setError(true)
      } finally {
        setLoading(false)
        setLastRefresh(new Date())
      }
    }
    
    // Also fetch session-based ecological data
    async function fetchEcology() {
      try {
        const res = await fetch('/api/ecology')
        if (res.ok) {
          const data = await res.json()
          setSummary(data.summary)
          setInfrastructure(data.infrastructure || null)
          setModelImpacts(data.byModel || [])
          setSocialMetrics(data.socialMetrics || {})
        }
      } catch (e) {
        // Non-critical, continue without
      }
    }
    
    fetchMetrics()
    fetchEcology()
    
    const interval = setInterval(fetchMetrics, 60000)
    return () => clearInterval(interval)
  }, [])

  const ratingColors: Record<string, string> = {
    'A': 'text-green-400',
    'B+': 'text-green-500',
    'B': 'text-green-600',
    'C': 'text-yellow-400',
    'D': 'text-orange-400',
    'F': 'text-red-400',
  }

  // Get metrics from database by type
  function getDbMetric(category: string, metricType: string, provider?: string): DbMetric | undefined {
    return dbMetrics.find(m => 
      m.category === category && 
      m.metric_type === metricType &&
      (!provider || m.provider === provider)
    )
  }

  // Show tooltip on hover - positioned based on available space
  function showTooltip(key: string, e: React.MouseEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const tooltipHeight = 200 // approximate tooltip height
    
    // Default to top, but if not enough space above, show below
    const spaceAbove = rect.top
    const placement = spaceAbove > tooltipHeight ? 'top' : 'bottom'
    
    setTooltip({ key, x: rect.left + rect.width / 2, y: rect.top, placement })
  }

  function hideTooltip() {
    setTooltip(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-400">Laden...</p></div>
  }

  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-500 p-4 rounded-lg">
        <p className="text-red-400">⚠️ Ökologische Daten nicht verfügbar</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Leaf className="w-8 h-8 text-green-500" />
          Ökologischer Impact
        </h2>
        
        <div className="flex items-center gap-2">
          {usingFallback && (
            <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-900/30 px-2 py-1 rounded">
              <Database className="w-3 h-3" />
              Demo-Daten
            </span>
          )}
          {lastRefresh && (
            <span className="text-xs text-gray-500">
              <RefreshCw className="w-3 h-3 inline mr-1" />
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
      
      {/* Source Status */}
      {sources.length > 0 && (
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            Datenquellen
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {sources.map(source => (
              <div key={source.id} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${
                  source.fetch_status === 'success' ? 'bg-green-400' :
                  source.fetch_status === 'failed' ? 'bg-red-400' :
                  'bg-gray-400'
                }`} />
                <span className="text-gray-300">{source.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* CO2 Warning Banner */}
      <div className="bg-gradient-to-r from-amber-900/50 to-orange-900/50 border border-amber-600/50 p-4 rounded-lg">
        <p className="text-amber-200">
          <strong>Wichtig:</strong> Diese Zahlen sind Schätzungen basierend auf öffentlichen Forschungsdaten 
          (EcoLogits, UC Riverside, RMI). Tatsächliche Werte variieren je nach Hardware, 
          Rechenzentrum und Nutzungsmuster.
        </p>
      </div>
      
      {/* Infrastructure Section - Prominent display */}
      {infrastructure && (
        <div 
          className="bg-secondary p-6 rounded-lg border border-purple-500/50"
          onMouseEnter={(e) => showTooltip('infrastructure', e)}
          onMouseLeave={hideTooltip}
        >
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-purple-400" />
            Infrastructure Impact (VM/Server)
            <span className="text-xs text-gray-500 ml-2">(Hover for details)</span>
          </h3>
          
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-accent/30 p-3 rounded">
              <p className="text-xs text-gray-400">CPU Hours</p>
              <p className="text-xl font-mono">{infrastructure.cpuHours.toFixed(1)} h</p>
              <p className="text-xs text-gray-500">~2 vCPU × 20%</p>
            </div>
            <div className="bg-accent/30 p-3 rounded">
              <p className="text-xs text-gray-400">Memory Hours</p>
              <p className="text-xl font-mono">{infrastructure.memoryGbHours.toFixed(1)} GBh</p>
              <p className="text-xs text-gray-500">~2 GB average</p>
            </div>
            <div className="bg-accent/30 p-3 rounded">
              <p className="text-xs text-gray-400">Network</p>
              <p className="text-xl font-mono">{infrastructure.networkMb.toFixed(0)} MB</p>
              <p className="text-xs text-gray-500">~50 MB/hour</p>
            </div>
            <div className="bg-accent/30 p-3 rounded border border-purple-500/30">
              <p className="text-xs text-gray-400">Infrastructure CO₂</p>
              <p className="text-xl font-mono text-purple-400">{infrastructure.co2G.toFixed(2)} g</p>
              <p className="text-xs text-gray-500">{infrastructure.energyKwh.toFixed(4)} kWh</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div 
          className="bg-secondary p-4 rounded-lg border border-gray-700 hover:border-yellow-500 cursor-help relative"
          onMouseEnter={(e) => showTooltip('energy', e)}
          onMouseLeave={hideTooltip}
        >
          <div className="flex items-center gap-3">
            <Zap className="w-8 h-8 text-yellow-500" />
            <div>
              <p className="text-sm text-gray-400">Energie (gesammelt)</p>
              <p className="text-2xl font-bold">{summary?.totalEnergyKwh.toFixed(4) || '0'} kWh</p>
            </div>
          </div>
        </div>
        
        <div 
          className="bg-secondary p-4 rounded-lg border border-gray-700 hover:border-blue-500 cursor-help"
          onMouseEnter={(e) => showTooltip('water', e)}
          onMouseLeave={hideTooltip}
        >
          <div className="flex items-center gap-3">
            <CloudRain className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-sm text-gray-400">Wasser</p>
              <p className="text-2xl font-bold">{((summary?.totalWaterMl || 0) / 1000).toFixed(2)} L</p>
            </div>
          </div>
        </div>
        
        <div 
          className="bg-secondary p-4 rounded-lg border border-gray-700 hover:border-gray-500 cursor-help"
          onMouseEnter={(e) => showTooltip('hardware', e)}
          onMouseLeave={hideTooltip}
        >
          <div className="flex items-center gap-3">
            <Factory className="w-8 h-8 text-gray-500" />
            <div>
              <p className="text-sm text-gray-400">CO₂ (Hardware)</p>
              <p className="text-2xl font-bold">{summary?.totalHardwareCo2G.toFixed(1) || '0'} g</p>
            </div>
          </div>
        </div>
        
        <div 
          className="bg-secondary p-4 rounded-lg border border-gray-700 hover:border-green-500 cursor-help"
          onMouseEnter={(e) => showTooltip('co2', e)}
          onMouseLeave={hideTooltip}
        >
          <div className="flex items-center gap-3">
            <Globe className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-sm text-gray-400">CO₂ (Gesamt)</p>
              <p className="text-2xl font-bold">{summary?.totalCo2AllG.toFixed(1) || '0'} g</p>
              <p className="text-xs text-gray-500">{summary?.co2EquivalentDescription}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Live Metrics from Database */}
      {dbMetrics.length > 0 && (
        <div className="bg-secondary p-6 rounded-lg border border-gray-700">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            Live Metrics aus Datenbank
          </h3>
          
          {/* Ecological Metrics */}
          {dbMetrics.filter(m => m.category === 'ecological').length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-green-400 mb-2">Ökologisch</h4>
              <div className="grid grid-cols-3 gap-3">
                {dbMetrics
                  .filter(m => m.category === 'ecological')
                  .map(metric => (
                    <div key={metric.id} className="bg-accent/30 p-3 rounded">
                      <p className="text-xs text-gray-400">{metric.metric_type.replace(/_/g, ' ')}</p>
                      <p className="text-lg font-bold">{metric.value} {metric.value_unit}</p>
                      <p className="text-xs text-gray-500">{metric.provider} {metric.model_id && `/ ${metric.model_id}`}</p>
                      <p className="text-xs text-gray-600 mt-1">Confidence: {metric.confidence}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* Social Metrics */}
          {dbMetrics.filter(m => m.category === 'social').length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-amber-400 mb-2">Sozial</h4>
              <div className="grid grid-cols-3 gap-3">
                {dbMetrics
                  .filter(m => m.category === 'social')
                  .map(metric => (
                    <div key={metric.id} className="bg-accent/30 p-3 rounded">
                      <p className="text-xs text-gray-400">{metric.metric_type.replace(/_/g, ' ')}</p>
                      <p className="text-lg font-bold">{metric.value} {metric.value_unit}</p>
                      <p className="text-xs text-gray-500">{metric.provider || 'Various'}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* Supply Chain Metrics */}
          {dbMetrics.filter(m => m.category === 'supply_chain').length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-orange-400 mb-2">Supply Chain</h4>
              <div className="grid grid-cols-3 gap-3">
                {dbMetrics
                  .filter(m => m.category === 'supply_chain')
                  .map(metric => (
                    <div key={metric.id} className="bg-accent/30 p-3 rounded">
                      <p className="text-xs text-gray-400">{metric.metric_type.replace(/_/g, ' ')}</p>
                      <p className="text-lg font-bold">{metric.value} {metric.value_unit}</p>
                      <p className="text-xs text-gray-500">{metric.provider || 'Various'}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Model Breakdown (from session data) */}
      {modelImpacts.length > 0 && (
        <div className="bg-secondary p-6 rounded-lg border border-gray-700">
          <h3 className="text-lg font-bold mb-4">Impact nach Model (Session-basiert)</h3>
          
          <div className="space-y-3">
            {modelImpacts.map((impact) => {
              const social = socialMetrics[impact.modelId]
              const isExpanded = expandedModel === impact.modelId
              
              return (
                <div key={impact.modelId} className="bg-accent/30 rounded-lg overflow-hidden">
                  <div 
                    className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setExpandedModel(isExpanded ? null : impact.modelId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        <div>
                          <p className="font-medium">{impact.modelId}</p>
                          <p className="text-xs text-gray-400">{impact.sessions} Sessions • {impact.totalTokens.toLocaleString()} Tokens</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div>
                          <p className="text-gray-400">Energie</p>
                          <p className="font-mono">{impact.energyKwh.toFixed(5)} kWh</p>
                        </div>
                        <div>
                          <p className="text-gray-400">CO₂</p>
                          <p className="font-mono text-green-400">{impact.totalCo2G.toFixed(2)} g</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Wasser</p>
                          <p className="font-mono">{impact.waterMl.toFixed(1)} ml</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {isExpanded && social && (
                    <div className="p-4 border-t border-gray-700 bg-black/20">
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Labor-Praktiken</p>
                          <p className={`font-bold ${ratingColors[social.laborRating] || 'text-gray-400'}`}>
                            {social.laborRating}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Daten-Ethik</p>
                          <p className={`font-bold ${ratingColors[social.dataEthics] || 'text-gray-400'}`}>
                            {social.dataEthics}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Kolonialismus-Index</p>
                          <p className="font-bold text-amber-400">{social.colonialismIndex}/10</p>
                        </div>
                      </div>
                      
                      <div className="text-sm">
                        <p className="text-gray-400 mb-1">Provider</p>
                        <p className="mb-2">{social.provider}</p>
                        <p className="text-xs text-gray-500 whitespace-pre-line">{social.clickworkerNotes}</p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      
      {/* Sources */}
      <div className="bg-secondary p-6 rounded-lg border border-gray-700">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-blue-500" />
          Quellen & Referenzen
        </h3>
        
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <h4 className="font-medium mb-2 text-amber-400">Konfliktmineralien & Hardware</h4>
            <ul className="space-y-2 text-gray-300">
              <li>
                <a href="https://www.responsiblemineralsinitiative.org" className="text-blue-400 hover:underline" target="_blank" rel="noopener">
                  Responsible Minerals Initiative (RMI)
                </a>
                <p className="text-xs text-gray-500">Tracking von 3TG (Tantal, Zinn, Wolfram, Gold) in Elektronik-Lieferketten</p>
              </li>
              <li>
                <a href="https://www.fairphone.com" className="text-blue-400 hover:underline" target="_blank" rel="noopener">
                  Fairphone — Fair Materials Sourcing
                </a>
                <p className="text-xs text-gray-500">Transparente Lieferketten für Kobalt, Kupfer in IT-Hardware</p>
              </li>
              <li>
                <a href="https://www.z2data.com" className="text-blue-400 hover:underline" target="_blank" rel="noopener">
                  Z2Data — Conflict Minerals Insights
                </a>
                <p className="text-xs text-gray-500">Smelters & Refiners zu Konfliktzonen tracken</p>
              </li>
              <li>
                <a href="https://www.giz.de" className="text-blue-400 hover:underline" target="_blank" rel="noopener">
                  GIZ — Konfliktfreie Rohstoffe
                </a>
                <p className="text-xs text-gray-500">Great-Lakes-Gebiet Afrika, bewaffnete Konflikte durch Rohstoffabbau</p>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium mb-2 text-amber-400">Geopolitik & Rechenzentren</h4>
            <ul className="space-y-2 text-gray-300">
              <li>
                <a href="https://www.datacentremagazine.com" className="text-blue-400 hover:underline" target="_blank" rel="noopener">
                  Data Centre Magazine / DC Byte
                </a>
                <p className="text-xs text-gray-500">Verwundbarkeit von Rechenzentren im Nahen Osten, Angriffe auf AWS</p>
              </li>
              <li>
                <a href="https://techpolicy.press" className="text-blue-400 hover:underline" target="_blank" rel="noopener">
                  TechPolicy.Press
                </a>
                <p className="text-xs text-gray-500">Drohnenangriffe auf KI-Infrastruktur, Hyperscaler im Krieg</p>
              </li>
              <li>
                <a href="https://www.weforum.org" className="text-blue-400 hover:underline" target="_blank" rel="noopener">
                  World Economic Forum (WEF)
                </a>
                <p className="text-xs text-gray-500">Gallium, Germanium Exportbeschränkungen, kritische Rohstoffe</p>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-blue-900/30 rounded border border-blue-700/50">
          <p className="text-sm text-blue-200">
            <strong>Zusammenhang:</strong> Die KI-Infrastruktur ist mit Konfliktzonen verbunden — 
            von Konfliktmineralien (RMI, Z2Data) über geopolitische Risiken für Rechenzentren 
            (DC Byte, TechPolicy.Press) bis zu Exportbeschränkungen kritischer Rohstoffe (WEF, GIZ).
          </p>
        </div>
      </div>
      
      {/* Social Impact Explanation */}
      <div className="bg-secondary p-6 rounded-lg border border-gray-700">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-500" />
          Soziale Metriken — Was bedeuten die Ratings?
        </h3>
        
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <h4 className="font-medium mb-2 text-amber-400">Labor-Praktiken</h4>
            <ul className="space-y-1 text-gray-300">
              <li><span className="text-green-400">A/B+</span> — Dokumentierte, faire Arbeitsbedingungen</li>
              <li><span className="text-yellow-400">C</span> — Begrenzte Transparenz, einige Bedenken</li>
              <li><span className="text-red-400">D/F</span> — Dokumentierte Ausbeutung</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium mb-2 text-amber-400">Kolonialismus-Index</h4>
            <ul className="space-y-1 text-gray-300">
              <li><span className="text-green-400">0-3</span> — Ethische Praktiken, lokale Wertschöpfung</li>
              <li><span className="text-yellow-400">4-6</span> — Gemischte Praktiken, einige Extraktion</li>
              <li><span className="text-red-400">7-10</span> — Signifikante Wertschöpfungs-Extraktion</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-amber-900/30 rounded border border-amber-700/50">
          <p className="text-sm text-amber-200">
            <strong>Hinweis:</strong> Diese Metriken basieren auf öffentlich zugänglichen Informationen, 
            Arbeiter-Berichten und Forschungsstudien. Sie sind nicht vollständig 
            und sollten als Orientierungshilfe dienen, nicht als definitive Bewertung.
          </p>
        </div>
      </div>

      {/* Tooltip for metric explanations - auto-positioned */}
      {tooltip && (
        <div 
          className="fixed z-50 bg-gray-900 border border-gray-600 rounded-lg p-4 shadow-xl"
          style={{ 
            left: tooltip.x, 
            top: tooltip.placement === 'top' ? tooltip.y - 10 : tooltip.y + 10,
            transform: tooltip.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            maxWidth: '400px'
          }}
        >
          {METRIC_EXPLANATIONS[tooltip.key as keyof typeof METRIC_EXPLANATIONS] && (() => {
            const exp = METRIC_EXPLANATIONS[tooltip.key as keyof typeof METRIC_EXPLANATIONS]
            return (
              <>
                <h4 className="font-bold text-white mb-2">{exp.title}</h4>
                <p className="text-xs text-gray-300 mb-2 font-mono">{exp.formula}</p>
                <div className="text-xs text-gray-400 mb-2">
                  <p className="font-semibold text-gray-300 mb-1">Variablen:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {exp.variables.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-gray-500 italic">{exp.measurement}</p>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
