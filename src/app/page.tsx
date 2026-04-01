'use client'

import { useEffect, useState } from 'react'
import { Activity, Cpu, HardDrive, Clock, Users, Zap, RefreshCw, Terminal, Database, Shield } from 'lucide-react'
import Link from 'next/link'
import KpiCard from '@/components/dashboard/KpiCard'
import DateRangePicker, { DateRange } from '@/components/dashboard/DateRangePicker'

interface Session {
  key: string;
  displayName: string;
  model: string;
  totalTokens: number;
  updatedAt: number;
  lastChannel: string;
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  workspace: string;
  sandbox?: boolean;
}

interface SystemStats {
  uptime: string;
  cpu: string;
  memory: { total: string; used: string; free: string };
  disk: string;
}

interface Activity {
  type: 'session' | 'agent' | 'system'
  message: string
  time: Date
}

interface RuntimeBackupStatus {
  timer: {
    active_state: string | null
    sub_state: string | null
    unit_file_state: string | null
    next_run_at: string | null
    last_trigger_at: string | null
  }
  latest_snapshot: {
    id: string
    path: string
    created_at: string
    size: string | null
    includes_dashboard_db: boolean
    includes_task_archive: boolean
    includes_runtime_archive: boolean
    gdrive_remote: string | null
  } | null
}

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [defaultModel, setDefaultModel] = useState<string>('MiniMax-M2.5')
  const [loading, setLoading] = useState(true)
  const [gatewayError, setGatewayError] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [backupStatus, setBackupStatus] = useState<RuntimeBackupStatus | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    to: new Date()
  })

  useEffect(() => {
    async function fetchData() {
      try {
        // Build query params from date range
        const params = new URLSearchParams();
        if (dateRange.from) params.set('from', dateRange.from.toISOString());
        if (dateRange.to) params.set('to', dateRange.to.toISOString());
        
        const queryString = params.toString();
        const sessionsUrl = queryString ? `/api/gateway/sessions?${queryString}` : '/api/gateway/sessions';
        
        const [sessionsRes, statsRes, backupRes] = await Promise.all([
          fetch(sessionsUrl),
          fetch('/api/gateway/stats'),
          fetch('/api/control/backup'),
        ])
        
        if (sessionsRes.ok) {
          const data = await sessionsRes.json()
          setSessions(data.sessions || [])
          setAgents(data.agents || [])
          setDefaultModel(data.defaultModel || 'MiniMax-M2.5')
          
          // Build activity feed from sessions
          const newActivities: Activity[] = data.sessions
            .slice(0, 5)
            .map((s: Session) => ({
              type: 'session' as const,
              message: `${s.displayName} — ${s.totalTokens.toLocaleString()} tokens`,
              time: new Date(s.updatedAt),
            }))
          setActivities(newActivities)
        } else {
          setGatewayError(true)
        }
        
        if (statsRes.ok) {
          const statsData = await statsRes.json()
          setStats(statsData)
        }

        if (backupRes.ok) {
          const backupJson = await backupRes.json()
          setBackupStatus(backupJson.backup || null)
        }
      } catch (e) {
        console.error('Failed to fetch data:', e)
        setGatewayError(true)
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [dateRange])

  const activeSessions = sessions.filter(s => 
    Date.now() - s.updatedAt < 5 * 60 * 1000
  ).length
  const latestBackup = backupStatus?.latest_snapshot || null
  const backupHealthy =
    latestBackup?.includes_dashboard_db &&
    latestBackup?.includes_task_archive &&
    latestBackup?.includes_runtime_archive

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        
        {/* Date Range Picker */}
        <div className="flex items-center gap-2">
          <DateRangePicker
            value={dateRange}
            onChange={(range) => {
              setDateRange(range)
              // Here you would typically trigger a data refresh with the new range
              // For example: fetchData(range.from, range.to)
              console.log('Date range changed:', range)
            }}
          />
          <Link
            href="/kanban"
            className="flex items-center gap-2 px-4 py-2 bg-highlight hover:bg-highlight/80 rounded-lg text-white text-sm"
          >
            📋 Kanban
          </Link>
          <Link
            href="/agents"
            className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-accent rounded-lg text-sm"
          >
            <Users className="w-4 h-4" />
            Agents
          </Link>
        </div>
      </div>
      
      {gatewayError && (
        <div className="bg-red-900/50 border border-red-500 p-4 rounded-lg flex items-center justify-between">
          <p className="text-red-400">⚠️ Gateway nicht erreichbar</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {/* KPI Cards - Real-Time */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Sessions"
          value={sessions.length}
          icon={<Activity className="w-5 h-5" />}
          live={true}
        />
        <KpiCard
          label="Agents"
          value={agents.length}
          icon={<Users className="w-5 h-5" />}
        />
        <KpiCard
          label="CPU Load"
          value={stats?.cpu?.split(' ')[0] || '—'}
          unit={stats?.cpu ? 'load' : undefined}
          icon={<Cpu className="w-5 h-5" />}
        />
        <KpiCard
          label="Memory"
          value={stats?.memory?.used || '—'}
          unit={stats?.memory ? `/${stats.memory.total}` : undefined}
          icon={<HardDrive className="w-5 h-5" />}
          live={true}
        />
      </div>
      
      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Agent Status */}
        <div className="col-span-2 bg-secondary p-6 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Zap className="w-5 h-5 text-highlight" />
              Agent Status
            </h3>
            <Link href="/agents" className="text-sm text-highlight hover:underline">
              Alle anzeigen →
            </Link>
          </div>
          {loading ? (
            <p className="text-gray-400">Laden...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {agents.map((agent) => {
                const agentSession = sessions.find(s => s.key.includes(`:${agent.id}:`));
                const isActive = agentSession && (Date.now() - agentSession.updatedAt < 5 * 60 * 1000);
                
                return (
                  <div key={agent.id} className="flex items-center justify-between p-3 bg-accent/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                      <span className="text-xl">{agent.emoji}</span>
                      <div>
                        <p className="font-medium">{agent.name}</p>
                        <p className="text-xs text-gray-500">{agent.id}</p>
                      </div>
                    </div>
                    {agent.sandbox && (
                      <span className="text-xs bg-purple-600 px-2 py-0.5 rounded">sandbox</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Activity Feed */}
        <div className="bg-secondary p-6 rounded-lg border border-gray-700">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-highlight" />
            Letzte Aktivität
          </h3>
          {activities.length === 0 ? (
            <p className="text-gray-400 text-sm">Keine Aktivitäten</p>
          ) : (
            <div className="space-y-3">
              {activities.map((activity, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${
                    activity.type === 'session' ? 'bg-highlight' :
                    activity.type === 'agent' ? 'bg-blue-500' : 'bg-green-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{activity.message}</p>
                    <p className="text-xs text-gray-500">
                      {activity.time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Gateway Info */}
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-2 bg-secondary p-4 rounded-lg border border-gray-700">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-gray-400" />
            Gateway
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-gray-400">Version</p>
              <p>2026.3.13</p>
            </div>
            <div>
              <p className="text-gray-400">Port</p>
              <p>18789</p>
            </div>
            <div>
              <p className="text-gray-400">Model</p>
              <p>{defaultModel}</p>
            </div>
            <div>
              <p className="text-gray-400">Uptime</p>
              <p>{stats?.uptime || '—'}</p>
            </div>
          </div>
        </div>
        
        <Link href="/tokens" className="bg-secondary p-4 rounded-lg border border-gray-700 hover:border-highlight transition-colors">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Database className="w-4 h-4 text-highlight" />
            Token Usage
          </h4>
          <p className="text-2xl font-bold text-highlight">
            {sessions.reduce((sum, s) => sum + s.totalTokens, 0).toLocaleString()}
          </p>
          <p className="text-sm text-gray-400">Total Tokens</p>
        </Link>
        
        <Link href="/cron" className="bg-secondary p-4 rounded-lg border border-gray-700 hover:border-highlight transition-colors">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-highlight" />
            Cron Jobs
          </h4>
          <p className="text-2xl font-bold text-highlight">3</p>
          <p className="text-sm text-gray-400">Aktiv</p>
        </Link>
      </div>

      <div className="bg-secondary p-6 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-highlight" />
            Runtime Backup
          </h3>
          <span className={`text-xs px-2 py-1 rounded ${
            backupStatus?.timer.active_state === 'active' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
          }`}>
            {backupStatus?.timer.active_state === 'active' ? 'Timer active' : 'Timer missing'}
          </span>
        </div>

        {!backupStatus ? (
          <p className="text-gray-400 text-sm">Backup status unavailable.</p>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-400">Latest snapshot</p>
                <p className="font-medium">{latestBackup?.id || 'No snapshot yet'}</p>
              </div>
              <div>
                <p className="text-gray-400">Next run</p>
                <p>{backupStatus.timer.next_run_at || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-gray-400">Last trigger</p>
                <p>{backupStatus.timer.last_trigger_at || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-gray-400">Remote</p>
                <p className="break-all">{latestBackup?.gdrive_remote || 'Not recorded'}</p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-400">Snapshot health</p>
                <p className={backupHealthy ? 'text-green-300 font-medium' : 'text-orange-300 font-medium'}>
                  {backupHealthy ? 'Dashboard DB + task archives present' : 'Snapshot incomplete'}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Contents</p>
                <div className="space-y-1">
                  <p>{latestBackup?.includes_dashboard_db ? '• Dashboard DB included' : '• Dashboard DB missing'}</p>
                  <p>{latestBackup?.includes_task_archive ? '• Canonical tasks included' : '• Canonical tasks missing'}</p>
                  <p>{latestBackup?.includes_runtime_archive ? '• Health/log archive included' : '• Health/log archive missing'}</p>
                </div>
              </div>
              <div>
                <p className="text-gray-400">Local path</p>
                <p className="break-all">{latestBackup?.path || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-gray-400">Recorded size</p>
                <p>{latestBackup?.size || 'Unknown'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
