import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  isWorkflowColumnName,
  normalizeKanbanName,
  workflowColumnPosition,
} from '@/lib/control/kanban-workflow';
import { randomUUID } from 'crypto';

function generateId() {
  return randomUUID();
}

function getColumnRecord(db: ReturnType<typeof getDb>, id: string) {
  return db.prepare('SELECT id, board_id, name, position, color FROM columns WHERE id = ?').get(id) as
    | { id: string; board_id: string; name: string; position: number; color: string | null }
    | undefined;
}

// POST /api/kanban/columns - Create a new column
export async function POST(request: NextRequest) {
  try {
    const { board_id, name, color } = await request.json();
    const id = generateId();
    
    const db = getDb();

    if (!board_id || !String(name || '').trim()) {
      return NextResponse.json({ error: 'board_id and name are required.' }, { status: 400 });
    }

    if (!isWorkflowColumnName(name)) {
      return NextResponse.json(
        { error: 'Custom columns are not supported. Boards use the fixed canonical workflow.' },
        { status: 400 }
      );
    }

    const existing = db.prepare(
      'SELECT id, board_id, name, position, color FROM columns WHERE board_id = ? AND lower(name) = lower(?) LIMIT 1'
    ).get(board_id, String(name).trim()) as
      | { id: string; board_id: string; name: string; position: number; color: string | null }
      | undefined;

    if (existing) {
      return NextResponse.json(existing);
    }
    
    const position = workflowColumnPosition(String(name).trim());
    if (position < 0) {
      return NextResponse.json({ error: 'Unsupported workflow column.' }, { status: 400 });
    }
    
    db.prepare(
      'INSERT INTO columns (id, board_id, name, position, color) VALUES (?, ?, ?, ?, ?)'
    ).run(id, board_id, String(name).trim(), position, color || '#6b7280');
    
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
    const existing = getColumnRecord(db, id);

    if (!existing) {
      return NextResponse.json({ error: 'Column not found.' }, { status: 404 });
    }

    const isWorkflowColumn = isWorkflowColumnName(existing.name);
    if (isWorkflowColumn) {
      if (name !== undefined && normalizeKanbanName(String(name)) !== normalizeKanbanName(existing.name)) {
        return NextResponse.json(
          { error: 'Canonical workflow columns cannot be renamed.' },
          { status: 400 }
        );
      }

      if (position !== undefined && Number(position) !== existing.position) {
        return NextResponse.json(
          { error: 'Canonical workflow columns cannot be reordered manually.' },
          { status: 400 }
        );
      }
    }
    
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
    const existing = getColumnRecord(db, id);
    if (!existing) {
      return NextResponse.json({ error: 'Column not found.' }, { status: 404 });
    }

    if (isWorkflowColumnName(existing.name)) {
      return NextResponse.json(
        { error: 'Canonical workflow columns cannot be deleted.' },
        { status: 400 }
      );
    }

    db.prepare('DELETE FROM columns WHERE id = ?').run(id);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
