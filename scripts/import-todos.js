const db = require('better-sqlite3')('data/kanban.db');
const boardId = '995cdcf8-3eda-4bb8-8ce2-c85a10791d95';

const columns = {};
db.prepare('SELECT name, id FROM columns WHERE board_id = ?').all(boardId).forEach(c => columns[c.name] = c.id);

const tickets = [
  // ===== HOCH PRIO — Infrastructure =====
  {
    title: 'OpenAI API Key für Model Fallback',
    description: 'Kimi K2.5 ist Primary, OpenAI GPT-4 als Fallback wenn Kimi down/limitiert. Marcus muss API Key bereitstellen.',
    priority: 'high',
    column: 'Ready',
    labels: ['infrastructure', 'blocking'],
    assignee: 'rook'
  },
  {
    title: 'Tool-Policies pro Agent konfigurieren',
    description: 'Security: Jeder Agent braucht eigene Tool-Policies (was darf er ausfuehren). Engineer: read/process only.',
    priority: 'high',
    column: 'Ready',
    labels: ['security', 'infrastructure'],
    assignee: 'engineer'
  },
  
  // ===== HOCH PRIO — Research =====
  {
    title: 'HRW Gig Trap Report archivieren',
    description: 'HRW "The Gig Trap" Report - 155 pages, May 2025. Download PDF, extract key findings, tag fuer Buch-Projekt.',
    priority: 'high',
    column: 'Ready',
    labels: ['research', 'gig-economy', 'primary-source'],
    assignee: 'researcher'
  },
  {
    title: 'Social Media Transition Research',
    description: 'Platform Exodus Analyse: Fediverse migration, youth bans, collapse risks, di.day research.',
    priority: 'medium',
    column: 'Backlog',
    labels: ['research', 'social-media', 'platform-analysis'],
    assignee: 'researcher'
  },
  {
    title: 'Academic Alerting erweitern',
    description: 'Weitere Autoren: Cybernetics pioneers, German critical theory, classical political economy.',
    priority: 'medium',
    column: 'Backlog',
    labels: ['research', 'academic'],
    assignee: 'researcher'
  },
  
  // ===== MITTEL PRIO — Dashboard =====
  {
    title: 'gog CLI für Gmail/Calendar installieren',
    description: 'Google Services Integration: Gmail, Calendar, Drive, Contacts.',
    priority: 'medium',
    column: 'Backlog',
    labels: ['infrastructure', 'google', 'integration'],
    assignee: 'engineer'
  },
  {
    title: 'Contabo VM Lifecycle Automation',
    description: 'VM nur 08:00-20:00 CET laufen lassen via API. Cost reduction.',
    priority: 'low',
    column: 'Backlog',
    labels: ['infrastructure', 'vm', 'automation'],
    assignee: 'engineer'
  },
  
  // ===== MITTEL PRIO — Content =====
  {
    title: 'Working Notes: About Page fortschreiben',
    description: 'About page continuation. Berlin activism period, explicit political disclosure.',
    priority: 'medium',
    column: 'Backlog',
    labels: ['content', 'website'],
    assignee: 'researcher'
  },
  {
    title: 'Book Kapitel Outline: Platform Capitalism Theory',
    description: 'Erste Kapitelstruktur für das Buch erstellen basierend auf Research.',
    priority: 'medium',
    column: 'Backlog',
    labels: ['content', 'book', 'planning'],
    assignee: 'researcher'
  },
  
  // ===== GERING PRIO =====
  {
    title: 'EU DMA Enforcement Tracking',
    description: 'Fines tracken: Google EUR2.95B, Apple EUR500M, Meta EUR200M, X EUR120M.',
    priority: 'low',
    column: 'Backlog',
    labels: ['research', 'eu', 'regulation'],
    assignee: 'researcher'
  },
  {
    title: 'Deep Scan LabourNet.de',
    description: 'Lieferando, Amazon.de, Uber Germany Coverage.',
    priority: 'low',
    column: 'Backlog',
    labels: ['research', 'gig-economy', 'germany'],
    assignee: 'researcher'
  },
];

const insert = db.prepare(`
  INSERT INTO tasks (id, column_id, title, description, position, priority, labels, assignee, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

tickets.forEach((t, i) => {
  const id = require('crypto').randomUUID();
  const labels = JSON.stringify(t.labels);
  insert.run(id, columns[t.column], t.title, t.description, i, t.priority, labels, t.assignee);
  console.log('Created: ' + t.title);
});

console.log('\n' + tickets.length + ' tickets created from scattered TODOs');
