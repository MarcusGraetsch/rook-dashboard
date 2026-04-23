'use client'
import { useEffect, useState } from 'react'

interface ClusterInfo {
  name: string
  nodeCount: number
  readyNodes: number
  k8sVersion: string
}

interface Component {
  name: string
  namespace: string
  icon: string
  healthy: boolean
  notFound: boolean
  readyPods: number
  totalPods: number
}

interface Kustomization {
  name: string
  namespace: string
  ready: string
  suspended: boolean
  revision: string
  message: string
}

interface GitRepo {
  name: string
  namespace: string
  ready: string
  suspended: boolean
  url: string
  revision: string
}

interface SecurityInfo {
  reports: number
  critical: number
  high: number
  medium: number
  low: number
  unknown: number
  opaViolations: number
  opaConstraints: number
}

interface Tenant {
  namespace: string
  readyPods: number
  totalPods: number
  status: string
}

interface K8sData {
  cluster: ClusterInfo
  components: Component[]
  gitops: { kustomizations: Kustomization[]; gitrepositories: GitRepo[] }
  security: SecurityInfo
  tenants: Tenant[]
  error?: string
}

function StatusDot({ ok, unknown }: { ok: boolean; unknown?: boolean }) {
  if (unknown) return <span className="inline-block w-2 h-2 rounded-full bg-gray-500" />
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`} />
}

function SeverityBadge({ count, level }: { count: number; level: 'critical' | 'high' | 'medium' | 'low' }) {
  const colors = {
    critical: count > 0 ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-400',
    high: count > 0 ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400',
    medium: count > 0 ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400',
    low: count > 0 ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-400',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[level]}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)}: {count}
    </span>
  )
}

export default function KubernetesPage() {
  const [data, setData] = useState<K8sData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshed, setRefreshed] = useState<string>('')

  const load = () => {
    setLoading(true)
    fetch('/api/kubernetes')
      .then(r => r.json())
      .then(d => {
        setData(d)
        setRefreshed(new Date().toLocaleTimeString('de-DE'))
        setLoading(false)
      })
      .catch(e => {
        setData({ cluster: { name: '', nodeCount: 0, readyNodes: 0, k8sVersion: '' }, components: [], gitops: { kustomizations: [], gitrepositories: [] }, security: { reports: 0, critical: 0, high: 0, medium: 0, low: 0, unknown: 0, opaViolations: 0, opaConstraints: 0 }, tenants: [], error: String(e) })
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="p-6 text-gray-400">Verbinde mit Cluster…</div>

  if (!data || data.error) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">☸ IDP Kubernetes Platform</h1>
          <button onClick={load} className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded">↻ Reload</button>
        </div>
        <div className="card border border-red-500/40 bg-red-900/10 p-4">
          <p className="text-red-400 text-sm font-mono">{data?.error || 'Keine Daten'}</p>
          <p className="text-gray-500 text-xs mt-1">kubectl / flux nicht erreichbar oder Cluster nicht gestartet</p>
        </div>
      </div>
    )
  }

  const { cluster, components, gitops, security, tenants } = data
  const healthyComponents = components.filter(c => c.healthy).length
  const totalComponents = components.filter(c => !c.notFound).length
  const clusterHealthy = cluster.readyNodes === cluster.nodeCount && cluster.nodeCount > 0
  const securityClean = security.critical === 0 && security.high === 0 && security.opaViolations === 0

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">☸ IDP Kubernetes Platform</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Cluster: <span className="text-white font-mono">{cluster.name}</span>
            <span className="mx-2 text-gray-600">·</span>
            {cluster.k8sVersion}
            {refreshed && <span className="ml-3 text-gray-500">Letzte Abfrage: {refreshed}</span>}
          </p>
        </div>
        <button onClick={load} className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors">
          ↻ Reload
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className={`card p-4 border ${clusterHealthy ? 'border-green-500/30' : 'border-red-500/30'}`}>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Nodes</div>
          <div className="text-2xl font-bold">{cluster.readyNodes}<span className="text-gray-500 text-base">/{cluster.nodeCount}</span></div>
          <div className={`text-xs mt-1 ${clusterHealthy ? 'text-green-400' : 'text-red-400'}`}>{clusterHealthy ? 'Ready' : 'Degraded'}</div>
        </div>
        <div className={`card p-4 border ${healthyComponents === totalComponents && totalComponents > 0 ? 'border-green-500/30' : 'border-yellow-500/30'}`}>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Komponenten</div>
          <div className="text-2xl font-bold">{healthyComponents}<span className="text-gray-500 text-base">/{totalComponents}</span></div>
          <div className={`text-xs mt-1 ${healthyComponents === totalComponents && totalComponents > 0 ? 'text-green-400' : 'text-yellow-400'}`}>
            {healthyComponents === totalComponents ? 'Alle healthy' : `${totalComponents - healthyComponents} degraded`}
          </div>
        </div>
        <div className={`card p-4 border ${securityClean ? 'border-green-500/30' : 'border-red-500/30'}`}>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Security</div>
          <div className="text-2xl font-bold">{security.critical + security.high}</div>
          <div className={`text-xs mt-1 ${securityClean ? 'text-green-400' : 'text-red-400'}`}>
            {securityClean ? `${security.reports} Scans clean` : `Critical/High findings`}
          </div>
        </div>
        <div className="card p-4 border border-gray-700">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Tenants</div>
          <div className="text-2xl font-bold">{tenants.length}</div>
          <div className="text-xs mt-1 text-gray-400">{tenants.filter(t => t.status === 'active').length} aktiv</div>
        </div>
      </div>

      {/* Component health grid */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Platform Komponenten</h2>
        <div className="grid grid-cols-4 gap-2">
          {components.map(c => (
            <div key={c.name} className={`rounded-lg p-3 border ${
              c.notFound ? 'border-gray-700 bg-gray-800/30' :
              c.healthy ? 'border-green-500/20 bg-green-900/10' : 'border-red-500/20 bg-red-900/10'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{c.name}</div>
                  <div className="text-xs text-gray-500 truncate">{c.namespace}</div>
                </div>
                {c.notFound
                  ? <span className="text-xs text-gray-500">—</span>
                  : <StatusDot ok={c.healthy} />
                }
              </div>
              {!c.notFound && (
                <div className={`text-xs mt-2 font-mono ${c.healthy ? 'text-green-400' : 'text-red-400'}`}>
                  {c.readyPods}/{c.totalPods} pods ready
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Security posture */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Security Posture</h2>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-1.5">Trivy Image Scans ({security.reports} Reports)</div>
              <div className="flex gap-2 flex-wrap">
                <SeverityBadge count={security.critical} level="critical" />
                <SeverityBadge count={security.high} level="high" />
                <SeverityBadge count={security.medium} level="medium" />
                <SeverityBadge count={security.low} level="low" />
              </div>
            </div>
            <div className="border-t border-gray-700 pt-3">
              <div className="text-xs text-gray-500 mb-1.5">OPA Gatekeeper ({security.opaConstraints} Constraints)</div>
              <div className={`text-sm font-medium ${security.opaViolations === 0 ? 'text-green-400' : 'text-red-400'}`}>
                {security.opaViolations === 0 ? '✓ Keine Policy-Verletzungen' : `${security.opaViolations} Verletzung(en)`}
              </div>
            </div>
          </div>
        </div>

        {/* Tenant namespaces */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Tenant Namespaces</h2>
          <div className="space-y-2">
            {tenants.map(t => (
              <div key={t.namespace} className="flex items-center justify-between py-1.5 border-b border-gray-700 last:border-0">
                <div className="flex items-center gap-2">
                  <StatusDot ok={t.status === 'active'} unknown={t.status === 'empty'} />
                  <span className="font-mono text-sm">{t.namespace}</span>
                </div>
                <div className="text-xs text-gray-400">
                  {t.status === 'empty'
                    ? <span className="text-gray-500">no workloads</span>
                    : `${t.readyPods}/${t.totalPods} pods`
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GitOps */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">GitOps — Flux</h2>
        <div className="space-y-2">
          {gitops.kustomizations.length === 0 && gitops.gitrepositories.length === 0 && (
            <p className="text-gray-500 text-sm">Keine Flux-Ressourcen</p>
          )}
          {gitops.gitrepositories.map(r => (
            <div key={r.name} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-700">
              <StatusDot ok={r.ready === 'True'} />
              <span className="text-gray-400 w-20 text-xs">GitRepo</span>
              <span className="font-medium">{r.name}</span>
              <span className="text-gray-500 text-xs truncate flex-1">{r.url}</span>
              <span className="text-gray-500 font-mono text-xs">{r.revision.slice(0, 12)}</span>
            </div>
          ))}
          {gitops.kustomizations.map(k => (
            <div key={k.name} className="flex items-center gap-3 text-sm py-1.5">
              <StatusDot ok={k.ready === 'True'} unknown={k.suspended} />
              <span className="text-gray-400 w-20 text-xs">Kustomize</span>
              <span className="font-medium">{k.name}</span>
              {k.suspended && <span className="text-xs text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded">suspended</span>}
              <span className="text-gray-500 font-mono text-xs flex-1 truncate">{k.revision.slice(0, 40)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
