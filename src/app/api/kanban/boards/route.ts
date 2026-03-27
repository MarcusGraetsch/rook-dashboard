import { NextRequest, NextResponse } from 'next/server';
import { getDb, Board, Column, Task } from '@/lib/db';
import { randomUUID } from 'crypto';

function generateId() {
  return randomUUID();
}

// GET /api/kanban/boards - List all boards with columns and tasks
export async function GET() {
  try {
    const db = getDb();
    
    const boards = db.prepare('SELECT * FROM boards ORDER BY created_at DESC').all() as Board[];
    const columns = db.prepare('SELECT * FROM columns ORDER BY position').all() as Column[];
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY position').all() as Task[];
    
    // Group by board
    const result = boards.map((board: Board) => ({
      ...board,
      columns: columns
        .filter((col: Column) => col.board_id === board.id)
        .map((col: Column) => ({
          ...col,
          tasks: tasks.filter((task: Task) => task.column_id === col.id)
        }))
    }));
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/kanban/boards - Create a new board
export async function POST(request: NextRequest) {
  try {
    const { name, description } = await request.json();
    const id = generateId();
    
    const db = getDb();
    
    // Create board
    db.prepare(
      'INSERT INTO boards (id, name, description) VALUES (?, ?, ?)'
    ).run(id, name, description || null);
    
    // Create default columns
    const defaultColumns = [
      { name: 'To Do', color: '#6b7280', position: 0 },
      { name: 'In Progress', color: '#3b82f6', position: 1 },
      { name: 'Done', color: '#22c55e', position: 2 },
    ];
    
    const insertColumn = db.prepare(
      'INSERT INTO columns (id, board_id, name, position, color) VALUES (?, ?, ?, ?, ?)'
    );
    
    for (const col of defaultColumns) {
      insertColumn.run(generateId(), id, col.name, col.position, col.color);
    }
    
    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
    
    return NextResponse.json(board, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/kanban/boards?id=xxx - Delete a board
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Board ID required' }, { status: 400 });
    }
    
    const db = getDb();
    db.prepare('DELETE FROM boards WHERE id = ?').run(id);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
