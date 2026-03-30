import { promises as fs } from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import type { CanonicalTask, TaskPriority, TaskStatus } from '@/lib/control/tasks';
import { syncTaskToGithubIssue } from '@/lib/control/github-issues';

const OPERATIONS_DIR =
  process.env.ROOK_OPERATIONS_DIR || '/root/.openclaw/workspace/operations';
const TASKS_DIR = path.join(OPERATIONS_DIR, 'tasks');
const ARCHIVE_TASKS_DIR = path.join(OPERATIONS_DIR, 'archive', 'tasks');
const PROJECTS_FILE = path.join(OPERATIONS_DIR, 'projects', 'projects.json');

const PREFIX_BY_PROJECT: Record<string, string> = {
  'rook-workspace': 'ops',
  'rook-agent': 'agent',
  'rook-dashboard': 'dashboard',
  'metrics-collector': 'metrics',
  'digital-research': 'research',
  'critical-theory-digital': 'writing',
  'working-notes': 'notes',
};

interface ProjectRegistryEntry {
  project_id: string;
  name: string;
  related_repo: string;
  type: string;
}

interface KanbanTaskContext {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  position: number;
  priority: TaskPriority;
  labels: string;
  assignee: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  canonical_task_id: string | null;
  project_id: string | null;
  related_repo: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  sync_status: string | null;
  sync_error: string | null;
  board_id: string;
  board_name: string;
  column_name: string;
}

interface CanonicalSyncResult {
  canonicalTaskId: string;
  projectId: string;
  relatedRepo: string;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  syncStatus: string;
}

function safeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'task';
}

function normalizeName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseLabels(raw: string): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function coerceAgent(assignee: string | null): CanonicalTask['assigned_agent'] {
  switch (assignee) {
    case 'rook':
    case 'engineer':
    case 'researcher':
    case 'consultant':
    case 'coach':
    case 'health':
    case 'dashboard-sync':
      return assignee;
    default:
      return 'rook';
  }
}

