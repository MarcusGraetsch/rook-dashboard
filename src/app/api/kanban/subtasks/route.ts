import { NextRequest, NextResponse } from 'next/server';
import { getDb, SubTask } from '@/lib/db';
import { syncKanbanTaskToCanonical } from '@/lib/control/task-sync';
import { randomUUID } from 'crypto';

function generateId() {
  return randomUUID();
}

function getParentTaskId(db: ReturnType<typeof getDb>, subtaskId: string): string | null {
  const row = db.prepare('SELECT task_id FROM subtasks WHERE id = ?').get(subtaskId) as { task_id: string } | undefined;
  return row?.task_id || null;
}

// GET /api/kanban/subtasks?task_id=xxx - Get subtasks for a task
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const task_id = searchParams.get('task_id');
    
    if (!task_id) {
      return NextResponse.json({ error: 'task_id required' }, { status: 400 });
    }
    
    const db = getDb();
    const subtasks = db.prepare(
      'SELECT * FROM subtasks WHERE task_id = ? ORDER BY position'
    ).all(task_id) as SubTask[];
    
    // Token-efficient: return minimal data
    const result = subtasks.map(s => ({
      id: s.id,
      title: s.title,
      completed: !!s.completed,
      position: s.position,
    }));
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/kanban/subtasks - Create a subtask
export async function POST(request: NextRequest) {
  try {
    const { task_id, title } = await request.json();
    
    if (!task_id || !title?.trim()) {
      return NextResponse.json({ error: 'task_id and title required' }, { status: 400 });
    }
    
    const db = getDb();
    
    // Get max position
    const maxPos = db.prepare(
      'SELECT MAX(position) as max FROM subtasks WHERE task_id = ?'
    ).get(task_id) as { max: number | null };
    
    const id = generateId();
    const position = (maxPos?.max ?? -1) + 1;
    
    db.prepare(
      'INSERT INTO subtasks (id, task_id, title, position) VALUES (?, ?, ?, ?)'
    ).run(id, task_id, title.trim(), position);

    await syncKanbanTaskToCanonical(db, task_id);
    
    return NextResponse.json({ id, title: title.trim(), completed: false, position }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/kanban/subtasks - Update a subtask (toggle completed, rename)
export async function PUT(request: NextRequest) {
  try {
    const { id, title, completed } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    
    const db = getDb();
    const taskId = getParentTaskId(db, id);
    
    if (completed !== undefined) {
      db.prepare('UPDATE subtasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, id);
    }
    
    if (title !== undefined) {
      db.prepare('UPDATE subtasks SET title = ? WHERE id = ?').run(title, id);
    }

    if (taskId) {
      await syncKanbanTaskToCanonical(db, taskId);
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/kanban/subtasks?id=xxx - Delete a subtask
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    
    const db = getDb();
    const taskId = getParentTaskId(db, id);
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);

    if (taskId) {
      await syncKanbanTaskToCanonical(db, taskId);
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
