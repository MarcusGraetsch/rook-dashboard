# Rook Dashboard 🦅

> Monitoring Dashboard für Rook's Multi-Agent System

## Features

- **Dashboard** — Agent-Status, System-Stats, Session-Übersicht
- **Sessions** — Live Session-Daten vom Gateway
- **Agents** — Alle Agents mit Status und Sandbox-Info
- **Tokens** — Token-Nutzung und Kosten-Schätzung
- **Cron** — Cron-Job Übersicht und Logs
- **Memory** — Memory Browser für alle Agents

## Quick Start

```bash
# Dependencies installieren
npm install

# Development Server starten
npm run dev

# Dashboard öffnen
open http://localhost:3000
```

## Gateway Connection

Das Dashboard verbindet sich mit dem OpenClaw Gateway auf `http://localhost:18789`.

**Umgebungsvariablen:**
```bash
NEXT_PUBLIC_GATEWAY_URL=http://localhost:18789
GATEWAY_TOKEN=your-gateway-token
```

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- TypeScript
- OpenClaw Gateway API

## Repository

- Dashboard: https://github.com/MarcusGraetsch/rook-dashboard
- Workspace: https://github.com/MarcusGraetsch/rook-workspace
- Agent: https://github.com/MarcusGraetsch/rook-agent

## Deployment

### Vercel (empfohlen)

```bash
npm i -g vercel
vercel
```

### Railway

1. GitHub Repo verbinden
2. Build Command: `npm run build`
3. Start Command: `npm start`

### Lokal

```bash
npm run build
npm start
```
