'use client'

import { Clock, Play, Pause } from 'lucide-react'

const cronJobs = [
  { id: 1, name: 'Workspace Sync', schedule: 'Täglich 02:00', lastRun: '2026-03-27 02:00', nextRun: '2026-03-28 02:00', status: 'active' },
  { id: 2, name: 'Research Pipeline', schedule: 'Sonntags 08:00', lastRun: '2026-03-22 08:00', nextRun: '2026-03-29 08:00', status: 'active' },
  { id: 3, name: 'Google Drive Backup', schedule: 'Sonntags 02:00', lastRun: '2026-03-22 02:00', nextRun: '2026-03-29 02:00', status: 'active' },
  { id: 4, name: 'OpenClaw Update Check', schedule: 'Täglich 06:00', lastRun: '2026-03-27 06:00', nextRun: '2026-03-28 06:00', status: 'active' },
]

export default function CronPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Cron Jobs</h2>
      
      <div className="bg-secondary rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-accent">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Schedule</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Last Run</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Next Run</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {cronJobs.map((job) => (
              <tr key={job.id} className="hover:bg-accent/30">
                <td className="px-4 py-3 font-medium">{job.name}</td>
                <td className="px-4 py-3 text-gray-400">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {job.schedule}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-sm">{job.lastRun}</td>
                <td className="px-4 py-3 text-gray-400 text-sm">{job.nextRun}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    {job.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="bg-secondary p-4 rounded-lg border border-gray-700">
        <h3 className="font-bold mb-3">Log</h3>
        <div className="font-mono text-sm text-gray-400 space-y-1 max-h-48 overflow-y-auto">
          <p>2026-03-27 02:00:00 [sync] Started workspace sync</p>
          <p>2026-03-27 02:00:45 [sync] Git push completed</p>
          <p>2026-03-27 02:00:46 [sync] Done. 3 files changed.</p>
          <p>2026-03-26 02:00:00 [backup] Started weekly backup</p>
          <p>2026-03-26 02:03:12 [backup] Uploaded to Google Drive</p>
        </div>
      </div>
    </div>
  )
}
