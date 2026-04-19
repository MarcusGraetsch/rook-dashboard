'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'

const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/github', label: 'GitHub' },
  { href: '/archive', label: 'Archive' },
  { href: '/sessions', label: 'Sessions' },
  { href: '/agents', label: 'Agents' },
  { href: '/tokens', label: 'Tokens' },
  { href: '/ecology', label: '🌱 Ecology' },
  { href: '/labor', label: '🧵 Labor Footprint' },
  { href: '/kanban', label: '📋 Kanban' },
  { href: '/cron', label: 'Cron' },
  { href: '/memory', label: 'Memory' },
]

export default function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-64 bg-secondary p-4 border-r border-gray-700
          transform transition-transform duration-200 ease-in-out
          lg:transform-none lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold text-highlight">🦅 Rook</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 hover:bg-accent rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="space-y-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="block px-4 py-2 rounded hover:bg-accent text-sm"
              onClick={() => setSidebarOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center gap-3 p-4 border-b border-gray-700 bg-secondary">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 hover:bg-accent rounded"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-lg font-bold text-highlight">🦅 Rook</span>
      </div>
    </>
  )
}
