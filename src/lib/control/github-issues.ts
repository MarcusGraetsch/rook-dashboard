import { execFile } from 'child_process';
import { promisify } from 'util';
import { getCanonicalTask, writeCanonicalTask, type CanonicalTask } from '@/lib/control/tasks';

const execFileAsync = promisify(execFile);

interface GhIssueView {
  number: number;
  url: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
}

export interface IssueSyncResult {
  task_id: string;
  repo: string;
  number: number | null;
  url: string | null;
  state: 'open' | 'closed' | null;
  sync_status: 'synced' | 'error';
  message: string;
}

function buildIssueTitle(task: CanonicalTask): string {
  return `[task:${task.task_id}] ${task.title}`;
}

function buildIssueBody(task: CanonicalTask): string {
  const lines = [
    `## Task`,
    ``,
    task.description,
    ``,
    `## Metadata`,
    ``,
    `- Task ID: \`${task.task_id}\``,
    `- Project: \`${task.project_id}\``,
    `- Status: \`${task.status}\``,
    `- Priority: \`${task.priority}\``,
    `- Assigned Agent: \`${task.assigned_agent}\``,
    `- Branch: \`${task.branch}\``,
    `- Repo: \`${task.related_repo}\``,
  ];

  if (task.dependencies.length > 0) {
    lines.push(`- Dependencies: \`${task.dependencies.join(', ')}\``);
  }

  if (task.labels && task.labels.length > 0) {
    lines.push(`- Labels: ${task.labels.map((label) => `\`${label}\``).join(', ')}`);
  }

  if (task.handoff_notes) {
    lines.push('', `## Handoff Notes`, '', task.handoff_notes);
  }

  if (task.blocked_reason) {
    lines.push('', `## Blocked Reason`, '', task.blocked_reason);
  }

  lines.push('', `## Canonical Record`, '', `This issue is mirrored from the Rook canonical task system.`);
  return lines.join('\n');
}

async function runGh(args: string[]) {
  return execFileAsync('gh', args, { maxBuffer: 1024 * 1024 });
}

function isNotFound(error: unknown): boolean {
  const msg = String((error as any)?.stderr || (error as any)?.stdout || (error as any)?.message || '');
  return msg.includes('404') || /not found/i.test(msg);
}

async function ensureGhAuth() {
  try {
    await runGh(['auth', 'status']);
  } catch (error: any) {
    const message = error?.stderr?.trim() || error?.stdout?.trim() || error?.message || 'GitHub authentication failed.';
    throw new Error(message);
  }
}

async function viewIssue(repo: string, number: number): Promise<GhIssueView> {
  const { stdout } = await runGh([
    'api',
    `repos/${repo}/issues/${number}`,
    '--jq',
    '{number: .number, url: .html_url, state: .state, labels: [.labels[].name], assignees: [.assignees[].login]}',
  ]);

  return JSON.parse(stdout) as GhIssueView;
}

async function createIssue(task: CanonicalTask): Promise<GhIssueView> {
  const { stdout } = await runGh([
    'api',
    `repos/${task.related_repo}/issues`,
    '--method',
    'POST',
    '-f',
    `title=${buildIssueTitle(task)}`,
    '-f',
    `body=${buildIssueBody(task)}`,
  ]);
  const parsed = JSON.parse(stdout) as { number: number };
  return viewIssue(task.related_repo, parsed.number);
}

async function updateIssue(task: CanonicalTask, number: number): Promise<GhIssueView> {
  // View first — determines what updates are safe and needed.
  const current = await viewIssue(task.related_repo, number);
  const taskDone = task.status === 'done';

  // Consistent state: done task with closed issue — nothing to do.
  if (taskDone && current.state === 'closed') {
    return current;
  }

  // Update title/body only for open issues — PATCH on a closed issue returns 422.
  if (current.state === 'open') {
    await runGh([
      'api',
      `repos/${task.related_repo}/issues/${number}`,
      '--method',
      'PATCH',
      '-f',
      `title=${buildIssueTitle(task)}`,
      '-f',
      `body=${buildIssueBody(task)}`,
    ]);
  }

  // Close when task is done and issue is still open.
  if (taskDone) {
    await runGh([
      'api',
      `repos/${task.related_repo}/issues/${number}`,
      '--method',
      'PATCH',
      '-f',
      'state=closed',
    ]);
    return viewIssue(task.related_repo, number);
  }

  // For open issues: re-fetch so returned data reflects the PATCH above.
  if (current.state === 'open') {
    return viewIssue(task.related_repo, number);
  }

  // Closed issue, task not done: content skipped, state left as-is (respect manual GitHub state).
  return current;
}