function inferStatus(columnName: string): TaskStatus {
  const value = normalizeName(columnName);

  if (value.includes('blocked')) return 'blocked';
  if (value.includes('review')) return 'review';
  if (value.includes('test')) return 'testing';
  if (
    value.includes('progress') ||
    value.includes('doing') ||
    value.includes('active') ||
    value.includes('work')
  ) {
    return 'in_progress';
  }
  if (value.includes('done') || value.includes('complete')) return 'done';
  if (value.includes('backlog') || value.includes('idea')) return 'backlog';
  if (value.includes('todo') || value.includes('to do') || value.includes('ready') || value.includes('next')) {
    return 'ready';
  }

  return 'backlog';
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function loadProjects(): Promise<ProjectRegistryEntry[]> {
  try {
    const raw = await fs.readFile(PROJECTS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as ProjectRegistryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function inferProject(boardName: string, projects: ProjectRegistryEntry[]): ProjectRegistryEntry {
  const normalizedBoard = normalizeName(boardName);

  const exact = projects.find((project) => {
    const repoTail = project.related_repo.split('/').at(-1) || '';
    return [project.project_id, project.name, repoTail].some(
      (candidate) => normalizeName(candidate) === normalizedBoard
    );
  });
  if (exact) return exact;

  const contains = projects.find((project) => {
    const repoTail = project.related_repo.split('/').at(-1) || '';
    return [project.project_id, project.name, repoTail].some((candidate) => {
      const normalizedCandidate = normalizeName(candidate);
      return normalizedBoard.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedBoard);
    });
  });
  if (contains) return contains;

  return (
    projects.find((project) => project.project_id === 'rook-workspace') || {
      project_id: 'rook-workspace',
      name: 'Rook Workspace',
      related_repo: 'MarcusGraetsch/rook-workspace',
      type: 'operations',
    }
  );
}

async function readCanonicalTask(projectId: string, taskId: string): Promise<CanonicalTask | null> {
  try {
    const raw = await fs.readFile(path.join(TASKS_DIR, projectId, `${taskId}.json`), 'utf8');
    return JSON.parse(raw) as CanonicalTask;
  } catch {
    return null;
  }
}

async function nextTaskId(projectId: string): Promise<string> {
  const prefix = PREFIX_BY_PROJECT[projectId] || safeSlug(projectId);
  const projectDir = path.join(TASKS_DIR, projectId);
  await ensureDir(projectDir);

  let max = 0;
  try {
    const entries = await fs.readdir(projectDir);
    for (const entry of entries) {
      const match = entry.match(new RegExp(`^${prefix}-(\\d{4,})\\.json$`));
      if (!match) continue;
      max = Math.max(max, Number(match[1]));
    }
  } catch {
    // Ignore and start from zero.
  }

  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

function buildBranch(taskId: string, assignedAgent: CanonicalTask['assigned_agent'], title: string): string {
  return `agent/${assignedAgent}/${taskId}-${safeSlug(title)}`;
}

function nextTimestamps(
  existing: CanonicalTask | null,
  status: TaskStatus,
  nowIso: string
): CanonicalTask['timestamps'] {
  const created_at = existing?.timestamps.created_at || nowIso;
  const started_at =
    existing?.timestamps.started_at ||
    (status === 'in_progress' ? nowIso : null);

  let completed_at = existing?.timestamps.completed_at || null;
  if (status === 'done' && !completed_at) {
    completed_at = nowIso;
  }
  if (status !== 'done') {
    completed_at = null;
  }

  return {
    created_at,
    updated_at: nowIso,
    started_at,
    completed_at,
  };
}

async function writeCanonicalTask(task: CanonicalTask) {
  const projectDir = path.join(TASKS_DIR, task.project_id);
  await ensureDir(projectDir);
  const filePath = path.join(projectDir, `${task.task_id}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(task, null, 2)}\n`, 'utf8');
}

async function readArchivedCanonicalTask(projectId: string, taskId: string): Promise<CanonicalTask | null> {
  try {
    const raw = await fs.readFile(path.join(ARCHIVE_TASKS_DIR, projectId, `${taskId}.json`), 'utf8');
    return JSON.parse(raw) as CanonicalTask;
  } catch {
    return null;
  }
}

export async function syncKanbanTaskToCanonical(
  db: Database.Database,
  taskId: string
): Promise<CanonicalSyncResult> {
  const task = db
    .prepare(
      `
        SELECT
          t.*,
          c.board_id,
          c.name as column_name,
          b.name as board_name
        FROM tasks t
        JOIN columns c ON c.id = t.column_id
        JOIN boards b ON b.id = c.board_id
        WHERE t.id = ?
      `
    )
    .get(taskId) as KanbanTaskContext | undefined;

  if (!task) {
    throw new Error(`Kanban task not found: ${taskId}`);
  }

  const projects = await loadProjects();
  const project = task.project_id
    ? projects.find((entry) => entry.project_id === task.project_id) || inferProject(task.board_name, projects)
    : inferProject(task.board_name, projects);
  const canonicalTaskId = task.canonical_task_id || (await nextTaskId(project.project_id));
  const existing = await readCanonicalTask(project.project_id, canonicalTaskId);
  const labels = parseLabels(task.labels);
  const status = inferStatus(task.column_name);
  const assignedAgent = coerceAgent(task.assignee);
  const nowIso = new Date().toISOString();

  const canonicalTask: CanonicalTask = {
    task_id: canonicalTaskId,
    project_id: project.project_id,
    title: task.title,
    description:
      task.description ||
      `Mirrored from Kanban board "${task.board_name}" column "${task.column_name}".`,
    status,
    assigned_agent: assignedAgent,
    priority: task.priority || existing?.priority || 'medium',
    dependencies: existing?.dependencies || [],
    related_repo: project.related_repo,
    branch: existing?.branch || buildBranch(canonicalTaskId, assignedAgent, task.title),
    commits: existing?.commits || [],
    labels,
    workflow_stage: existing?.workflow_stage || 'kanban-sync',
    blocked_reason:
      status === 'blocked'
        ? existing?.blocked_reason || 'Blocked in Kanban column.'
        : existing?.blocked_reason || null,
    handoff_notes: existing?.handoff_notes || '',
    kanban: {
      board_id: task.board_id,
      board_name: task.board_name,
      column_id: task.column_id,
      column_name: task.column_name,
      task_db_id: task.id,
      position: task.position,
      sync_origin: 'dashboard-kanban',
    },
    github_issue: existing?.github_issue || {
      repo: project.related_repo,
      number: task.github_issue_number || null,
      url: task.github_issue_url || null,
      state: null,
      sync_status: 'not_requested',
      last_synced_at: null,
      last_error: null,
    },
    timestamps: nextTimestamps(existing, status, nowIso),
  };

  await writeCanonicalTask(canonicalTask);

  const githubIssue = canonicalTask.github_issue;
  const syncStatus = githubIssue?.sync_status || 'synced';

  db.prepare(
    `
      UPDATE tasks
      SET
        canonical_task_id = ?,
        project_id = ?,
        related_repo = ?,
        github_issue_number = ?,
        github_issue_url = ?,
        sync_status = ?,
        sync_error = NULL,
        updated_at = datetime('now')
      WHERE id = ?
    `
  ).run(
    canonicalTask.task_id,
    canonicalTask.project_id,
    canonicalTask.related_repo,
    githubIssue?.number || null,
    githubIssue?.url || null,
    syncStatus,
    task.id
  );

  return {
    canonicalTaskId: canonicalTask.task_id,
    projectId: canonicalTask.project_id,
    relatedRepo: canonicalTask.related_repo,
    githubIssueNumber: githubIssue?.number || null,
    githubIssueUrl: githubIssue?.url || null,
    syncStatus,
  };
}

export async function archiveKanbanTaskSync(
  db: Database.Database,
  taskId: string
): Promise<{ archived: boolean; canonicalTaskId: string | null }> {
  const task = db
    .prepare('SELECT canonical_task_id, project_id FROM tasks WHERE id = ?')
    .get(taskId) as { canonical_task_id: string | null; project_id: string | null } | undefined;

  if (!task?.canonical_task_id || !task.project_id) {
    return { archived: false, canonicalTaskId: null };
  }

  const sourcePath = path.join(TASKS_DIR, task.project_id, `${task.canonical_task_id}.json`);
  const targetDir = path.join(ARCHIVE_TASKS_DIR, task.project_id);
  const targetPath = path.join(targetDir, `${task.canonical_task_id}.json`);

  try {
    await ensureDir(targetDir);
    await fs.rename(sourcePath, targetPath);
    return { archived: true, canonicalTaskId: task.canonical_task_id };
  } catch {
    return { archived: false, canonicalTaskId: task.canonical_task_id };
  }
}

export async function markKanbanTaskArchived(
  db: Database.Database,
  taskId: string
): Promise<{ archived: boolean; canonicalTaskId: string | null }> {
  const archived = await archiveKanbanTaskSync(db, taskId);
  db.prepare(
    `
      UPDATE tasks
      SET archived_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `
  ).run(taskId);

  return archived;
}

export async function restoreKanbanTaskToBacklog(
  db: Database.Database,
  taskId: string
): Promise<{ restored: boolean; canonicalTaskId: string | null }> {
  const task = db.prepare(`
    SELECT
      t.id,
      t.canonical_task_id,
      t.project_id,
      t.column_id,
      c.board_id
    FROM tasks t
    JOIN columns c ON c.id = t.column_id
    WHERE t.id = ?
  `).get(taskId) as {
    id: string;
    canonical_task_id: string | null;
    project_id: string | null;
    column_id: string;
    board_id: string;
  } | undefined;

  if (!task) {
    throw new Error(`Kanban task not found: ${taskId}`);
  }

  const backlogColumn = db.prepare(`
    SELECT id
    FROM columns
    WHERE board_id = ?
      AND lower(name) = 'backlog'
    ORDER BY position
    LIMIT 1
  `).get(task.board_id) as { id: string } | undefined;

  if (!backlogColumn) {
    throw new Error('Backlog column not found for board.');
  }

  if (task.canonical_task_id && task.project_id) {
    const archivedCanonical = await readArchivedCanonicalTask(task.project_id, task.canonical_task_id);
    if (archivedCanonical) {
      const targetDir = path.join(TASKS_DIR, task.project_id);
      await ensureDir(targetDir);
      await fs.rename(
        path.join(ARCHIVE_TASKS_DIR, task.project_id, `${task.canonical_task_id}.json`),
        path.join(TASKS_DIR, task.project_id, `${task.canonical_task_id}.json`)
      );

      const restoredCanonical: CanonicalTask = {
        ...archivedCanonical,
        status: 'backlog',
        blocked_reason: null,
        kanban: archivedCanonical.kanban
          ? {
              ...archivedCanonical.kanban,
              column_id: backlogColumn.id,
              column_name: 'Backlog',
            }
          : undefined,
        timestamps: {
          ...archivedCanonical.timestamps,
          updated_at: new Date().toISOString(),
          completed_at: null,
        },
      };

      await writeCanonicalTask(restoredCanonical);
    }
  }

  const maxPos = db.prepare(
    'SELECT MAX(position) as max FROM tasks WHERE column_id = ? AND archived_at IS NULL'
  ).get(backlogColumn.id) as { max: number | null };

  db.prepare(`
    UPDATE tasks
    SET
      archived_at = NULL,
      column_id = ?,
      position = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(backlogColumn.id, (maxPos?.max ?? -1) + 1, taskId);

  return {
    restored: true,
    canonicalTaskId: task.canonical_task_id,
  };
}

export async function refreshKanbanTaskFromCanonical(
  db: Database.Database,
  canonicalTask: CanonicalTask
): Promise<void> {
  const githubIssue = canonicalTask.github_issue;
  const syncStatus = githubIssue?.sync_status || 'not_requested';
  const syncError = githubIssue?.last_error || null;

  db.prepare(
    `
      UPDATE tasks
      SET
        canonical_task_id = ?,
        project_id = ?,
        related_repo = ?,
        github_issue_number = ?,
        github_issue_url = ?,
        sync_status = ?,
        sync_error = ?,
        updated_at = datetime('now')
      WHERE canonical_task_id = ?
    `
  ).run(
    canonicalTask.task_id,
    canonicalTask.project_id,
    canonicalTask.related_repo,
    githubIssue?.number || null,
    githubIssue?.url || null,
    syncStatus,
    syncError,
    canonicalTask.task_id
  );
}

export async function autoSyncKanbanTaskToGithub(
  db: Database.Database,
  canonicalTaskId: string
): Promise<void> {
  const result = await syncTaskToGithubIssue(canonicalTaskId);

  db.prepare(
    `
      UPDATE tasks
      SET
        github_issue_number = ?,
        github_issue_url = ?,
        sync_status = ?,
        sync_error = ?,
        updated_at = datetime('now')
      WHERE canonical_task_id = ?
    `
  ).run(
    result.number,
    result.url,
    result.sync_status,
    result.sync_status === 'error' ? result.message : null,
    canonicalTaskId
  );
}
