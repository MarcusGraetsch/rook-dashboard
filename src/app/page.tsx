'use client'

import { Activity, Cpu, HardDrive, Clock } from 'lucide-react'

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Activity className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">Sessions</p>
              <p className="text-2xl font-bold">6</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Cpu className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">CPU</p>
              <p className="text-2xl font-bold">23%</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <HardDrive className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">Disk</p>
              <p className="text-2xl font-bold">32GB</p>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary p-4 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <Clock className="text-highlight" />
            <div>
              <p className="text-sm text-gray-400">Uptime</p>
              <p className="text-2xl font-bold">14d</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Agent Status */}
      <div className="bg-secondary p-6 rounded-lg border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Agent Status</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              🦅 Rook (Main)
            </span>
            <span className="text-sm text-gray-400">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              🧠 Coach
            </span>
            <span className="text-sm text-gray-400">Ready</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
              🛠️ Engineer
            </span>
            <span className="text-sm text-gray-400">Idle</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              📚 Researcher
            </span>
            <span className="text-sm text-gray-400">Ready</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              💪 Health
            </span>
            <span className="text-sm text-gray-400">Ready</span>
          </div>
        </div>
      </div>
      
      {/* Gateway Info */}
      <div className="bg-secondary p-6 rounded-lg border border-gray-700">
        <h3 className="text-lg font-bold mb-4">Gateway</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400">Version</p>
            <p>2026.3.13</p>
          </div>
          <div>
            <p className="text-gray-400">Port</p>
            <p>18789</p>
          </div>
          <div>
            <p className="text-gray-400">Default Model</p>
            <p>MiniMax-M2.7</p>
          </div>
          <div>
            <p className="text-gray-400">Git</p>
            <p>61d171a</p>
          </div>
        </div>
      </div>
    </div>
  )
}
