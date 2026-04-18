import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getCanonicalTasks, type CanonicalTask } from '@/lib/control/tasks';

const execFileAsync = promisify(execFile);

const OPERATIONS_DIR =
  process.env.ROOK_OPERATIONS_DIR || '/root/.openclaw/workspace/operations';
const RUNTIME_ROOT = process.env.ROOK_RUNTIME_ROOT || '/root/.openclaw/runtime';
const RUNTIME_OPERATIONS_DIR =
  process.env.ROOK_RUNTIME_OPERATIONS_DIR || path.join(RUNTIME_ROOT, 'operations');
const HEALTH_DIR = path.join(RUNTIME_OPERATIONS_DIR, 'health');
const RUNTIME_SMOKE_FILE = path.join(HEALTH_DIR, 'runtime-smoke.json');

const AGENT_WORKSPACES: Record<string, string> = {
  rook: '/root/.openclaw/workspace',
  engineer: '/root/.openclaw/workspace-engineer',
  researcher: '/root/.openclaw/workspace-researcher',
  test: '/root/.openclaw/workspace-test',
  review: '/root/.openclaw/workspace-review',
  coach: '/root/.openclaw/workspace-coach',
  health: '/root/.openclaw/workspace-health',
};

// Matches openclaw.json agents.list — excludes `dispatcher` (one-shot systemd service, no persistent sessions)
const AGENT_IDS = ['rook', 'engineer', 'researcher', 'test', 'review', 'coach', 'health'];

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
    smoke_ok?: boolean;
    smoke_checked_at?: string | null;
  };
}

interface RuntimeSmokeEntry {
  agent_id: string;
  ok: boolean;
  reason: string | null;
}

interface RuntimeSmokeSnapshot {
  updated_at: string;
  ok: boolean;
  results: RuntimeSmokeEntry[];
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

async function readRuntimeSmoke(): Promise<RuntimeSmokeSnapshot | null> {
  try {
    const raw = await fs.readFile(RUNTIME_SMOKE_FILE, 'utf8');
    return JSON.parse(raw) as RuntimeSmokeSnapshot;
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

function deriveStatus(agentId: string, tasks: CanonicalTask[]) {
  const assigned = tasks.filter((task) => task.assigned_agent === agentId);
  const inProgress = assigned.filter((task) => task.status === 'in_progress');
  const ready = assigned.filter((task) => task.status === 'ready');
  const blocked = assigned.filter((task) => task.status === 'blocked');
  const testing = assigned.filter((task) => task.status === 'testing');
  const review = assigned.filter((task) => task.status === 'review');
  const done = assigned.filter((task) => task.status === 'done');
  const currentTask =
    inProgress[0]?.task_id || testing[0]?.task_id || review[0]?.task_id || null;

  // Most recently completed task
  const lastCompleted =
    done
      .filter((t) => t.timestamps?.completed_at)
      .sort((a, b) => new Date(b.timestamps!.completed_at!).getTime() - new Date(a.timestamps!.completed_at!).getTime())[0]
      ?.task_id || done[0]?.task_id || null;

  // Most recently updated blocked task; suppress if a successful completion happened more recently
  const latestError = assigned
    .filter((t) => t.status === 'blocked' && t.failure_reason && t.timestamps?.updated_at)
    .sort((a, b) => new Date(b.timestamps!.updated_at!).getTime() - new Date(a.timestamps!.updated_at!).getTime())[0];
  const latestDoneTime = done
    .filter((t) => t.timestamps?.completed_at)
    .reduce((max, t) => Math.max(max, new Date(t.timestamps!.completed_at!).getTime()), 0);
  const latestErrorTime = latestError?.timestamps?.updated_at
    ? new Date(latestError.timestamps.updated_at).getTime()
    : 0;
  const lastError: string | null =
    latestError && latestErrorTime > latestDoneTime
      ? (latestError.failure_reason ?? null)
      : assigned.find((task) => task.github_issue?.last_error)?.github_issue?.last_error || null;

  let status: HealthSnapshot['status'] = 'idle';
  if (lastError) status = 'error';
  else if (blocked.length > 0) status = 'blocked';
  else if (inProgress.length > 0 || testing.length > 0 || review.length > 0) status = 'in_progress';
  else if (ready.length > 0) status = 'ready';

  return {
    status,
    currentTask,
    queueDepth: ready.length + inProgress.length + blocked.length + testing.length + review.length,
    lastCompleted,
    lastError,
  };
}

async function buildSnapshot(agentId: string): Promise<HealthSnapshot> {
  const workspace = AGENT_WORKSPACES[agentId] || `/root/.openclaw/workspace-${agentId}`;
  const [runtime, runtimeSmoke, tasks] = await Promise.all([
    latestSessionUpdate(agentId),
    readRuntimeSmoke(),
    getCanonicalTasks(),
  ]);
  const smokeEntry = runtimeSmoke?.results?.find((entry) => entry.agent_id === agentId) || null;
  const taskState = deriveStatus(agentId, tasks);
  const [remote, head] = await Promise.all([gitRemote(workspace), gitHead(workspace)]);
  const now = Date.now();
  const staleMs = runtime.latest ? now - new Date(runtime.latest).getTime() : Number.POSITIVE_INFINITY;
  const isStale = staleMs > 90 * 60 * 1000;
  const smokeFailed = smokeEntry?.ok === false;
  const derivedStatus =
    smokeFailed
      ? 'error'
      : !runtime.latest && taskState.queueDepth === 0
      ? 'offline'
      : isStale && taskState.queueDepth > 0
        ? 'blocked'
        : taskState.status;
  const derivedError =
    smokeFailed
      ? `Runtime smoke failed: ${smokeEntry?.reason || 'unknown error'}`
      : isStale && taskState.queueDepth > 0
      ? `No agent session update for ${Math.floor(staleMs / 60000)} minutes.`
      : taskState.lastError;

  return {
    agent_id: agentId,
    status: derivedStatus,
    current_task_id: taskState.currentTask,
    last_seen_at: runtime.latest || new Date().toISOString(),
    workspace,
    queue_depth: taskState.queueDepth,
    last_error: derivedError,
    last_completed_task: taskState.lastCompleted,
    repo_heads: remote && head ? { [remote]: head } : {},
    runtime: {
      session_count: runtime.count,
      latest_session_update_at: runtime.latest,
      smoke_ok: smokeEntry?.ok,
      smoke_checked_at: runtimeSmoke?.updated_at || null,
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
      const parsed = JSON.parse(raw) as Partial<HealthSnapshot>;
      if (typeof parsed.agent_id !== 'string' || !AGENT_IDS.includes(parsed.agent_id)) {
        continue;
      }
      snapshots.push(parsed as HealthSnapshot);
    } catch {
      // Ignore malformed snapshot files.
    }
  }

  return snapshots.sort((left, right) => left.agent_id.localeCompare(right.agent_id));
}
