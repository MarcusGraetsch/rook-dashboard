'use client'
import { useEffect, useState } from 'react'

interface K8sData {
  kustomizations: any[]
  pods: any[]
  nodes: any[]
  gitrepositories: any[]
  error?: string
}

export default function KubernetesPage() {
  const [data, setData] = useState<K8sData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/kubernetes')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => {
        setData({ kustomizations: [], pods: [], nodes: [], gitrepositories: [], error: String(e) })
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="p-6">Lädt...</div>
  if (!data) return <div className="p-6">Keine Daten</div>

  if (data.error) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">☸ Kubernetes Lab</h1>
        <div className="card border-red-400 bg-red-900/20">
          <p className="text-red-400">Fehler: {data.error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">☸ Kubernetes Lab</h1>

      {/* Git Repositories */}
      {data.gitrepositories.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Git Repositories</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="pb-2">Name</th>
                <th className="pb-2">Ready</th>
                <th className="pb-2">Suspended</th>
                <th className="pb-2">URL</th>
              </tr>
            </thead>
            <tbody>
              {data.gitrepositories.map((r: any, i: number) => (
                <tr key={r.name} className={i % 2 === 0 ? 'bg-gray-800/50' : ''}>
                  <td className="py-2">{r.name}</td>
                  <td><span className={r.ready === 'True' ? 'text-green-400' : 'text-red-400'}>{r.ready}</span></td>
                  <td><span className={r.suspended ? 'text-yellow-400' : 'text-gray-400'}>{String(r.suspended)}</span></td>
                  <td className="text-gray-400 truncate max-w-xs">{r.url}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Nodes */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Nodes</h2>
        {data.nodes.length === 0 ? <p className="text-gray-400">Keine Nodes</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="pb-2">Name</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Version</th>
              </tr>
            </thead>
            <tbody>
              {data.nodes.map((n: any, i: number) => (
                <tr key={n.name} className={i % 2 === 0 ? 'bg-gray-800/50' : ''}>
                  <td className="py-2">{n.name}</td>
                  <td><span className={n.status === 'Ready' ? 'text-green-400' : 'text-red-400'}>{n.status}</span></td>
                  <td>{n.roles}</td>
                  <td>{n.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Flux Kustomizations */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Flux Kustomizations</h2>
        {data.kustomizations.length === 0 ? <p className="text-gray-400">Keine Kustomizations</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="pb-2">Name</th>
                <th className="pb-2">Ready</th>
                <th className="pb-2">Revision</th>
                <th className="pb-2">Message</th>
              </tr>
            </thead>
            <tbody>
              {data.kustomizations.map((k: any, i: number) => (
                <tr key={k.name} className={i % 2 === 0 ? 'bg-gray-800/50' : ''}>
                  <td className="py-2">{k.name}</td>
                  <td><span className={k.ready === 'True' ? 'text-green-400' : 'text-red-400'}>{k.ready}</span></td>
                  <td className="text-gray-400 truncate max-w-xs">{k.revision}</td>
                  <td className="text-gray-400 truncate max-w-xs">{k.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pods */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Pods</h2>
        {data.pods.length === 0 ? <p className="text-gray-400">Keine Pods</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="pb-2">Namespace</th>
                <th className="pb-2">Name</th>
                <th className="pb-2">Ready</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Age</th>
              </tr>
            </thead>
            <tbody>
              {data.pods.map((p: any, i: number) => (
                <tr key={`${p.namespace}-${p.name}`} className={i % 2 === 0 ? 'bg-gray-800/50' : ''}>
                  <td className="py-2">{p.namespace}</td>
                  <td className="truncate max-w-xs">{p.name}</td>
                  <td>{p.ready}</td>
                  <td><span className={p.status === 'Running' ? 'text-green-400' : p.status === 'Pending' ? 'text-yellow-400' : 'text-gray-400'}>{p.status}</span></td>
                  <td className="text-gray-400">{p.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
