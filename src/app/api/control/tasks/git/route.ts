import { NextResponse } from 'next/server';
import { getTaskGitContext } from '@/lib/control/github-activity';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('task_id');
  const projectId = searchParams.get('project_id');

  if (!taskId) {
    return NextResponse.json({ error: 'task_id is required' }, { status: 400 });
  }

  try {
    const context = await getTaskGitContext(taskId, projectId);
    return NextResponse.json({ context });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load task git context.' },
      { status: 500 }
    );
  }
}
