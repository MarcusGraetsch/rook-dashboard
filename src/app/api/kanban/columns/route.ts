import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

function generateId() {
  return randomUUID();
}

// POST /api/kanban/columns - Create a new column
export async function POST(request: NextRequest) {
  try {
    const { board_id, name, color } = await request.json();
    const id = generateId();
    
    const db = getDb();
    
    // Get max position
    const maxPos = db.prepare(
      'SELECT MAX(position) as max FROM columns WHERE board_id = ?'
    ).get(board_id) as { max: number | null };
    
    const position = (maxPos?.max ?? -1) + 1;
    
    db.prepare(
      'INSERT INTO columns (id, board_id, name, position, color) VALUES (?, ?, ?, ?, ?)'
    ).run(id, board_id, name, position, color || '#6b7280');
    
    const column = db.prepare('SELECT * FROM columns WHERE id = ?').get(id);
    
    return NextResponse.json(column, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/kanban/columns - Update a column
export async function PUT(request: NextRequest) {
  try {
    const { id, name, color, position } = await request.json();
    
    const db = getDb();
    
    if (position !== undefined) {
      db.prepare(
        'UPDATE columns SET position = ?, updated_at = datetime("now") WHERE id = ?'
      ).run(position, id);
    }
    
    if (name !== undefined || color !== undefined) {
      const updates: string[] = [];
      const values: any[] = [];
      
      if (name) {
        updates.push('name = ?');
        values.push(name);
      }
      if (color) {
        updates.push('color = ?');
        values.push(color);
      }
      
      values.push(id);
      db.prepare(
        `UPDATE columns SET ${updates.join(', ')}, updated_at = datetime("now") WHERE id = ?`
      ).run(...values);
    }
    
    const column = db.prepare('SELECT * FROM columns WHERE id = ?').get(id);
    
    return NextResponse.json(column);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/kanban/columns?id=xxx - Delete a column
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Column ID required' }, { status: 400 });
    }
    
    const db = getDb();
    db.prepare('DELETE FROM columns WHERE id = ?').run(id);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
