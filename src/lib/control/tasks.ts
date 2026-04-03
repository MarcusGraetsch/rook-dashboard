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
  } catch {
    return null;
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
  if (runtimeState.github_issue) merged.github_issue = runtimeState.github_issue;
  if (runtimeState.github_pull_request) merged.github_pull_request = runtimeState.github_pull_request;
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

export async function getCanonicalTasks(): Promise<CanonicalTask[]> {
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

export async function getCanonicalTask(taskId: string, projectId?: string | null): Promise<CanonicalTask | null> {
  const candidates = await getTaskFileCandidates(taskId, projectId);
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
  const projectDir = path.join(TASKS_DIR, task.project_id);
  await fs.mkdir(projectDir, { recursive: true });
  const filePath = path.join(projectDir, `${task.task_id}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(task, null, 2)}\n`, 'utf8');
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
