import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  getCanonicalTask,
  writeCanonicalTask,
  type CanonicalTask,
  type TaskGitContext,
} from '@/lib/control/tasks';

const execFileAsync = promisify(execFile);

interface GhCommit {
  sha: string;
  commit: {
    message: string;
    committer?: {
      date?: string;
    };
  };
  html_url?: string;
}

interface GhPull {
  number: number;
  html_url: string;
  state: 'open' | 'closed';
  merged_at: string | null;
  title: string;
}

function toShortSha(sha: string): string {
  return sha.slice(0, 7);
}

async function runGh(args: string[]) {
  return execFileAsync('gh', args, { maxBuffer: 1024 * 1024 });
}

async function ensureGhAuth() {
  await runGh(['auth', 'status']);
}

function ownerFromRepo(repo: string): string {
  return repo.split('/')[0];
}

async function fetchBranchCommits(repo: string, branch: string) {
  const { stdout } = await runGh([
    'api',
    `repos/${repo}/commits`,
    '-f',
    `sha=${branch}`,
    '-f',
    'per_page=5',
  ]);

  const commits = JSON.parse(stdout) as GhCommit[];
  return commits.map((commit) => ({
    sha: commit.sha,
    short_sha: toShortSha(commit.sha),
    message: commit.commit.message.split('\n')[0] || '(no message)',
    url: commit.html_url || null,
    committed_at: commit.commit.committer?.date || null,
  }));
}

async function branchExists(repo: string, branch: string): Promise<boolean> {
  try {
    await runGh(['api', `repos/${repo}/branches/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

async function fetchBranchPullRequest(repo: string, branch: string) {
  const owner = ownerFromRepo(repo);
  const { stdout } = await runGh([
    'api',
    `repos/${repo}/pulls`,
    '-f',
    'state=all',
    '-f',
    `head=${owner}:${branch}`,
  ]);

  const pulls = JSON.parse(stdout) as GhPull[];
  if (!Array.isArray(pulls) || pulls.length === 0) {
    return null;
  }

  const latest = pulls[0];
  return {
    repo,
    number: latest.number,
    url: latest.html_url,
    state: latest.merged_at ? 'merged' as const : latest.state,
    title: latest.title,
    last_synced_at: new Date().toISOString(),
    last_error: null,
  };
}

function applyGitContext(task: CanonicalTask, commits: TaskGitContext['commits'], pullRequest: CanonicalTask['github_pull_request']) {
  return {
    ...task,
    commits: commits.map((commit) => commit.sha),
    github_pull_request: pullRequest || {
      repo: task.related_repo,
      number: null,
      url: null,
      state: null,
      title: null,
      last_synced_at: new Date().toISOString(),
      last_error: null,
    },
    timestamps: {
      ...task.timestamps,
      updated_at: new Date().toISOString(),
    },
  };
}

function applyGitContextError(task: CanonicalTask, message: string) {
  return {
    ...task,
    github_pull_request: {
      repo: task.related_repo,
      number: task.github_pull_request?.number || null,
      url: task.github_pull_request?.url || null,
      state: task.github_pull_request?.state || null,
      title: task.github_pull_request?.title || null,
      last_synced_at: task.github_pull_request?.last_synced_at || null,
      last_error: message,
    },
    timestamps: {
      ...task.timestamps,
      updated_at: new Date().toISOString(),
    },
  };
}

export async function getTaskGitContext(taskId: string): Promise<TaskGitContext> {
  const task = await getCanonicalTask(taskId);
  if (!task) {
    throw new Error(`Canonical task not found: ${taskId}`);
  }

  try {
    await ensureGhAuth();
    const exists = await branchExists(task.related_repo, task.branch);
    const commits = await fetchBranchCommits(task.related_repo, task.branch);
    const pullRequest = await fetchBranchPullRequest(task.related_repo, task.branch);
    const updated = applyGitContext(task, commits, pullRequest || undefined);
    await writeCanonicalTask(updated);

    const activity_status =
      pullRequest?.state === 'merged'
        ? 'merged'
        : pullRequest?.state === 'open'
          ? 'pr_open'
          : commits.length > 0
            ? 'commits_pushed'
            : exists
              ? 'branch_pushed'
              : 'planned';

    return {
      branch: updated.branch,
      related_repo: updated.related_repo,
      branch_exists: exists,
      activity_status,
      issue: updated.github_issue || null,
      pull_request: updated.github_pull_request || null,
      commits,
    };
  } catch (error: any) {
    const message = error?.message || 'GitHub branch context lookup failed.';
    const updated = applyGitContextError(task, message);
    await writeCanonicalTask(updated);

    return {
      branch: updated.branch,
      related_repo: updated.related_repo,
      branch_exists: false,
      activity_status: 'error',
      issue: updated.github_issue || null,
      pull_request: updated.github_pull_request || null,
      commits: (updated.commits || []).map((sha) => ({
        sha,
        short_sha: toShortSha(sha),
        message: 'Stored canonical commit',
        url: updated.related_repo
          ? `https://github.com/${updated.related_repo}/commit/${sha}`
          : null,
        committed_at: null,
      })),
    };
  }
}
