import { execFile } from 'child_process';
import { promisify } from 'util';
import { getCanonicalTask, writeCanonicalTask, type CanonicalTask } from '@/lib/control/tasks';

const execFileAsync = promisify(execFile);

interface GhIssueView {
  number: number;
  url: string;
  state: 'open' | 'closed';
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
    '{number: .number, url: .html_url, state: .state}',
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

  const current = await viewIssue(task.related_repo, number);

  if (task.status === 'done' && current.state !== 'closed') {
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

  if (task.status !== 'done' && current.state === 'closed') {
    await runGh([
      'api',
      `repos/${task.related_repo}/issues/${number}`,
      '--method',
      'PATCH',
      '-f',
      'state=open',
    ]);
    return viewIssue(task.related_repo, number);
  }

  return current;
}

function applySyncSuccess(task: CanonicalTask, issue: GhIssueView): CanonicalTask {
  return {
    ...task,
    github_issue: {
      repo: task.related_repo,
      number: issue.number,
      url: issue.url,
      state: issue.state,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error: null,
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

export async function syncTaskToGithubIssue(taskId: string): Promise<IssueSyncResult> {
  const task = await getCanonicalTask(taskId);
  if (!task) {
    throw new Error(`Canonical task not found: ${taskId}`);
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
  } catch (error: any) {
    const message = error?.message || 'GitHub issue sync failed.';
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
