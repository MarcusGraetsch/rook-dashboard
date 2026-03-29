// Create Labor Footprint epic + subtasks in Kanban DB
// Usage: node scripts/create-labor-tickets.js

const path = require('path');
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');

function main() {
  const dbPath = path.join(__dirname, '..', 'data', 'kanban.db');
  const db = new Database(dbPath);

  const board = db.prepare('SELECT id FROM boards ORDER BY created_at LIMIT 1').get();
  if (!board) {
    console.error('No board found in kanban.db');
    process.exit(1);
  }
  const boardId = board.id;

  const columns = {};
  db.prepare('SELECT id, name FROM columns WHERE board_id = ?').all(boardId).forEach((c) => {
    columns[c.name] = c.id;
  });

  const ensureColumn = (name) => {
    if (!columns[name]) {
      throw new Error(`Column "${name}" not found on board ${boardId}`);
    }
  };

  ['Backlog', 'Ready'].forEach(ensureColumn);

  const tasks = [
    {
      title: 'Labor Footprint – Phase 2 (Epic)',
      description:
        'AI Labor Footprint: Metriken, API, Methodology, Sources. Siehe Untertickets.',
      column: 'Backlog',
      priority: 'high',
      assignee: 'rook',
      labels: ['labor', 'epic', 'rook-dashboard'],
    },
    {
      title: 'Labor: Metrics-Engine – Exposure + Coverage',
      description:
        'Implementiere src/lib/labor/metrics.ts (v1) mit Hidden Labor Exposure Score und Source Coverage Score. Mit methodology_version, confidence und klaren Inputs (Systemdaten vs. externe Daten vs. Heuristik vs. normative Bewertung).',
      column: 'Ready',
      priority: 'high',
      assignee: 'engineer',
      labels: ['labor', 'metrics', 'rook-dashboard'],
    },
    {
      title: 'Labor: API – /api/labor/summary erweitern',
      description:
        'Erweitere /api/labor/summary um hidden_labor_exposure_score_v1 und source_coverage_score_v1 (Dependency Index + Exploitation Signal in Phase 3).',
      column: 'Backlog',
      priority: 'medium',
      assignee: 'engineer',
      labels: ['labor', 'api', 'rook-dashboard'],
    },
    {
      title: 'Labor: UI – /labor Badges für Exposure + Coverage',
      description:
        'Erweitere Labor-Seite um Badges für Hidden Labor Exposure und Source Coverage pro Provider (unter dem Transparency-Score).',
      column: 'Backlog',
      priority: 'medium',
      assignee: 'engineer',
      labels: ['labor', 'ui', 'rook-dashboard'],
    },
    {
      title: 'Labor: Methodology – API + Page',
      description:
        'Implementiere /api/labor/methodology + /labor/methodology mit Definitionen (Formel, Inputs, Annahmen, Limitations, Version, Quellen) für alle Labor-Metriken.',
      column: 'Backlog',
      priority: 'medium',
      assignee: 'researcher',
      labels: ['labor', 'methodology', 'rook-dashboard'],
    },
    {
      title: 'Labor: Sources Page – API + UI',
      description:
        'Implementiere /api/labor/sources (aus Registry/Fixtures) + /labor/sources mit Source Registry (HRW, Stanford FMTI, AlgorithmWatch, Fairwork etc.).',
      column: 'Backlog',
      priority: 'low',
      assignee: 'researcher',
      labels: ['labor', 'sources', 'rook-dashboard'],
    },
  ];

  const insert = db.prepare(
    "INSERT INTO tasks (id, column_id, title, description, position, priority, labels, assignee, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
  );

  let pos = 0;
  for (const t of tasks) {
    const id = randomUUID();
    const labelsJson = JSON.stringify(t.labels);

    // avoid duplicates by title
    const existing = db.prepare('SELECT id FROM tasks WHERE title = ?').get(t.title);
    if (existing) {
      console.log('Skipping existing task:', t.title);
      continue;
    }

    insert.run(id, columns[t.column], t.title, t.description, pos++, t.priority, labelsJson, t.assignee);
    console.log('Created task:', t.title);
  }

  console.log('Done.');
}

main();
