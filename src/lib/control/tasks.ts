import { promises as fs } from 'fs';
import path from 'path';

const OPERATIONS_DIR =
  process.env.ROOK_OPERATIONS_DIR || '/root/.openclaw/workspace/operations';
const RUNTIME_ROOT = process.env.ROOK_RUNTIME_ROOT || '/root/.openclaw/runtime';
const RUNTIME_OPERATIONS_DIR =
  process.env.ROOK_RUNTIME_OPERATIONS_DIR || path.join(RUNTIME_ROOT, 'operations');
const TASKS_DIR = path.join(OPERATIONS_DIR, 'tasks');
const ARCHIVE_TASKS_DIR = path.join(RUNTIME_OPERATIONS_DIR, 'archive', 'tasks');
const TASK_STATE_DIR = path.join(RUNTIME_OPERATIONS_DIR, 'task-state');

export type TaskStatus =
  | 'backlog'
  | 'intake'
  | 'ready'
  | 'in_progress'
  | 'review'
  | 'testing'
  | 'blocked'
  | 'done';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CanonicalTask {
  task_id: string;
  project_id: string;
  title: string;
  description: string;
  intake?: {
    brief: string | null;
    refinement_source: string | null;
    refined_at: string | null;
    refinement_summary?: string | null;
  };
  status: TaskStatus;
  assigned_agent: string;
  claimed_by?: string | null;
  blocked_by?: string[];
  priority: TaskPriority;
  dependencies: string[];
  related_repo: string;
  branch: string;
  commits: string[];
  commit_refs?: string[];
  labels?: string[];
  workflow_stage?: string;
  blocked_reason?: string | null;
  handoff_notes?: string;
  last_heartbeat?: string | null;
  failure_reason?: string | null;
  source_channel?: string | null;
  artifacts?: string[];
  checklist?: Array<{
    title: string;
    completed: boolean;
    position: number;
  }>;
  plan?: {
    approach: string;
    scope: string[];
    out_of_scope: string[];
    steps: Array<{ id: string; title: string; owner: string; completed: boolean }>;
    acceptance_criteria: Array<{ id: string; description: string; met: boolean | null }>;
    risks: string[];
    context: string;
    planned_by: string;
    planned_at: string;
  };
  test_evidence?: {
    status?: 'passed' | 'failed' | null;
    commands?: string[];
    summary?: string | null;
  };
  review_evidence?: {
    verdict?: 'approved' | 'changes_requested' | null;
    summary?: string | null;
  };
  dispatch?: {
    mode?: string | null;
    executor?: string | null;
    attempts?: number;
    launched_at?: string | null;
    last_checked_at?: string | null;
    model?: string | null;
    thinking?: string | null;
    session_key?: string | null;
    session_id?: string | null;
    dispatched_status?: string | null;
    dispatched_owner?: string | null;
    last_result?: string | null;
    last_error?: string | null;
  };
  kanban?: {
    board_id: string;
    board_name: string;
    column_id: string;
    column_name: string;
    task_db_id: string;
    position: number;
    sync_origin: 'dashboard-kanban';
  };
  github_issue?: {
    repo: string;
    number: number | null;
    url: string | null;
    state: 'open' | 'closed' | null;
    sync_status: 'not_requested' | 'pending' | 'synced' | 'error';
    last_synced_at: string | null;
    last_error: string | null;
    assignees?: string[] | null;
  };
  github_pull_request?: {
    repo: string;
    number: number | null;
    url: string | null;
    state: 'open' | 'closed' | 'merged' | null;
    title: string | null;
    last_synced_at: string | null;
    last_error: string | null;
  };
  timestamps: {
    created_at: string;
    updated_at: string;
    started_at: string | null;
    completed_at: string | null;
    claimed_at?: string | null;
  };
}

export interface TaskGitContext {
  branch: string;
  related_repo: string;
  branch_exists: boolean;
  activity_status: 'planned' | 'branch_pushed' | 'commits_pushed' | 'pr_open' | 'merged' | 'error';
  issue: CanonicalTask['github_issue'] | null;
  pull_request: CanonicalTask['github_pull_request'] | null;
  commits: Array<{
    sha: string;
    short_sha: string;
    message: string;
    url: string | null;
    committed_at: string | null;
  }>;
}

async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

