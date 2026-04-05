# Rook Dashboard 🦅

> Monitoring Dashboard für Rook's Multi-Agent System

## Features

- **Dashboard** — Agent-Status, System-Stats, Session-Übersicht
- **Sessions** — Live Session-Daten vom Gateway
- **Agents** — Alle Agents mit Status und Sandbox-Info
- **Tokens** — Token-Nutzung und Kosten-Schätzung
- **Cron** — Cron-Job Übersicht und Logs
- **Memory** — Memory Browser für alle Agents
- **Kanban** — Multi-board task control with manual board moves

## Kanban Notes

- Board selection is sticky in the browser and should not jump to another board during background refresh.
- Tickets can be moved to another board in two ways:
  - open the ticket and change the `Board` field in the modal
  - drag a ticket onto another board tab in the Kanban header
- A manual board move always lands the ticket in the target board's `Backlog` first.
- `Send to Intake` remains an explicit action and still targets the chosen board's `Intake` workflow column.

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
