import { NextRequest, NextResponse } from 'next/server';
import { getDb, Task } from '@/lib/db';
import {
  archiveKanbanTaskSync,
  autoSyncKanbanTaskToGithub,
  syncKanbanTaskToCanonical,
} from '@/lib/control/task-sync';
import { randomUUID } from 'crypto';

function generateId() {
  return randomUUID();
}

// GET /api/kanban/tasks?column_id=xxx - Get tasks by column
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const column_id = searchParams.get('column_id');
    
    const db = getDb();
    
    let tasks;
    if (column_id) {
      tasks = db.prepare(
        'SELECT * FROM tasks WHERE column_id = ? AND archived_at IS NULL ORDER BY position'
      ).all(column_id);
    } else {
      tasks = db.prepare('SELECT * FROM tasks WHERE archived_at IS NULL ORDER BY position').all();
    }
    
    return NextResponse.json(tasks);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/kanban/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const { column_id, title, description, priority, labels, assignee, due_date } = await request.json();
    const id = generateId();
    
    const db = getDb();
    
    // Get max position in column
    const maxPos = db.prepare(
      'SELECT MAX(position) as max FROM tasks WHERE column_id = ?'
    ).get(column_id) as { max: number | null };
    
    const position = (maxPos?.max ?? -1) + 1;
    
    db.prepare(`
      INSERT INTO tasks (id, column_id, title, description, position, priority, labels, assignee, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      column_id,
      title,
      description || null,
      position,
      priority || 'medium',
      JSON.stringify(Array.isArray(labels) ? labels : (labels ? JSON.parse(labels) : [])),
      assignee || null,
      due_date || null
    );
    
    const sync = await syncKanbanTaskToCanonical(db, id);
    try {
      await autoSyncKanbanTaskToGithub(db, sync.canonicalTaskId);
    } catch {
      // Canonical task is already saved; GitHub sync errors are persisted separately.
    }
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;

    return NextResponse.json({ ...(task || {}), sync }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/kanban/tasks - Update a task
export async function PUT(request: NextRequest) {
  try {
    const { id, column_id, title, description, priority, labels, assignee, due_date, position } = await request.json();
    
    const db = getDb();
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (column_id !== undefined) {
      updates.push('column_id = ?');
      values.push(column_id);
    }
    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      values.push(priority);
    }
    if (labels !== undefined) {
      updates.push('labels = ?');
      values.push(JSON.stringify(Array.isArray(labels) ? labels : (labels ? JSON.parse(labels) : [])));
    }
    if (assignee !== undefined) {
      updates.push('assignee = ?');
      values.push(assignee);
    }
    if (due_date !== undefined) {
      updates.push('due_date = ?');
      values.push(due_date);
    }
    if (position !== undefined) {
      updates.push('position = ?');
      values.push(position);
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = datetime(\'now\')');
      values.push(id);
      
      db.prepare(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`
      ).run(...values);
    }
    
    const sync = await syncKanbanTaskToCanonical(db, id);
    try {
      await autoSyncKanbanTaskToGithub(db, sync.canonicalTaskId);
    } catch {
      // Canonical task is already saved; GitHub sync errors are persisted separately.
    }
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;

    return NextResponse.json({ ...(task || {}), sync });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/kanban/tasks?id=xxx - Delete a task
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }
    
    const db = getDb();
    const archived = await archiveKanbanTaskSync(db, id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    
    return NextResponse.json({ success: true, archived });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
