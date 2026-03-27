import { NextRequest, NextResponse } from 'next/server';
import { getDb, Board, Column, Task } from '@/lib/db';
import { randomUUID } from 'crypto';

// Token-efficient Agent API for Kanban
// Returns minimal data needed for agent context

function generateId() {
  return randomUUID();
}

// GET /api/kanban/agent?board=xxx
// Returns a compact board representation for agent context
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('board');
    
    const db = getDb();
    
    if (boardId) {
      // Get specific board
      const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId) as Board | undefined;
      if (!board) {
        return NextResponse.json({ error: 'Board not found' }, { status: 404 });
      }
      
      const columns = db.prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position').all(boardId) as Column[];
      const tasks = db.prepare(`
        SELECT t.*, 
          (SELECT COUNT(*) FROM subtasks WHERE task_id = t.id) as subtask_count,
          (SELECT COUNT(*) FROM subtasks WHERE task_id = t.id AND completed = 1) as subtask_done
        FROM tasks t 
        WHERE t.column_id IN (SELECT id FROM columns WHERE board_id = ?)
        ORDER BY t.position
      `).all(boardId) as any[];
      
      return NextResponse.json({
        id: board.id,
        name: board.name,
        columns: columns.map(col => ({
          id: col.id,
          name: col.name,
          tasks: tasks.filter(t => t.column_id === col.id).map(t => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            assignee: t.assignee,
            done: t.subtask_done > 0 && t.subtask_done === t.subtask_count,
            subtasks: `${t.subtask_done}/${t.subtask_count}`,
          })),
        })),
      });
    } else {
      // List all boards (minimal)
      const boards = db.prepare('SELECT id, name FROM boards ORDER BY created_at DESC').all() as { id: string; name: string }[];
      return NextResponse.json({ boards });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/kanban/agent
// Create task or subtask
// Body: { action: "create_task" | "create_subtask", ... }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    
    const db = getDb();
    
    if (action === 'create_task') {
      const { board_id, column_id, title, description, priority, assignee } = body;
      
      if (!column_id || !title?.trim()) {
        return NextResponse.json({ error: 'column_id and title required' }, { status: 400 });
      }
      
      const id = generateId();
      const maxPos = db.prepare('SELECT MAX(position) as max FROM tasks WHERE column_id = ?').get(column_id) as { max: number | null };
      
      db.prepare(`
        INSERT INTO tasks (id, column_id, title, description, priority, assignee, position)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, column_id, title.trim(), description || null, priority || 'medium', assignee || null, (maxPos?.max ?? -1) + 1);
      
      return NextResponse.json({ id, title: title.trim(), status: 'created' });
    }
    
    if (action === 'toggle_subtask') {
      const { subtask_id, completed } = body;
      
      if (!subtask_id) {
        return NextResponse.json({ error: 'subtask_id required' }, { status: 400 });
      }
      
      db.prepare('UPDATE subtasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, subtask_id);
      
      return NextResponse.json({ status: 'updated' });
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
