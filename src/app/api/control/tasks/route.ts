import { NextRequest, NextResponse } from 'next/server';
import {
  getCanonicalTasks,
  getCanonicalTaskSummary,
  getCanonicalTask,
  writeCanonicalTask,
  type Artifact,
  type CanonicalTask,
} from '@/lib/control/tasks';

export const dynamic = 'force-dynamic';

function normalizeArtifact(artifact: unknown): Artifact | null {
  if (!artifact || typeof artifact !== 'object') {
    return null;
  }

  const value = artifact as Record<string, unknown>;
  const type = String(value.type || '').trim();

  if (type === 'pr_link' && typeof value.url === 'string' && value.url.trim()) {
    return {
      type: 'pr_link',
      url: value.url.trim(),
      number: Number.isFinite(Number(value.number)) ? Number(value.number) : undefined,
      title: typeof value.title === 'string' ? value.title : undefined,
    };
  }

  if (type === 'test_results') {
    return {
      type: 'test_results',
      passed: Number(value.passed || 0),
      failed: Number(value.failed || 0),
      skipped: Number(value.skipped || 0),
      summary: typeof value.summary === 'string' ? value.summary : undefined,
    };
  }

  if (type === 'complexity_analysis') {
    const riskScore = String(value.risk_score || '').trim();
    return {
      type: 'complexity_analysis',
      lines_changed: Number(value.lines_changed || 0),
      files_touched: Number(value.files_touched || 0),
      risk_score: riskScore === 'high' || riskScore === 'medium' || riskScore === 'low' ? riskScore : 'low',
    };
  }

  if (type === 'video_walkthrough' && typeof value.url === 'string' && value.url.trim()) {
    return {
      type: 'video_walkthrough',
      url: value.url.trim(),
      description: typeof value.description === 'string' ? value.description : undefined,
    };
  }

  if (type === 'code_change' && typeof value.file_path === 'string' && value.file_path.trim()) {
    return {
      type: 'code_change',
      file_path: value.file_path.trim(),
      description: typeof value.description === 'string' ? value.description : '',
    };
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const workflow_stage = searchParams.get('workflow_stage') || undefined;
    const parent_task = searchParams.get('parent_task') || undefined;
    const project_id = searchParams.get('project_id') || undefined;

    const [tasks, summary] = await Promise.all([
      getCanonicalTasks({
        status: status as CanonicalTask['status'] | undefined,
        workflow_stage,
        parent_task,
        project_id,
      }),
      getCanonicalTaskSummary(),
    ]);

    return NextResponse.json({
      status: 'ok',
      source: 'git-operations',
      tasks,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        message: error.message,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { task_id, project_id, status, artifacts_append, retry_reset, parent_task } = body || {};

    if (!task_id || !project_id) {
      return NextResponse.json({ status: 'error', message: 'task_id and project_id required' }, { status: 400 });
    }

    const task = await getCanonicalTask(String(task_id), String(project_id));
    if (!task) {
      return NextResponse.json({ status: 'error', message: 'Task not found' }, { status: 404 });
    }

    const validStatuses: CanonicalTask['status'][] = [
      'backlog',
      'intake',
      'ready',
      'in_progress',
      'review',
      'rework',
      'human_review',
      'merging',
      'testing',
      'blocked',
      'done',
    ];

    if (status !== undefined) {
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ status: 'error', message: `Invalid status: ${status}` }, { status: 400 });
      }
      task.status = status;
    }

    if (parent_task !== undefined) {
      task.parent_task = parent_task ? String(parent_task) : null;
    }

    if (Array.isArray(artifacts_append) && artifacts_append.length > 0) {
      const appended = artifacts_append
        .map(normalizeArtifact)
        .filter((value): value is Artifact => Boolean(value));
      if (appended.length > 0) {
        task.artifacts = [...(Array.isArray(task.artifacts) ? task.artifacts : []), ...appended];
      }
    }

    if (retry_reset === true && task.retry) {
      task.retry = {
        ...task.retry,
        attempt: 0,
        last_error: null,
        next_retry_at: null,
        history: Array.isArray(task.retry.history) ? task.retry.history : [],
      };
    }

    task.timestamps.updated_at = new Date().toISOString();
    await writeCanonicalTask(task);

    return NextResponse.json({ status: 'ok', task });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        message: error.message,
      },
      { status: 500 },
    );
  }
}
