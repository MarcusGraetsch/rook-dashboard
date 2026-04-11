import { NextRequest, NextResponse } from 'next/server';
import { planAndRefineTaskDraft } from '@/lib/control/task-refinement';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await planAndRefineTaskDraft({
      title: body?.title || null,
      description: body?.description || null,
      intake_brief: body?.intake_brief || null,
      project_id: body?.project_id || null,
      related_repo: body?.related_repo || null,
      priority: body?.priority || null,
      assignee: body?.assignee || null,
      labels: Array.isArray(body?.labels) ? body.labels : [],
    });

    return NextResponse.json({
      status: 'ok',
      refinement: result,
      plan: result.plan,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        error: error.message || 'Failed to plan task.',
      },
      { status: 500 },
    );
  }
}
