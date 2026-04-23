import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

function runCmd(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 15000 }).toString().trim()
  } catch (e: any) {
    return e.stdout?.toString()?.trim() || ''
  }
}

function safeJson(raw: string): any {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

const IDP_COMPONENTS = [
  { name: 'Flux', namespace: 'flux-system', icon: '⚡' },
  { name: 'ArgoCD', namespace: 'argocd', icon: '🐙' },
  { name: 'Gatekeeper', namespace: 'gatekeeper-system', icon: '🛡' },
  { name: 'Keycloak', namespace: 'keycloak', icon: '🔑' },
  { name: 'Trivy', namespace: 'trivy-system', icon: '🔍' },
  { name: 'Prometheus', namespace: 'monitoring', icon: '📊' },
  { name: 'midPoint', namespace: 'midpoint', icon: '👤' },
  { name: 'Ingress', namespace: 'ingress-nginx', icon: '🌐' },
]

const TENANT_NAMESPACES = ['abwasser', 'agripower', 'stadtwerke-hh']

export async function GET() {
  try {
    // Parallel: nodes, pods all-ns, kustomizations, git sources, vuln reports, constraints
    const [nodesRaw, podsRaw, kustomRaw, gitRaw, vulnRaw, constraintsRaw] = [
      runCmd('kubectl get nodes -o json 2>/dev/null'),
      runCmd('kubectl get pods -A -o json 2>/dev/null'),
      runCmd('flux get kustomizations -A --output json 2>/dev/null || echo "[]"'),
      runCmd('flux get sources git -A --output json 2>/dev/null || echo "[]"'),
      runCmd('kubectl get vulnerabilityreports -A -o json 2>/dev/null || echo "[]"'),
      runCmd('kubectl get constraints -A -o json 2>/dev/null || echo "[]"'),
    ]

    const nodesData = safeJson(nodesRaw)
    const podsData = safeJson(podsRaw)
    const kustomData = safeJson(kustomRaw)
    const gitData = safeJson(gitRaw)
    const vulnData = safeJson(vulnRaw)
    const constraintsData = safeJson(constraintsRaw)

    // Cluster overview
    const nodeItems = nodesData?.items || []
    const cluster = {
      name: nodeItems[0]?.metadata?.name?.replace('-control-plane', '') || 'rook-lab',
      nodeCount: nodeItems.length,
      readyNodes: nodeItems.filter((n: any) =>
        n.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True'
      ).length,
      k8sVersion: nodeItems[0]?.status?.nodeInfo?.kubeletVersion || '',
    }

    // Pod map: namespace -> {ready, total}
    const podItems: any[] = podsData?.items || []
    const nsPods: Record<string, { ready: number; total: number }> = {}
    for (const pod of podItems) {
      const ns = pod.metadata?.namespace || 'default'
      if (!nsPods[ns]) nsPods[ns] = { ready: 0, total: 0 }
      nsPods[ns].total++
      const phase = pod.status?.phase
      const containerStatuses: any[] = pod.status?.containerStatuses || []
      const allReady = containerStatuses.length > 0 && containerStatuses.every((c: any) => c.ready)
      if (phase === 'Running' && allReady) nsPods[ns].ready++
      if (phase === 'Succeeded') nsPods[ns].ready++ // completed jobs count as healthy
    }

    // Component health
    const components = IDP_COMPONENTS.map(c => {
      const ns = nsPods[c.namespace] || { ready: 0, total: 0 }
      return {
        name: c.name,
        namespace: c.namespace,
        icon: c.icon,
        healthy: ns.total > 0 && ns.ready === ns.total,
        notFound: ns.total === 0,
        readyPods: ns.ready,
        totalPods: ns.total,
      }
    })

    // GitOps: kustomizations
    const kustomItems = Array.isArray(kustomData) ? kustomData : (kustomData?.items || [])
    const kustomizations = kustomItems.map((k: any) => ({
      name: k.metadata?.name || k.name || '',
      namespace: k.metadata?.namespace || '',
      ready: k.status?.conditions?.find((c: any) => c.type === 'Ready')?.status || k.status || 'Unknown',
      suspended: k.spec?.suspended || false,
      revision: k.status?.lastAppliedRevision || k.status?.artifact?.revision || '',
      message: k.status?.conditions?.find((c: any) => c.type === 'Ready')?.message || '',
    }))

    const gitItems = Array.isArray(gitData) ? gitData : (gitData?.items || [])
    const gitrepositories = gitItems.map((r: any) => ({
      name: r.metadata?.name || r.name || '',
      namespace: r.metadata?.namespace || '',
      ready: r.status?.conditions?.find((c: any) => c.type === 'Ready')?.status || r.status || 'Unknown',
      suspended: r.spec?.suspended || false,
      url: r.spec?.url || '',
      revision: r.status?.artifact?.revision || '',
    }))

    // Security: Trivy vulnerability summary
    const vulnItems: any[] = vulnData?.items || []
    const security = { reports: vulnItems.length, critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
    for (const report of vulnItems) {
      const s = report.report?.summary || {}
      security.critical += s.criticalCount ?? s.CRITICAL ?? 0
      security.high += s.highCount ?? s.HIGH ?? 0
      security.medium += s.mediumCount ?? s.MEDIUM ?? 0
      security.low += s.lowCount ?? s.LOW ?? 0
      security.unknown += s.unknownCount ?? s.UNKNOWN ?? 0
    }

    // Security: OPA Gatekeeper constraints
    const constraintItems: any[] = constraintsData?.items || []
    const opaViolations = constraintItems.reduce(
      (sum: number, c: any) => sum + (c.status?.totalViolations || 0), 0
    )

    // Tenants
    const tenants = TENANT_NAMESPACES.map(ns => ({
      namespace: ns,
      readyPods: nsPods[ns]?.ready || 0,
      totalPods: nsPods[ns]?.total || 0,
      status: (nsPods[ns]?.total || 0) > 0 ? 'active' : 'empty',
    }))

    return NextResponse.json({
      cluster,
      components,
      gitops: { kustomizations, gitrepositories },
      security: { ...security, opaViolations, opaConstraints: constraintItems.length },
      tenants,
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
