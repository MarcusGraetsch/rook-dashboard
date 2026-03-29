// Create additional Labor / Ecology UI & Methodology tickets in Kanban

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

  const ensure = (name) => {
    if (!columns[name]) throw new Error(`Column ${name} not found`);
  };
  ['Backlog'].forEach(ensure);

  const tasks = [
    {
      title: 'Labor: Provider-Karten klickbar + Explainability Drawer',
      description:
        'Labor-Seite (/labor): Provider-Karten sollen klickbar sein und einen Drawer/Modal öffnen, der alle Metriken (Transparency, Exposure, Coverage, später Dependency/Exploitation) mit Methodology, Inputs, Annahmen, Limitations, Quellen und Version zeigt.',
      column: 'Backlog',
      priority: 'high',
      assignee: 'engineer',
      labels: ['labor', 'ui', 'explainability', 'rook-dashboard'],
    },
    {
      title: 'Labor: Methodology & Sources Pages',
      description:
        'Implementiere /api/labor/methodology + /labor/methodology und /api/labor/sources + /labor/sources. Methodology-Page erklärt alle Labor-Metriken (Formel, Inputs, Annahmen, Limitations, Version, Quellen). Sources-Page zeigt die Source Registry (HRW, Stanford FMTI, AlgorithmWatch, Fairwork etc.).',
      column: 'Backlog',
      priority: 'medium',
      assignee: 'researcher',
      labels: ['labor', 'methodology', 'sources', 'rook-dashboard'],
    },
    {
      title: 'Labor: Social Metrics von Ecology nach Labor verschieben',
      description:
        'Die Social Metrics (Labor-Praktiken, Datenethik, Kolonialismus-Index) sollen aus /ecology in das Labor-/Conflict-Footprint-Modul verschoben werden. Ecology fokussiert dann auf Energie/CO2/Wasser, Labor auf Arbeit/Exploitation/Supply Chain.',
      column: 'Backlog',
      priority: 'medium',
      assignee: 'engineer',
      labels: ['labor', 'ecology', 'refactor', 'rook-dashboard'],
    },
    {
      title: 'Ecology: Methodology & Hover-Explainability',
      description:
        'Für /ecology Kacheln (Energie, CO2, Wasser, Hardware) eine Methodology-Struktur einführen und per Hover/Info-Icon kurz erklären, wie die Werte geschätzt werden (Formel, Inputs, Quellen, Confidence). Optionale Methodology-Seite analog zu Labor.',
      column: 'Backlog',
      priority: 'medium',
      assignee: 'researcher',
      labels: ['ecology', 'methodology', 'ui', 'rook-dashboard'],
    },
  ];

  const insert = db.prepare(
    "INSERT INTO tasks (id, column_id, title, description, position, priority, labels, assignee, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
  );

  let pos = 0;
  for (const t of tasks) {
    const existing = db.prepare('SELECT id FROM tasks WHERE title = ?').get(t.title);
    if (existing) {
      console.log('Skipping existing task:', t.title);
      continue;
    }
    const id = randomUUID();
    const labelsJson = JSON.stringify(t.labels);
    insert.run(id, columns[t.column], t.title, t.description, pos++, t.priority, labelsJson, t.assignee);
    console.log('Created task:', t.title);
  }

  console.log('Done.');
}

main();
