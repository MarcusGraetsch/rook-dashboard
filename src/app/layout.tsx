import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Rook Dashboard',
  description: 'Dashboard für Rook Multi-Agent System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body className="antialiased">
        <div className="min-h-screen flex">
          {/* Sidebar */}
          <aside className="w-64 bg-secondary p-4 border-r border-gray-700">
            <h1 className="text-xl font-bold text-highlight mb-8">🦅 Rook</h1>
            <nav className="space-y-2">
              <a href="/" className="block px-4 py-2 rounded hover:bg-accent">Dashboard</a>
              <a href="/sessions" className="block px-4 py-2 rounded hover:bg-accent">Sessions</a>
              <a href="/agents" className="block px-4 py-2 rounded hover:bg-accent">Agents</a>
              <a href="/tokens" className="block px-4 py-2 rounded hover:bg-accent">Tokens</a>
              <a href="/ecology" className="block px-4 py-2 rounded hover:bg-accent">🌱 Ecology</a>
              <a href="/kanban" className="block px-4 py-2 rounded hover:bg-accent font-medium">📋 Kanban</a>
              <a href="/cron" className="block px-4 py-2 rounded hover:bg-accent">Cron</a>
              <a href="/memory" className="block px-4 py-2 rounded hover:bg-accent">Memory</a>
            </nav>
          </aside>
          
          {/* Main Content */}
          <main className="flex-1 p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
