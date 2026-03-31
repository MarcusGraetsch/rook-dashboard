import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { markKanbanTaskArchived, restoreKanbanTaskToBacklog } from '@/lib/control/task-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = getDb();
    const tasks = db.prepare(`
      SELECT
        t.*,
        c.name as column_name,
        b.name as board_name
      FROM tasks t
      JOIN columns c ON c.id = t.column_id
      JOIN boards b ON b.id = c.board_id
      WHERE t.archived_at IS NOT NULL
      ORDER BY t.archived_at DESC, t.updated_at DESC
    `).all();

    return NextResponse.json({ status: 'ok', tasks });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const taskId = body?.task_id;
    const action = body?.action || 'archive';

    if (!taskId || typeof taskId !== 'string') {
      return NextResponse.json({ status: 'error', message: 'task_id is required' }, { status: 400 });
    }

    const db = getDb();
    const task = db.prepare(`
      SELECT t.id, t.title, t.archived_at, c.name as column_name
      FROM tasks t
      JOIN columns c ON c.id = t.column_id
      WHERE t.id = ?
    `).get(taskId) as { id: string; title: string; column_name: string; archived_at: string | null } | undefined;

    if (!task) {
      return NextResponse.json({ status: 'error', message: 'task not found' }, { status: 404 });
    }

    if (action === 'restore') {
      if (!task.archived_at) {
        return NextResponse.json(
          { status: 'error', message: 'task is not archived' },
          { status: 400 }
        );
      }

      const restored = await restoreKanbanTaskToBacklog(db, taskId);

      return NextResponse.json({
        status: 'ok',
        restored,
        task: {
          id: task.id,
          title: task.title,
        },
      });
    }

    if (task.column_name.toLowerCase() !== 'done') {
      return NextResponse.json(
        { status: 'error', message: 'only done tasks can be archived' },
        { status: 400 }
      );
    }

    const archived = await markKanbanTaskArchived(db, taskId);

    return NextResponse.json({
      status: 'ok',
      archived,
      task: {
        id: task.id,
        title: task.title,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
