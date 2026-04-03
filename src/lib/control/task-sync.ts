import { promises as fs } from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { getCanonicalTask } from '@/lib/control/tasks';
import type { CanonicalTask, TaskPriority, TaskStatus } from '@/lib/control/tasks';
import { syncTaskToGithubIssue } from '@/lib/control/github-issues';

const OPERATIONS_DIR =
  process.env.ROOK_OPERATIONS_DIR || '/root/.openclaw/workspace/operations';
const RUNTIME_ROOT = process.env.ROOK_RUNTIME_ROOT || '/root/.openclaw/runtime';
const RUNTIME_OPERATIONS_DIR =
  process.env.ROOK_RUNTIME_OPERATIONS_DIR || path.join(RUNTIME_ROOT, 'operations');
const TASKS_DIR = path.join(OPERATIONS_DIR, 'tasks');
const ARCHIVE_TASKS_DIR = path.join(RUNTIME_OPERATIONS_DIR, 'archive', 'tasks');
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
  intake_brief: string | null;
  refinement_source: string | null;
  refinement_summary: string | null;
  refined_at: string | null;
  position: number;
  priority: TaskPriority;
  labels: string;
  assignee: string | null;
  due_date: string | null;
  handoff_notes: string | null;
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

interface KanbanChecklistItem {
  title: string;
  completed: number;
  position: number;
}

interface CanonicalSyncResult {
  canonicalTaskId: string;
  projectId: string;
  relatedRepo: string;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  syncStatus: string;
}

interface KanbanProjectionRow {
  id: string;
  canonical_task_id: string | null;
  project_id: string | null;
  board_id: string;
  column_id: string;
  position: number;
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
    case 'test':
    case 'review':
    case 'consultant':
    case 'coach':
    case 'health':
    case 'dashboard-sync':
      return assignee;
    default:
      return 'rook';
  }
}

function normalizeAssignedAgent(
  assignee: CanonicalTask['assigned_agent'],
  title: string,
  description: string | null,
  labels: string[]
): CanonicalTask['assigned_agent'] {
  const text = `${title}\n${description || ''}`.toLowerCase();
  const labelSet = new Set(labels.map((label) => label.toLowerCase()));
  const looksImplementationHeavy =
    /\b(implement|build|fix|code|ui|bug|feature|api|frontend|backend|database|route|endpoint)\b/.test(text)
    || ['bug', 'ui', 'api', 'refactor', 'automation', 'data'].some((label) => labelSet.has(label));

  if (assignee === 'consultant' && looksImplementationHeavy) {
    return 'engineer';
  }

  return assignee;
}

