import { NextRequest, NextResponse } from 'next/server';
import { getDb, Board, Column, Task } from '@/lib/db';
import {
  archiveKanbanTaskSync,
  autoSyncKanbanTaskToGithub,
  syncKanbanTaskToCanonical,
} from '@/lib/control/task-sync';
import { randomUUID } from 'crypto';

// Token-efficient Agent API for Kanban
// All operations an agent needs to manage boards

function generateId() {
  return randomUUID();
}

// GET /api/kanban/agent?board=xxx&compact=1
// Returns board representation for agent context
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('board');
    const listOnly = searchParams.get('list') === '1';
    
    const db = getDb();
    
    if (listOnly) {
      // Minimal list for agent context - token efficient
      const boards = db.prepare('SELECT id, name FROM boards ORDER BY created_at DESC').all() as { id: string; name: string }[];
      return NextResponse.json({ boards });
    }
    
    if (boardId) {
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
          AND t.archived_at IS NULL
        ORDER BY t.position
      `).all(boardId) as any[];
      
      return NextResponse.json({
        id: board.id,
        name: board.name,
        columns: columns.map(col => ({
          id: col.id,
          name: col.name,
          color: col.color,
          tasks: tasks.filter(t => t.column_id === col.id).map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            priority: t.priority,
            assignee: t.assignee,
            due_date: t.due_date,
            canonical_task_id: t.canonical_task_id,
            project_id: t.project_id,
            related_repo: t.related_repo,
            github_issue_number: t.github_issue_number,
            github_issue_url: t.github_issue_url,
            sync_status: t.sync_status,
            sync_error: t.sync_error,
            labels: t.labels ? JSON.parse(t.labels) : [],
            done: t.subtask_done > 0 && t.subtask_done === t.subtask_count && t.subtask_count > 0,
            subtasks: `${t.subtask_done}/${t.subtask_count}`,
          })),
        })),
      });
    }
    
    // No params: list all boards
    const boards = db.prepare('SELECT id, name FROM boards ORDER BY created_at DESC').all();
    return NextResponse.json({ boards });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/kanban/agent
// Actions: create_board, create_task, update_task, delete_task, move_task
//         create_column, delete_column
//         toggle_subtask, create_subtask, delete_subtask
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    
    const db = getDb();
    
    // === BOARD OPERATIONS ===
    
    if (action === 'create_board') {
      const { name, description } = body;
      if (!name?.trim()) {
        return NextResponse.json({ error: 'name required' }, { status: 400 });
      }
      
      const id = generateId();
      db.prepare('INSERT INTO boards (id, name, description) VALUES (?, ?, ?)').run(id, name.trim(), description || null);
      
      // Create default columns
      const defaultColumns = [
        { name: 'To Do', color: '#6b7280', position: 0 },
        { name: 'In Progress', color: '#3b82f6', position: 1 },
        { name: 'Done', color: '#22c55e', position: 2 },
      ];
      
      for (const col of defaultColumns) {
        db.prepare('INSERT INTO columns (id, board_id, name, position, color) VALUES (?, ?, ?, ?, ?)').run(
          generateId(), id, col.name, col.position, col.color
        );
      }
      
      return NextResponse.json({ id, name: name.trim(), status: 'created' });
    }
    
    if (action === 'delete_board') {
      const { board_id } = body;
      if (!board_id) return NextResponse.json({ error: 'board_id required' }, { status: 400 });
      
      db.prepare('DELETE FROM boards WHERE id = ?').run(board_id);
      return NextResponse.json({ status: 'deleted' });
    }
    
    // === COLUMN OPERATIONS ===
    
    if (action === 'create_column') {
      const { board_id, name, color } = body;
      if (!board_id || !name?.trim()) {
        return NextResponse.json({ error: 'board_id and name required' }, { status: 400 });
      }
      
      const maxPos = db.prepare('SELECT MAX(position) as max FROM columns WHERE board_id = ?').get(board_id) as { max: number | null };
      const id = generateId();
      
      db.prepare('INSERT INTO columns (id, board_id, name, position, color) VALUES (?, ?, ?, ?, ?)').run(
        id, board_id, name.trim(), (maxPos?.max ?? -1) + 1, color || '#6b7280'
      );
      
      return NextResponse.json({ id, name: name.trim(), status: 'created' });
    }
    
    if (action === 'delete_column') {
      const { column_id } = body;
      if (!column_id) return NextResponse.json({ error: 'column_id required' }, { status: 400 });
      
      db.prepare('DELETE FROM columns WHERE id = ?').run(column_id);
      return NextResponse.json({ status: 'deleted' });
    }
    
    // === TASK OPERATIONS ===
    
    if (action === 'create_task') {
      const { column_id, title, description, priority, assignee, labels, due_date } = body;
      
      if (!column_id || !title?.trim()) {
        return NextResponse.json({ error: 'column_id and title required' }, { status: 400 });
      }
      
      const id = generateId();
      const maxPos = db.prepare('SELECT MAX(position) as max FROM tasks WHERE column_id = ?').get(column_id) as { max: number | null };
      
      db.prepare(`
        INSERT INTO tasks (id, column_id, title, description, priority, assignee, labels, due_date, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, column_id, title.trim(),
        description || null,
        priority || 'medium',
        assignee || null,
        labels ? JSON.stringify(labels) : '[]',
        due_date || null,
        (maxPos?.max ?? -1) + 1
      );
      
      const sync = await syncKanbanTaskToCanonical(db, id);
      try {
        await autoSyncKanbanTaskToGithub(db, sync.canonicalTaskId);
      } catch {
        // Canonical task is already saved; GitHub sync errors are persisted separately.
      }
      return NextResponse.json({ id, title: title.trim(), status: 'created', sync });
    }
    
    if (action === 'update_task') {
      const { task_id, title, description, priority, assignee, labels, due_date, column_id, position } = body;
      
      if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
      
      const updates: string[] = [];
      const values: any[] = [];
      
      if (title !== undefined) { updates.push('title = ?'); values.push(title); }
      if (description !== undefined) { updates.push('description = ?'); values.push(description); }
      if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
      if (assignee !== undefined) { updates.push('assignee = ?'); values.push(assignee); }
      if (labels !== undefined) { updates.push('labels = ?'); values.push(JSON.stringify(labels)); }
      if (due_date !== undefined) { updates.push('due_date = ?'); values.push(due_date); }
      if (column_id !== undefined) { updates.push('column_id = ?'); values.push(column_id); }
      if (position !== undefined) { updates.push('position = ?'); values.push(position); }
      
      if (updates.length > 0) {
        values.push(task_id);
        db.prepare(`UPDATE tasks SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);
      }
      
      const sync = await syncKanbanTaskToCanonical(db, task_id);
      try {
        await autoSyncKanbanTaskToGithub(db, sync.canonicalTaskId);
      } catch {
        // Canonical task is already saved; GitHub sync errors are persisted separately.
      }
      return NextResponse.json({ status: 'updated', sync });
    }
    
    if (action === 'delete_task') {
      const { task_id } = body;
      if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
      
      const archived = await archiveKanbanTaskSync(db, task_id);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(task_id);
      return NextResponse.json({ status: 'deleted', archived });
    }
    
    if (action === 'move_task') {
      const { task_id, column_id, position } = body;
      if (!task_id || !column_id) {
        return NextResponse.json({ error: 'task_id and column_id required' }, { status: 400 });
      }
      
      db.prepare(`
        UPDATE tasks SET column_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?
      `).run(column_id, position ?? 0, task_id);
      
      const sync = await syncKanbanTaskToCanonical(db, task_id);
      try {
        await autoSyncKanbanTaskToGithub(db, sync.canonicalTaskId);
      } catch {
        // Canonical task is already saved; GitHub sync errors are persisted separately.
      }
      return NextResponse.json({ status: 'moved', sync });
    }
    
    // === SUBTASK OPERATIONS ===
    
    if (action === 'create_subtask') {
      const { task_id, title } = body;
      if (!task_id || !title?.trim()) {
        return NextResponse.json({ error: 'task_id and title required' }, { status: 400 });
      }
      
      const maxPos = db.prepare('SELECT MAX(position) as max FROM subtasks WHERE task_id = ?').get(task_id) as { max: number | null };
      const id = generateId();
      
      db.prepare('INSERT INTO subtasks (id, task_id, title, position) VALUES (?, ?, ?, ?)').run(
        id, task_id, title.trim(), (maxPos?.max ?? -1) + 1
      );
      
      return NextResponse.json({ id, title: title.trim(), status: 'created' });
    }
    
    if (action === 'toggle_subtask') {
      const { subtask_id, completed } = body;
      if (!subtask_id) return NextResponse.json({ error: 'subtask_id required' }, { status: 400 });
      
      db.prepare('UPDATE subtasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, subtask_id);
      return NextResponse.json({ status: 'updated' });
    }
    
    if (action === 'delete_subtask') {
      const { subtask_id } = body;
      if (!subtask_id) return NextResponse.json({ error: 'subtask_id required' }, { status: 400 });
      
      db.prepare('DELETE FROM subtasks WHERE id = ?').run(subtask_id);
      return NextResponse.json({ status: 'deleted' });
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
