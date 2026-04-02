import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'kanban.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  const database = db!;
  
  database.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      color TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      column_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      intake_brief TEXT,
      refinement_source TEXT,
      refinement_summary TEXT,
      refined_at TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      priority TEXT DEFAULT 'medium',
      labels TEXT DEFAULT '[]',
      assignee TEXT,
      due_date TEXT,
      handoff_notes TEXT,
      canonical_task_id TEXT,
      project_id TEXT,
      related_repo TEXT,
      github_issue_number INTEGER,
      github_issue_url TEXT,
      sync_status TEXT DEFAULT 'local_only',
      sync_error TEXT,
      archived_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  ensureColumn(database, 'tasks', 'canonical_task_id', 'TEXT');
  ensureColumn(database, 'tasks', 'project_id', 'TEXT');
  ensureColumn(database, 'tasks', 'related_repo', 'TEXT');
  ensureColumn(database, 'tasks', 'intake_brief', 'TEXT');
  ensureColumn(database, 'tasks', 'refinement_source', 'TEXT');
  ensureColumn(database, 'tasks', 'refinement_summary', 'TEXT');
  ensureColumn(database, 'tasks', 'refined_at', 'TEXT');
  ensureColumn(database, 'tasks', 'handoff_notes', 'TEXT');
  ensureColumn(database, 'tasks', 'github_issue_number', 'INTEGER');
  ensureColumn(database, 'tasks', 'github_issue_url', 'TEXT');
  ensureColumn(database, 'tasks', 'sync_status', "TEXT DEFAULT 'local_only'");
  ensureColumn(database, 'tasks', 'sync_error', 'TEXT');
  ensureColumn(database, 'tasks', 'archived_at', 'TEXT');
}

function ensureColumn(
  database: Database.Database,
  tableName: string,
  columnName: string,
  columnDefinition: string
) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

export interface Board {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  color: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  intake_brief?: string | null;
  refinement_source?: string | null;
  refinement_summary?: string | null;
  refined_at?: string | null;
  position: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  labels: string;
  assignee: string | null;
  due_date: string | null;
  handoff_notes?: string | null;
  canonical_task_id?: string | null;
  project_id?: string | null;
  related_repo?: string | null;
  github_issue_number?: number | null;
  github_issue_url?: string | null;
  sync_status?: string | null;
  sync_error?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubTask {
  id: string;
  task_id: string;
  title: string;
  completed: number; // 0 or 1 for SQLite
  position: number;
  created_at: string;
}