function inferStatus(columnName: string): TaskStatus {
  const value = normalizeName(columnName);

  if (value.includes('intake') || value.includes('refine') || value.includes('triage')) return 'intake';
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

function statusToColumnName(status: TaskStatus): string | null {
  switch (status) {
    case 'backlog':
      return 'Backlog';
    case 'intake':
      return 'Intake';
    case 'ready':
      return 'Ready';
    case 'in_progress':
      return 'In Progress';
    case 'testing':
      return 'Testing';
    case 'review':
      return 'Review';
    case 'done':
      return 'Done';
    case 'blocked':
      return 'Blocked';
    default:
      return null;
  }
}

function projectedRuntimeStatus(canonicalTask: CanonicalTask): TaskStatus | null {
  const claimedBy = String(canonicalTask.claimed_by || '').trim();
  const dispatchStatus = String(canonicalTask.dispatch?.dispatched_status || '').trim() as TaskStatus | '';
  const dispatchResult = String(canonicalTask.dispatch?.last_result || '').trim().toLowerCase();

  if (!claimedBy) {
    return null;
  }

  if (!dispatchStatus) {
    return null;
  }

  if (dispatchResult === 'launching' || dispatchResult === 'running') {
    return dispatchStatus;
  }

  return dispatchStatus;
}

function blockedStageFallbackColumn(canonicalTask: CanonicalTask): string | null {
  const executor = String(canonicalTask.dispatch?.executor || '').toLowerCase();
  if (executor === 'review') return 'Review';
  if (executor === 'test') return 'Testing';
  if (executor) return 'In Progress';

  const worker = String(canonicalTask.claimed_by || '').replace(/^dispatcher:/, '').toLowerCase();
  if (worker === 'review') return 'Review';
  if (worker === 'test') return 'Testing';
  if (worker) return 'In Progress';

  const assigned = String(canonicalTask.assigned_agent || '').toLowerCase();
  if (assigned === 'review') return 'Review';
  if (assigned === 'test') return 'Testing';
  if (assigned && assigned !== 'rook') return 'In Progress';

  return 'In Progress';
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
  return getCanonicalTask(taskId, projectId);
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

function isActiveStatus(status: TaskStatus | null | undefined): boolean {
  return status === 'in_progress' || status === 'testing' || status === 'review';
}

function nextHandoffNotes(
  task: KanbanTaskContext,
  existing: CanonicalTask | null,
  status: TaskStatus,
  statusChanged: boolean
): string {
  const kanbanNotes = (task.handoff_notes || '').trim();
  if (kanbanNotes) {
    return kanbanNotes;
  }

  if (status === 'blocked') {
    return existing?.handoff_notes || '';
  }

  // Re-queueing from Kanban should not carry stale blocked/failed worker notes into a new run.
  if (status === 'ready' || (statusChanged && !isActiveStatus(status))) {
    return '';
  }

  return existing?.handoff_notes || '';
}

function shouldRegenerateBranch(
  existing: CanonicalTask | null,
  nextAssignedAgent: CanonicalTask['assigned_agent'],
  nextTitle: string
): boolean {
  if (!existing) {
    return true;
  }

  if (Array.isArray(existing.commits) && existing.commits.length > 0) {
    return false;
  }

  if (existing.github_pull_request?.number || existing.github_pull_request?.url) {
    return false;
  }

  if (existing.claimed_by || isActiveStatus(existing.status)) {
    return false;
  }

  const expectedCurrentBranch = buildBranch(existing.task_id, existing.assigned_agent, existing.title);
  if (existing.branch && existing.branch !== expectedCurrentBranch) {
    return false;
  }

  return existing.assigned_agent !== nextAssignedAgent || existing.title !== nextTitle;
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
  const checklist = db.prepare(
    `
      SELECT title, completed, position
      FROM subtasks
      WHERE task_id = ?
      ORDER BY position
    `
  ).all(task.id) as KanbanChecklistItem[];
  const status = inferStatus(task.column_name);
  const assignedAgent = normalizeAssignedAgent(
    task.assignee
    ? coerceAgent(task.assignee)
    : (existing?.assigned_agent || (status === 'intake' ? 'coach' : 'rook')),
    task.title,
    task.description,
    labels
  );
  const nowIso = new Date().toISOString();
  const statusChanged = existing ? existing.status !== status : false;
  const leavingBlocked = status !== 'blocked';
  const leavingActiveStage = statusChanged && !isActiveStatus(status);
  const nextBranch = shouldRegenerateBranch(existing, assignedAgent, task.title)
    ? buildBranch(canonicalTaskId, assignedAgent, task.title)
    : (existing?.branch || buildBranch(canonicalTaskId, assignedAgent, task.title));

  const canonicalTask: CanonicalTask = {
    task_id: canonicalTaskId,
    project_id: project.project_id,
    title: task.title,
    description:
      task.description ||
      `Mirrored from Kanban board "${task.board_name}" column "${task.column_name}".`,
    intake: {
      brief: task.intake_brief || existing?.intake?.brief || null,
      refinement_source: task.refinement_source || existing?.intake?.refinement_source || null,
      refined_at: task.refined_at || existing?.intake?.refined_at || null,
      refinement_summary: task.refinement_summary || existing?.intake?.refinement_summary || null,
    },
    status,
    assigned_agent: assignedAgent,
    claimed_by: leavingActiveStage ? null : (existing?.claimed_by || null),
    priority: task.priority || existing?.priority || 'medium',
    dependencies: existing?.dependencies || [],
    blocked_by: leavingBlocked ? [] : (existing?.blocked_by || []),
    related_repo: project.related_repo,
    branch: nextBranch,
    commits: existing?.commits || [],
    commit_refs: existing?.commit_refs || existing?.commits || [],
    labels,
    workflow_stage: existing?.workflow_stage || 'kanban-sync',
    blocked_reason:
      status === 'blocked'
        ? existing?.blocked_reason || 'Blocked in Kanban column.'
        : null,
    handoff_notes: nextHandoffNotes(task, existing, status, statusChanged),
    last_heartbeat: leavingBlocked || leavingActiveStage ? null : (existing?.last_heartbeat || null),
    failure_reason: leavingBlocked ? null : (existing?.failure_reason || null),
    source_channel: existing?.source_channel || null,
    artifacts: existing?.artifacts || [],
    checklist: checklist.map((entry) => ({
      title: entry.title,
      completed: Boolean(entry.completed),
      position: entry.position,
    })),
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
    timestamps: {
      ...nextTimestamps(existing, status, nowIso),
      claimed_at: leavingActiveStage ? null : (existing?.timestamps.claimed_at || null),
    },
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
  const current = db.prepare(
    `
      SELECT
        t.id,
        t.column_id,
        t.position,
        c.board_id,
        c.name as column_name
      FROM tasks t
      JOIN columns c ON c.id = t.column_id
      WHERE t.canonical_task_id = ?
    `
  ).get(canonicalTask.task_id) as {
    id: string;
    column_id: string;
    position: number;
    board_id: string;
    column_name: string;
  } | undefined;

  if (!current) {
    return;
  }

  const projectedStatus = projectedRuntimeStatus(canonicalTask) || canonicalTask.status;
  const targetColumnName = statusToColumnName(projectedStatus);
  let nextColumnId = current.column_id;
  let nextColumnName = current.column_name;

  if (targetColumnName && normalizeName(targetColumnName) !== normalizeName(current.column_name)) {
    const targetColumn = db.prepare(
      `
        SELECT id, name
        FROM columns
        WHERE board_id = ?
          AND lower(name) = lower(?)
        ORDER BY position
        LIMIT 1
      `
    ).get(current.board_id, targetColumnName) as { id: string; name: string } | undefined;

    if (targetColumn) {
      nextColumnId = targetColumn.id;
      nextColumnName = targetColumn.name;
    }
  } else if (!targetColumnName && canonicalTask.status === 'blocked') {
    const fallbackColumnName = blockedStageFallbackColumn(canonicalTask);
    if (fallbackColumnName && normalizeName(fallbackColumnName) !== normalizeName(current.column_name)) {
      const fallbackColumn = db.prepare(
        `
          SELECT id, name
          FROM columns
          WHERE board_id = ?
            AND lower(name) = lower(?)
          ORDER BY position
          LIMIT 1
        `
      ).get(current.board_id, fallbackColumnName) as { id: string; name: string } | undefined;

      if (fallbackColumn) {
        nextColumnId = fallbackColumn.id;
        nextColumnName = fallbackColumn.name;
      }
    }
  }

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
        assignee = ?,
        github_issue_number = ?,
        github_issue_url = ?,
        sync_status = ?,
        sync_error = ?,
        column_id = ?,
        updated_at = datetime('now')
      WHERE canonical_task_id = ?
    `
  ).run(
    canonicalTask.task_id,
    canonicalTask.project_id,
    canonicalTask.related_repo,
    canonicalTask.assigned_agent || null,
    githubIssue?.number || null,
    githubIssue?.url || null,
    syncStatus,
    syncError,
    nextColumnId,
    canonicalTask.task_id
  );

  db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(current.id);

  const canonicalChecklist = Array.isArray(canonicalTask.checklist) ? canonicalTask.checklist : [];
  if (canonicalChecklist.length > 0) {
    const insertSubtask = db.prepare(
      'INSERT INTO subtasks (id, task_id, title, completed, position) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)'
    );

    canonicalChecklist.forEach((item, index) => {
      const title = String(item?.title || '').trim();
      if (!title) {
        return;
      }

      insertSubtask.run(
        current.id,
        title,
        item?.completed ? 1 : 0,
        Number.isInteger(item?.position) ? item.position : index,
      );
    });
  }

  // Kanban projection is derived from the board state at read time. Do not
  // rewrite canonical task files during passive reconciliation, or the live
  // dashboard poll loop will continuously dirty the repo with regenerated
  // position/column metadata.
}

export async function reconcileKanbanProjectionFromCanonical(
  db: Database.Database
): Promise<Array<{ canonical_task_id: string; from: string; to: string }>> {
  const rows = db.prepare(
    `
      SELECT
        t.id,
        t.canonical_task_id,
        t.project_id,
        c.board_id,
        t.column_id,
        t.position
      FROM tasks t
      JOIN columns c ON c.id = t.column_id
      WHERE t.archived_at IS NULL
        AND t.canonical_task_id IS NOT NULL
    `
  ).all() as KanbanProjectionRow[];

  const changes: Array<{ canonical_task_id: string; from: string; to: string }> = [];

  for (const row of rows) {
    if (!row.canonical_task_id || !row.project_id) {
      continue;
    }

    const canonicalTask = await readCanonicalTask(row.project_id, row.canonical_task_id);
    if (!canonicalTask) {
      continue;
    }

    const before = canonicalTask.kanban?.column_name || '';
    await refreshKanbanTaskFromCanonical(db, canonicalTask);
    const refreshed = await readCanonicalTask(row.project_id, row.canonical_task_id);
    const after = refreshed?.kanban?.column_name || before;

    if (before !== after) {
      changes.push({
        canonical_task_id: row.canonical_task_id,
        from: before,
        to: after,
      });
    }
  }

  return changes;
}

export async function autoSyncKanbanTaskToGithub(
  db: Database.Database,
  canonicalTaskId: string
): Promise<void> {
  const taskRow = db.prepare(
    `
      SELECT project_id
      FROM tasks
      WHERE canonical_task_id = ?
      LIMIT 1
    `
  ).get(canonicalTaskId) as { project_id: string | null } | undefined;
  const result = await syncTaskToGithubIssue(canonicalTaskId, taskRow?.project_id || null);

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