async function readTaskFile(filePath: string): Promise<CanonicalTask | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as CanonicalTask;
    if (!parsed.task_id || !parsed.project_id || !parsed.status) {
      return null;
    }
    return parsed;
  } catch (error) {
    // Surface parse errors with context instead of silently returning null
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[tasks] Failed to parse task file ${filePath}: ${errorMessage}`);
    throw new Error(`Failed to parse task file ${filePath}: ${errorMessage}`);
  }
}

async function readTaskRuntimeState(projectId: string, taskId: string): Promise<Partial<CanonicalTask> | null> {
  try {
    const raw = await fs.readFile(path.join(TASK_STATE_DIR, projectId, `${taskId}.json`), 'utf8');
    return JSON.parse(raw) as Partial<CanonicalTask>;
  } catch {
    return null;
  }
}

export async function clearTaskRuntimeState(projectId: string, taskId: string): Promise<void> {
  try {
    await fs.unlink(path.join(TASK_STATE_DIR, projectId, `${taskId}.json`));
  } catch {
    // File may not exist — that's fine.
  }
}

function mergeSyncRecord<T extends Record<string, unknown> & { last_synced_at?: string | null }>(
  canonicalValue: T | undefined,
  runtimeValue: T | undefined
): T | undefined {
  if (!canonicalValue) {
    return runtimeValue;
  }
  if (!runtimeValue) {
    return canonicalValue;
  }

  const canonicalSyncedAt = Date.parse(canonicalValue.last_synced_at || '');
  const runtimeSyncedAt = Date.parse(runtimeValue.last_synced_at || '');
  const runtimeIsNewer = Number.isFinite(runtimeSyncedAt)
    && (!Number.isFinite(canonicalSyncedAt) || runtimeSyncedAt >= canonicalSyncedAt);
  const merged: Record<string, unknown> = {
    ...canonicalValue,
  };

  for (const [key, value] of Object.entries(runtimeValue)) {
    const hasRuntimeValue = value !== null && value !== undefined && value !== '';
    const hasCanonicalValue = merged[key] !== null && merged[key] !== undefined && merged[key] !== '';

    if (!hasRuntimeValue) {
      if (!hasCanonicalValue) {
        merged[key] = value;
      }
      continue;
    }

    if (!hasCanonicalValue || runtimeIsNewer) {
      merged[key] = value;
    }
  }

  return merged as T;
}

function applyRuntimeTaskState(
  baseTask: CanonicalTask,
  runtimeState: Partial<CanonicalTask> | null
): CanonicalTask {
  if (!runtimeState) {
    return baseTask;
  }

  const merged: CanonicalTask = {
    ...baseTask,
    ...runtimeState,
  };

  if (runtimeState.dispatch) merged.dispatch = runtimeState.dispatch;
  if (runtimeState.timestamps) {
    merged.timestamps = {
      ...baseTask.timestamps,
      ...runtimeState.timestamps,
    };
  }
  merged.github_issue = mergeSyncRecord(baseTask.github_issue, runtimeState.github_issue);
  merged.github_pull_request = mergeSyncRecord(baseTask.github_pull_request, runtimeState.github_pull_request);
  return merged;
}

async function getTaskFileCandidates(taskId: string, projectId?: string | null): Promise<string[]> {
  if (projectId) {
    const scopedCandidates = [
      path.join(TASKS_DIR, projectId, `${taskId}.json`),
      path.join(ARCHIVE_TASKS_DIR, projectId, `${taskId}.json`),
    ];
    const matches: string[] = [];

    for (const candidate of scopedCandidates) {
      try {
        await fs.access(candidate);
        matches.push(candidate);
      } catch {
        // Ignore missing scoped candidates.
      }
    }

    return matches;
  }

  const roots = [TASKS_DIR, ARCHIVE_TASKS_DIR];
  const matches: string[] = [];

  for (const root of roots) {
    const projects = await safeReadDir(root);
    for (const projectId of projects) {
      const candidate = path.join(root, projectId, `${taskId}.json`);
      try {
        await fs.access(candidate);
        matches.push(candidate);
      } catch {
        // Ignore missing paths.
      }
    }
  }

  return matches;
}

function priorityWeight(priority: TaskPriority): number {
  switch (priority) {
    case 'urgent':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
      return 3;
  }
}

let _taskCache: { tasks: CanonicalTask[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5000;

export function invalidateTaskCache(): void {
  _taskCache = null;
}

async function readAllCanonicalTasksFromDisk(): Promise<CanonicalTask[]> {
  const projects = await safeReadDir(TASKS_DIR);
  const tasks: CanonicalTask[] = [];

  for (const projectId of projects) {
    const projectDir = path.join(TASKS_DIR, projectId);
    let stat;
    try {
      stat = await fs.stat(projectDir);
    } catch {
      continue;
    }

    if (!stat.isDirectory()) {
      continue;
    }

    const files = await safeReadDir(projectDir);
    for (const fileName of files) {
      if (!fileName.endsWith('.json')) {
        continue;
      }

      const task = await readTaskFile(path.join(projectDir, fileName));
      if (task) {
        const runtimeState = await readTaskRuntimeState(task.project_id, task.task_id);
        tasks.push(applyRuntimeTaskState(task, runtimeState));
      }
    }
  }

  return tasks.sort((left, right) => {
    const priorityDelta = priorityWeight(left.priority) - priorityWeight(right.priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return right.timestamps.updated_at.localeCompare(left.timestamps.updated_at);
  });
}

export async function getCanonicalTasks(): Promise<CanonicalTask[]> {
  if (_taskCache && Date.now() < _taskCache.expiresAt) {
    return _taskCache.tasks;
  }
  const tasks = await readAllCanonicalTasksFromDisk();
  _taskCache = { tasks, expiresAt: Date.now() + CACHE_TTL_MS };
  return tasks;
}

export async function getCanonicalTask(taskId: string, projectId?: string | null): Promise<CanonicalTask | null> {
  const candidates = await getTaskFileCandidates(taskId, projectId);
  if (!projectId && candidates.length > 1) {
    return null;
  }
  for (const candidate of candidates) {
    const task = await readTaskFile(candidate);
    if (task) {
      const runtimeState = await readTaskRuntimeState(task.project_id, task.task_id);
      return applyRuntimeTaskState(task, runtimeState);
    }
  }
  return null;
}

export async function writeCanonicalTask(task: CanonicalTask): Promise<void> {
  // Validate JSON serialization before writing to catch circular refs or malformed data
  let serialized: string;
  try {
    serialized = JSON.stringify(task, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[tasks] JSON serialization failed for task ${task.task_id}: ${errorMessage}`);
    throw new Error(`Failed to serialize task ${task.task_id} to JSON: ${errorMessage}`);
  }

  // Enforce terminal status fields when task is done
  const normalizedStatus = task.status?.toLowerCase();
  if (normalizedStatus === 'done' || normalizedStatus === 'completed') {
    const nowIso = new Date().toISOString();
    if (task.claimed_by !== null) {
      console.warn(`[tasks] Auto-correcting claimed_by for completed task ${task.task_id}`);
      task.claimed_by = null;
    }
    if (task.workflow_stage !== 'completed' && task.workflow_stage !== 'done') {
      console.warn(`[tasks] Auto-correcting workflow_stage for completed task ${task.task_id}`);
      task.workflow_stage = 'completed';
    }
    if (!task.timestamps?.completed_at) {
      console.warn(`[tasks] Auto-setting completed_at for completed task ${task.task_id}`);
      const timestamps = task.timestamps ?? { created_at: nowIso, updated_at: nowIso, started_at: null, completed_at: null };
      timestamps.completed_at = timestamps.completed_at || nowIso;
      (task as unknown as { timestamps: typeof timestamps }).timestamps = timestamps;
    }
    // Re-serialize after auto-corrections
    try {
      serialized = JSON.stringify(task, null, 2);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to re-serialize task ${task.task_id} after terminal field enforcement: ${errorMessage}`);
    }
  }

  const projectDir = path.join(TASKS_DIR, task.project_id);
  await fs.mkdir(projectDir, { recursive: true });
  const filePath = path.join(projectDir, `${task.task_id}.json`);
  await fs.writeFile(filePath, `${serialized}\n`, 'utf8');
  invalidateTaskCache();
}

export async function getCanonicalTaskSummary() {
  const tasks = await getCanonicalTasks();

  const byStatus: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  const byProject: Record<string, number> = {};

  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    byAgent[task.assigned_agent] = (byAgent[task.assigned_agent] || 0) + 1;
    byProject[task.project_id] = (byProject[task.project_id] || 0) + 1;
  }

  return {
    total: tasks.length,
    byStatus,
    byAgent,
    byProject,
  };
}
