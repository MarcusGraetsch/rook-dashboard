import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/layout/AppShell'

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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
