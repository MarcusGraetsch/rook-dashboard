import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const OPERATIONS_DIR =
  process.env.ROOK_OPERATIONS_DIR || '/root/.openclaw/workspace/operations';
const PROJECTS_FILE = path.join(OPERATIONS_DIR, 'projects', 'projects.json');

interface ProjectEntry {
  project_id: string;
  name: string;
  related_repo: string;
  type: string;
}

export interface RepoDiagnostic {
  project_id: string;
  name: string;
  repo: string;
  type: string;
  auth: 'ok' | 'invalid';
  repo_access: 'ok' | 'error';
  issues_access: 'ok' | 'error';
  status: 'ok' | 'error';
  message: string;
}

async function runGh(args: string[]) {
  return execFileAsync('gh', args, { maxBuffer: 1024 * 1024 });
}

async function loadProjects(): Promise<ProjectEntry[]> {
  try {
    const raw = await fs.readFile(PROJECTS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as ProjectEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function checkAuth(): Promise<{ ok: boolean; message: string }> {
  try {
    await runGh(['auth', 'status']);
    return { ok: true, message: 'GitHub CLI authenticated.' };
  } catch (error: any) {
    const message = error?.stderr?.trim() || error?.stdout?.trim() || error?.message || 'GitHub auth invalid.';
    return { ok: false, message };
  }
}

async function checkRepoAccess(repo: string): Promise<{ ok: boolean; message: string }> {
  try {
    await runGh(['repo', 'view', repo, '--json', 'nameWithOwner,isPrivate']);
    return { ok: true, message: 'Repo access ok.' };
  } catch (error: any) {
    const message = error?.stderr?.trim() || error?.stdout?.trim() || error?.message || 'Repo access failed.';
    return { ok: false, message };
  }
}

async function checkIssuesAccess(repo: string): Promise<{ ok: boolean; message: string }> {
  try {
    await runGh(['issue', 'list', '--repo', repo, '--limit', '1']);
    return { ok: true, message: 'Issues access ok.' };
  } catch (error: any) {
    const message = error?.stderr?.trim() || error?.stdout?.trim() || error?.message || 'Issues access failed.';
    return { ok: false, message };
  }
}

function classifyMessage(message: string): string {
  if (message.includes('Resource not accessible by personal access token')) {
    return 'Token lacks required access for this repository.';
  }
  if (message.includes('authentication failed')) {
    return 'GitHub CLI authentication is invalid.';
  }
  if (message.includes('Could not resolve host') || message.includes('error connecting to api.github.com')) {
    return 'GitHub API unreachable from this environment.';
  }
  return message;
}

export async function getGithubDiagnostics() {
  const auth = await checkAuth();
  const entries = await loadProjects();

  if (!auth.ok) {
    return {
      auth: 'invalid' as const,
      summary: {
        total: entries.length,
        ok: 0,
        error: entries.length,
      },
      repos: entries.map((project) => ({
        project_id: project.project_id,
        name: project.name,
        repo: project.related_repo,
        type: project.type,
        auth: 'invalid' as const,
        repo_access: 'error' as const,
        issues_access: 'error' as const,
        status: 'error' as const,
        message: classifyMessage(auth.message),
      })),
    };
  }

  const repos: RepoDiagnostic[] = [];

  for (const project of entries) {
    const repoAccess = await checkRepoAccess(project.related_repo);
    const issuesAccess = repoAccess.ok
      ? await checkIssuesAccess(project.related_repo)
      : { ok: false, message: repoAccess.message };

    const status = repoAccess.ok && issuesAccess.ok ? 'ok' : 'error';
    const message = classifyMessage(
      issuesAccess.ok ? repoAccess.message : issuesAccess.message || repoAccess.message
    );

    repos.push({
      project_id: project.project_id,
      name: project.name,
      repo: project.related_repo,
      type: project.type,
      auth: 'ok',
      repo_access: repoAccess.ok ? 'ok' : 'error',
      issues_access: issuesAccess.ok ? 'ok' : 'error',
      status,
      message,
    });
  }

  return {
    auth: 'ok' as const,
    summary: {
      total: repos.length,
      ok: repos.filter((repo) => repo.status === 'ok').length,
      error: repos.filter((repo) => repo.status === 'error').length,
    },
    repos,
  };
}
