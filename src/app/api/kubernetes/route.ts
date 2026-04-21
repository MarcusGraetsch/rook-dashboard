import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { strict as assert } from 'assert'

function runCmd(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 15000 }).toString().trim()
  } catch (e: any) {
    return e.stdout?.toString()?.trim() || ''
  }
}

function safeJsonParse(raw: string): any {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export async function GET() {
  try {
    const [kustomizationsRaw, podsRaw, nodesRaw, gitrepositoriesRaw] = [
      runCmd('flux get kustomizations -A --format json 2>/dev/null || flux get kustomizations --format json'),
      runCmd('kubectl get pods -A --format json 2>/dev/null'),
      runCmd('kubectl get nodes -o json 2>/dev/null'),
      runCmd('flux get sources git -A --format json 2>/dev/null || flux get sources git --format json'),
    ]

    // Parse kustomizations
    let kustomizations: any[] = []
    try {
      const kData = safeJsonParse(kustomizationsRaw)
      kustomizations = Array.isArray(kData) ? kData.map((item: any) => ({
        name: item.metadata?.name || item.name || '',
        ready: item.status?.conditions?.find((c: any) => c.type === 'Ready')?.status || item.status || '',
        suspended: item.spec?.suspended || item.suspended || false,
        message: item.status?.conditions?.find((c: any) => c.type === 'Ready')?.message || item.message || '',
        revision: item.status?.artifact?.revision || item.revision || '',
      })) : []
    } catch {}

    // Parse pods
    let pods: any[] = []
    try {
      const pData = safeJsonParse(podsRaw)
      pods = (pData.items || pData || []).map((pod: any) => ({
        namespace: pod.metadata?.namespace || '',
        name: pod.metadata?.name || '',
        ready: `${pod.status?.readyReplicas ?? 0}/${pod.status?.replicas ?? 0}`,
        status: pod.status?.phase || 'Unknown',
        age: pod.metadata?.creationTimestamp || '',
      }))
    } catch {}

    // Parse nodes
    let nodes: any[] = []
    try {
      const nData = safeJsonParse(nodesRaw)
      nodes = (nData.items || nData || []).map((node: any) => ({
        name: node.metadata?.name || '',
        status: node.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
        roles: Object.keys(node.metadata?.labels || {}).filter(l => l.startsWith('node-role.kubernetes.io/')).map(l => l.replace('node-role.kubernetes.io/', '')).join(', ') || 'worker',
        version: node.status?.nodeInfo?.kubeletVersion || '',
        age: node.metadata?.creationTimestamp || '',
      }))
    } catch {}

    // Parse gitrepositories
    let gitrepositories: any[] = []
    try {
      const gData = safeJsonParse(gitrepositoriesRaw)
      gitrepositories = (Array.isArray(gData) ? gData : []).map((repo: any) => ({
        name: repo.metadata?.name || repo.name || '',
        ready: repo.status?.conditions?.find((c: any) => c.type === 'Ready')?.status || repo.status || '',
        suspended: repo.spec?.suspended || repo.suspended || false,
        url: repo.spec?.url || repo.url || '',
      }))
    } catch {}

    return NextResponse.json({ kustomizations, pods, nodes, gitrepositories })
  } catch (e: any) {
    return NextResponse.json({ kustomizations: [], pods: [], nodes: [], gitrepositories: [], error: String(e) }, { status: 500 })
  }
}
