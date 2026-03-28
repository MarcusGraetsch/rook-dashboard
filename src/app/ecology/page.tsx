'use client'

import { useEffect, useState } from 'react'
import { Leaf, Zap, CloudRain, Factory, Globe, Users, ChevronDown } from 'lucide-react'
import { getEcologicalInfo } from '@/lib/ecology'

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

export default function EcologyPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [modelImpacts, setModelImpacts] = useState<ModelImpact[]>([])
  const [socialMetrics, setSocialMetrics] = useState<Record<string, SocialMetrics>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expandedModel, setExpandedModel] = useState<string | null>(null)

  useEffect(() => {
    async function fetchEcology() {
      try {
        const res = await fetch('/api/ecology')
        if (res.ok) {
          const data = await res.json()
          setSummary(data.summary)
          setModelImpacts(data.byModel || [])
          setSocialMetrics(data.socialMetrics || {})
        } else {
          setError(true)
        }
      } catch (e) {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    
    fetchEcology()
    const interval = setInterval(fetchEcology, 60000)
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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-400">Laden...</p></div>
  }

  if (error || !summary) {
    return (
      <div className="bg-red-900/50 border border-red-500 p-4 rounded-lg">
        <p className="text-red-400">⚠️ Ökologische Daten nicht verfügbar</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Leaf className="w-8 h-8 text-green-500" />
        Ökologischer Impact
      </h2>
      
      {/* CO2 Warning Banner */}
      <div className="bg-gradient-to-r from-amber-900/50 to-orange-900/50 border border-amber-600/50 p-4 rounded-lg">
        <p className="text-amber-200">
          <strong>Wichtig:</strong> Diese Zahlen sind Schätzungen basierend auf公开研究数据 (EcoLogits, UC Riverside).
          Tatsächliche Werte variieren je nach Hardware, Rechenzentrum und Nutzungsmuster.
        </p>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Zap className="w-8 h-8 text-yellow-500" />
            <div>
              <p className="text-sm text-gray-400">Energie (gesammelt)</p>
              <p className="text-2xl font-bold">{summary.totalEnergyKwh.toFixed(4)} kWh</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <CloudRain className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-sm text-gray-400">Wasser</p>
              <p className="text-2xl font-bold">{(summary.totalWaterMl / 1000).toFixed(2)} L</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Factory className="w-8 h-8 text-gray-500" />
            <div>
              <p className="text-sm text-gray-400">CO₂ (Hardware)</p>
              <p className="text-2xl font-bold">{summary.totalHardwareCo2G.toFixed(1)} g</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Globe className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-sm text-gray-400">CO₂ (Gesamt)</p>
              <p className="text-2xl font-bold">{summary.totalCo2AllG.toFixed(1)} g</p>
              <p className="text-xs text-gray-500">{summary.co2EquivalentDescription}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Model Breakdown */}
      <div className="bg-secondary p-6 rounded-lg border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Impact nach Model</h3>
        
        <div className="space-y-3">
          {modelImpacts.map((impact) => {
            const info = getEcologicalInfo(impact.modelId)
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
                      <p className="text-xs text-gray-500">{social.clickworkerNotes}</p>
                    </div>
                    
                    {info && (
                      <div className="mt-4 pt-4 border-t border-gray-700 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-400">Energie/1M Tokens</p>
                          <p className="font-mono">{info.energyPerMillion}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">CO₂/1M Tokens</p>
                          <p className="font-mono">{info.co2PerMillion}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Wasser/1M Tokens</p>
                          <p className="font-mono">{info.waterPerMillion}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      
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
    </div>
  )
}
