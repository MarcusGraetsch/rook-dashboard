# Rook Dashboard

> Dashboard für Rook's Multi-Agent System

## Features

- **Token-Monitoring** — Clawmetry-konzept
- **Cron-Manager** — Übersicht aller Cron-Jobs
- **Memory Browser** — Browse Agent Memory
- **System Health** — CPU/RAM/Disk
- **Session-Übersicht** — Aktive Sessions

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- WebSocket + HTTP Client für OpenClaw Gateway

## Setup

```bash
npm install
npm run dev
```

## API Connection

Verbindet sich zum OpenClaw Gateway auf `http://localhost:18789`

## Referenz

TenacitOS — https://github.com/TenacitOS
