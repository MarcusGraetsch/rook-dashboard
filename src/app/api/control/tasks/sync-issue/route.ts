import { NextRequest, NextResponse } from 'next/server';
import { syncTaskToGithubIssue } from '@/lib/control/github-issues';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const taskId = body?.task_id;
    const projectId = typeof body?.project_id === 'string' ? body.project_id : null;

    if (!taskId || typeof taskId !== 'string') {
      return NextResponse.json(
        {
          status: 'error',
          message: 'task_id is required',
        },
        { status: 400 },
      );
    }

    const result = await syncTaskToGithubIssue(taskId, projectId);
    const statusCode = result.sync_status === 'synced' ? 200 : 502;

    return NextResponse.json(
      {
        status: result.sync_status === 'synced' ? 'ok' : 'error',
        result,
      },
      { status: statusCode },
    );
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