function applySyncSuccess(task: CanonicalTask, issue: GhIssueView): CanonicalTask {
  // Merge labels additively: keep canonical labels, add any new GitHub labels
  const existingLabels = task.labels || [];
  const mergedLabels = Array.from(new Set([...existingLabels, ...issue.labels]));

  return {
    ...task,
    labels: mergedLabels,
    github_issue: {
      repo: task.related_repo,
      number: issue.number,
      url: issue.url,
      state: issue.state,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error: null,
      assignees: issue.assignees.length > 0 ? issue.assignees : null,
    },
    timestamps: {
      ...task.timestamps,
      updated_at: new Date().toISOString(),
    },
  };
}

function applySyncError(task: CanonicalTask, message: string): CanonicalTask {
  return {
    ...task,
    github_issue: {
      repo: task.related_repo,
      number: task.github_issue?.number || null,
      url: task.github_issue?.url || null,
      state: task.github_issue?.state || null,
      sync_status: 'error',
      last_synced_at: task.github_issue?.last_synced_at || null,
      last_error: message,
    },
    timestamps: {
      ...task.timestamps,
      updated_at: new Date().toISOString(),
    },
  };
}

export async function syncTaskToGithubIssue(taskId: string, projectId?: string | null): Promise<IssueSyncResult> {
  const task = await getCanonicalTask(taskId, projectId);
  if (!task) {
    throw new Error(`Canonical task not found: ${projectId ? `${projectId}/` : ''}${taskId}`);
  }

  try {
    await ensureGhAuth();

    const issue = task.github_issue?.number
      ? await updateIssue(task, task.github_issue.number)
      : await createIssue(task);

    const updated = applySyncSuccess(task, issue);
    await writeCanonicalTask(updated);

    return {
      task_id: updated.task_id,
      repo: updated.related_repo,
      number: updated.github_issue?.number || null,
      url: updated.github_issue?.url || null,
      state: updated.github_issue?.state || null,
      sync_status: 'synced',
      message: updated.github_issue?.number
        ? `Synced GitHub issue #${updated.github_issue.number}.`
        : 'Synced GitHub issue.',
    };
  } catch (error: unknown) {
    // Issue was deleted or made inaccessible on GitHub: clear the reference so the next sync
    // creates a fresh issue rather than surfacing a permanent 404 error.
    if (isNotFound(error) && task.github_issue?.number) {
      const clearedNumber = task.github_issue.number;
      const cleared: CanonicalTask = {
        ...task,
        github_issue: {
          repo: task.related_repo,
          number: null,
          url: null,
          state: null,
          sync_status: 'not_requested',
          last_synced_at: task.github_issue.last_synced_at || null,
          last_error: null,
        },
        timestamps: {
          ...task.timestamps,
          updated_at: new Date().toISOString(),
        },
      };
      await writeCanonicalTask(cleared);
      return {
        task_id: task.task_id,
        repo: task.related_repo,
        number: null,
        url: null,
        state: null,
        sync_status: 'synced',
        message: `GitHub issue #${clearedNumber} not found (deleted or inaccessible). Reference cleared — next sync will create a fresh issue.`,
      };
    }

    const message = (error as any)?.stderr?.trim() || (error as any)?.stdout?.trim() || (error as any)?.message || 'GitHub issue sync failed.';
    const updated = applySyncError(task, message);
    await writeCanonicalTask(updated);

    return {
      task_id: updated.task_id,
      repo: updated.related_repo,
      number: updated.github_issue?.number || null,
      url: updated.github_issue?.url || null,
      state: updated.github_issue?.state || null,
      sync_status: 'error',
      message,
    };
  }
}
