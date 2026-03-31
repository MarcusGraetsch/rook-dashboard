import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  archiveKanbanTaskSync,
  autoSyncKanbanTaskToGithub,
  syncKanbanTaskToCanonical,
} from '@/lib/control/task-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface BulkSyncRow {
  id: string;
  title: string;
  column_name: string;
  sync_status: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const deleteDone = body?.delete_done === true;

    const db = getDb();
    const rows = db.prepare(`
      SELECT
        t.id,
        t.title,
        t.sync_status,
        c.name as column_name
      FROM tasks t
      JOIN columns c ON c.id = t.column_id
      ORDER BY c.position, t.position
    `).all() as BulkSyncRow[];

    const synced: Array<{ id: string; title: string; canonical_task_id: string }> = [];
    const skipped: Array<{ id: string; title: string; reason: string }> = [];
    const deleted: Array<{ id: string; title: string }> = [];
    const errors: Array<{ id: string; title: string; error: string }> = [];

    for (const row of rows) {
      const isDone = row.column_name.toLowerCase() === 'done';

      if (isDone) {
        if (deleteDone) {
          try {
            await archiveKanbanTaskSync(db, row.id);
            db.prepare('DELETE FROM tasks WHERE id = ?').run(row.id);
            deleted.push({ id: row.id, title: row.title });
          } catch (error: any) {
            errors.push({
              id: row.id,
              title: row.title,
              error: error.message || 'Failed to delete done task.',
            });
          }
        } else {
          skipped.push({ id: row.id, title: row.title, reason: 'done' });
        }
        continue;
      }

      try {
        const sync = await syncKanbanTaskToCanonical(db, row.id);
        await autoSyncKanbanTaskToGithub(db, sync.canonicalTaskId);
        synced.push({
          id: row.id,
          title: row.title,
          canonical_task_id: sync.canonicalTaskId,
        });
      } catch (error: any) {
        errors.push({
          id: row.id,
          title: row.title,
          error: error.message || 'Bulk sync failed.',
        });
      }
    }

    return NextResponse.json({
      status: errors.length > 0 ? 'partial' : 'ok',
      synced,
      skipped,
      deleted,
      errors,
      summary: {
        synced: synced.length,
        skipped: skipped.length,
        deleted: deleted.length,
        errors: errors.length,
      },
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
