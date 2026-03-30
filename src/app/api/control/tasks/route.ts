import { NextResponse } from 'next/server';
import { getCanonicalTasks, getCanonicalTaskSummary } from '@/lib/control/tasks';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [tasks, summary] = await Promise.all([
      getCanonicalTasks(),
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
