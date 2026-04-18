import { NextRequest, NextResponse } from 'next/server';
import { getCanonicalTask, writeCanonicalTask, clearTaskRuntimeState } from '@/lib/control/tasks';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ForceDoneBody {
  task_id: string;
  project_id: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as ForceDoneBody | null;

    if (!body?.task_id || !body?.project_id) {
      return NextResponse.json(
        { error: 'task_id and project_id are required.' },
        { status: 400 }
      );
    }

    const { task_id, project_id } = body;

    const canonical = await getCanonicalTask(task_id, project_id);
    if (!canonical) {
      return NextResponse.json(
        { error: `Canonical task ${task_id} not found in project ${project_id}.` },
        { status: 404 }
      );
    }

    // Set status to done, clear claimed_by, set workflow_stage
    canonical.status = 'done';
    canonical.claimed_by = null;
    canonical.workflow_stage = 'completed';
    canonical.timestamps = {
      ...canonical.timestamps,
      completed_at: canonical.timestamps.completed_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await writeCanonicalTask(canonical);
    await clearTaskRuntimeState(project_id, task_id);

    // Also update the kanban task record in SQLite to put it in the Done column
    const db = getDb();
    const doneColumn = db
      .prepare("SELECT id FROM columns WHERE board_id = (SELECT board_id FROM columns WHERE id = (SELECT column_id FROM tasks WHERE canonical_task_id = ? AND project_id = ? LIMIT 1)) AND LOWER(name) = 'done' LIMIT 1")
      .get(task_id, project_id) as { id: string } | undefined;

    if (doneColumn) {
      db.prepare("UPDATE tasks SET column_id = ? WHERE canonical_task_id = ? AND project_id = ?")
        .run(doneColumn.id, task_id, project_id);
    }

    return NextResponse.json({ ok: true, task_id, project_id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}