const db = require('better-sqlite3')('data/kanban.db');
const boardId = '995cdcf8-3eda-4bb8-8ce2-c85a10791d95';

// Get column IDs
const columns = {};
db.prepare('SELECT name, id FROM columns WHERE board_id = ?').all(boardId).forEach(c => columns[c.name] = c.id);

console.log('Columns:', columns);

// Create example tickets (matching actual schema: id, column_id, title, description, position, priority, labels, assignee, due_date)
const tickets = [
  {
    title: 'Test Agent einrichten',
    description: 'Unit Tests, Integration Tests, E2E Tests für alle Rook-Projekte. Soll automatisch bei Commits triggern.',
    priority: 'high',
    column: 'Ready',
    labels: ['agent', 'testing', 'priority'],
    assignee: 'test'
  },
  {
    title: 'Review Agent einrichten',
    description: 'Code Review, Quality Gates, Security Review. Soll bei Pull Requests automatisch starten.',
    priority: 'high',
    column: 'Backlog',
    labels: ['agent', 'review'],
    assignee: 'review'
  },
  {
    title: 'Ecology API: Echte Daten von Quellen fetchen',
    description: 'Research Agent implementieren der wirklich Daten von RMI, Z2Data, WEF etc. fetched statt nur Fallback.',
    priority: 'medium',
    column: 'Ready',
    labels: ['ecology', 'research'],
    assignee: 'researcher'
  }
];

const insert = db.prepare(`
  INSERT INTO tasks (id, column_id, title, description, position, priority, labels, assignee, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

tickets.forEach((t, i) => {
  const id = require('crypto').randomUUID();
  const labels = JSON.stringify(t.labels);
  insert.run(id, columns[t.column], t.title, t.description, i, t.priority, labels, t.assignee);
  console.log(`Created: ${t.title}`);
});

console.log('\nDone!');
