import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import Database from 'better-sqlite3';

const execFileAsync = promisify(execFile);

const OPERATIONS_DIR =
  process.env.ROOK_OPERATIONS_DIR || '/root/.openclaw/workspace/operations';
const HEALTH_DIR = path.join(OPERATIONS_DIR, 'health');
const KANBAN_DB =
  process.env.ROOK_KANBAN_DB ||
  '/root/.openclaw/workspace/engineering/rook-dashboard/data/kanban.db';

const AGENT_WORKSPACES: Record<string, string> = {
  rook: '/root/.openclaw/workspace',
  engineer: '/root/.openclaw/workspace-engineer',
  researcher: '/root/.openclaw/workspace-researcher',
  coach: '/root/.openclaw/workspace-coach',
  health: '/root/.openclaw/workspace-health',
  consultant: '/root/.openclaw/workspace-consultant',
};

const AGENT_IDS = ['rook', 'engineer', 'researcher', 'coach', 'health', 'consultant'];

export function getTrackedAgentIds() {
  return [...AGENT_IDS];
}

export interface HealthSnapshot {
  agent_id: string;
  status: 'idle' | 'ready' | 'in_progress' | 'blocked' | 'error' | 'offline';
  current_task_id: string | null;
  last_seen_at: string;
  workspace: string;
  queue_depth: number;
  last_error: string | null;
  last_completed_task: string | null;
  repo_heads: Record<string, string>;
  runtime: {
    session_count: number;
    latest_session_update_at: string | null;
  };
}

async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

async function safeStat(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

function sessionDir(agentId: string) {
  return path.join('/root/.openclaw/agents', agentId, 'sessions');
}

async function latestSessionUpdate(agentId: string): Promise<{ count: number; latest: string | null }> {
  const dir = sessionDir(agentId);
  const entries = await safeReadDir(dir);
  let latestMs = 0;

  for (const entry of entries) {
    const stat = await safeStat(path.join(dir, entry));
    if (stat) {
      latestMs = Math.max(latestMs, stat.mtimeMs);
    }
  }

  return {
    count: entries.length,
    latest: latestMs > 0 ? new Date(latestMs).toISOString() : null,
  };
}

async function gitHead(workspace: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd: workspace });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function gitRemote(workspace: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], { cwd: workspace });
    const url = stdout.trim();
    if (!url) return null;
    const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return match ? match[1] : url;
  } catch {
    return null;
  }
}

function readKanbanTasks() {
  try {
    const db = new Database(KANBAN_DB, { readonly: true });
    const rows = db.prepare(`
      SELECT
        t.canonical_task_id,
        t.sync_error,
        t.assignee,
        c.name as column_name
      FROM tasks t
      JOIN columns c ON c.id = t.column_id
      WHERE t.archived_at IS NULL
    `).all() as Array<{
      canonical_task_id: string | null;
      sync_error: string | null;
      assignee: string | null;
      column_name: string;
    }>;
    db.close();
    return rows;
  } catch {
    return [];
  }
}

function deriveStatus(agentId: string, tasks: ReturnType<typeof readKanbanTasks>) {
  const assigned = tasks.filter((task) => task.assignee === agentId);
  const inProgress = assigned.filter((task) => task.column_name.toLowerCase() === 'in progress');
  const ready = assigned.filter((task) => task.column_name.toLowerCase() === 'ready');
  const blocked = assigned.filter((task) => task.column_name.toLowerCase() === 'blocked');
  const done = assigned.filter((task) => task.column_name.toLowerCase() === 'done');
  const currentTask = inProgress[0]?.canonical_task_id || null;
  const lastCompleted = done[0]?.canonical_task_id || null;
  const lastError = assigned.find((task) => task.sync_error)?.sync_error || null;

  let status: HealthSnapshot['status'] = 'idle';
  if (lastError) status = 'error';
  else if (blocked.length > 0) status = 'blocked';
  else if (inProgress.length > 0) status = 'in_progress';
  else if (ready.length > 0) status = 'ready';

  return {
    status,
    currentTask,
    queueDepth: ready.length + inProgress.length + blocked.length,
    lastCompleted,
    lastError,
  };
}

async function buildSnapshot(agentId: string): Promise<HealthSnapshot> {
  const workspace = AGENT_WORKSPACES[agentId] || `/root/.openclaw/workspace-${agentId}`;
  const runtime = await latestSessionUpdate(agentId);
  const tasks = readKanbanTasks();
  const taskState = deriveStatus(agentId, tasks);
  const [remote, head] = await Promise.all([gitRemote(workspace), gitHead(workspace)]);

  return {
    agent_id: agentId,
    status: taskState.status,
    current_task_id: taskState.currentTask,
    last_seen_at: runtime.latest || new Date().toISOString(),
    workspace,
    queue_depth: taskState.queueDepth,
    last_error: taskState.lastError,
    last_completed_task: taskState.lastCompleted,
    repo_heads: remote && head ? { [remote]: head } : {},
    runtime: {
      session_count: runtime.count,
      latest_session_update_at: runtime.latest,
    },
  };
}

export async function writeHealthSnapshots(): Promise<HealthSnapshot[]> {
  await fs.mkdir(HEALTH_DIR, { recursive: true });
  const snapshots: HealthSnapshot[] = [];

  for (const agentId of AGENT_IDS) {
    const snapshot = await buildSnapshot(agentId);
    snapshots.push(snapshot);
    await fs.writeFile(
      path.join(HEALTH_DIR, `${agentId}.json`),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      'utf8'
    );
  }

  return snapshots;
}

export async function readHealthSnapshots(): Promise<HealthSnapshot[]> {
  const files = await safeReadDir(HEALTH_DIR);
  const snapshots: HealthSnapshot[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(HEALTH_DIR, file), 'utf8');
      snapshots.push(JSON.parse(raw) as HealthSnapshot);
    } catch {
      // Ignore malformed snapshot files.
    }
  }

  return snapshots.sort((left, right) => left.agent_id.localeCompare(right.agent_id));
}
