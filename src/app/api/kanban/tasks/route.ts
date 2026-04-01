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

const STATUS_TO_COLUMN: Record<string, string> = {
  backlog: 'Backlog',
  intake: 'Intake',
  ready: 'Ready',
  in_progress: 'In Progress',
  testing: 'Testing',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getColumnRecord(db: ReturnType<typeof getDb>, columnId: string) {
  return db.prepare('SELECT id, board_id, name FROM columns WHERE id = ?').get(columnId) as
    | { id: string; board_id: string; name: string }
    | undefined;
}

function resolveWorkflowColumn(
  db: ReturnType<typeof getDb>,
  boardId: string,
  status: string
) {
  const columnName = STATUS_TO_COLUMN[status];
  if (!columnName) {
    return null;
  }

  return db.prepare(
    `
      SELECT id, board_id, name
      FROM columns
      WHERE board_id = ?
        AND lower(name) = lower(?)
      ORDER BY position
      LIMIT 1
    `
  ).get(boardId, columnName) as { id: string; board_id: string; name: string } | undefined;
}

function countChecklistItems(
  db: ReturnType<typeof getDb>,
  taskId: string,
  checklist: unknown
) {
  if (Array.isArray(checklist)) {
    return checklist.filter((item) => String((item as any)?.title || '').trim()).length;
  }

  const row = db.prepare('SELECT COUNT(*) as count FROM subtasks WHERE task_id = ?').get(taskId) as
    | { count: number }
    | undefined;
  return row?.count || 0;
}

function validateReadyRequirements(
  db: ReturnType<typeof getDb>,
  args: {
    taskId?: string;
    intakeBrief?: unknown;
    checklist?: unknown;
  }
) {
  const intakeBrief = String(args.intakeBrief || '').trim();
  const existingTask = args.taskId
    ? (db
        .prepare('SELECT intake_brief FROM tasks WHERE id = ?')
        .get(args.taskId) as { intake_brief: string | null } | undefined)
    : undefined;
  const effectiveBrief = intakeBrief || String(existingTask?.intake_brief || '').trim();
  const checklistCount = countChecklistItems(db, args.taskId || '', args.checklist);

  if (!effectiveBrief) {
    return 'Ready requires a non-empty intake brief. Send the ticket to Intake first or add a clear brief.';
  }

  if (checklistCount === 0) {
    return 'Ready requires at least one checklist item. Refine the ticket first or add the checklist manually.';
  }

  return null;
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
    const {
      column_id,
      title,
      description,
      intake_brief,
      refinement_source,
      refinement_summary,
      refined_at,
      priority,
      labels,
      assignee,
      due_date,
      project_id,
      related_repo,
      checklist,
      target_status,
    } = await request.json();
    const id = generateId();
    
    const db = getDb();
    let effectiveColumnId = column_id;
    if (target_status) {
      const sourceColumn = getColumnRecord(db, column_id);
      const resolved = sourceColumn ? resolveWorkflowColumn(db, sourceColumn.board_id, target_status) : null;
      if (resolved) {
        effectiveColumnId = resolved.id;
      }
    }

    const targetColumn = getColumnRecord(db, effectiveColumnId);
    if (!targetColumn) {
      return NextResponse.json({ error: 'Target column not found.' }, { status: 400 });
    }

    const effectiveAssignee =
      assignee !== undefined && assignee !== null && String(assignee).trim()
        ? assignee
        : normalizeName(targetColumn.name) === 'intake'
          ? 'coach'
          : null;

    if (normalizeName(targetColumn.name) === 'ready') {
      const readyError = validateReadyRequirements(db, {
        intakeBrief: intake_brief,
        checklist,
      });
      if (readyError) {
        return NextResponse.json({ error: readyError }, { status: 400 });
      }
    }
    
    // Get max position in column
    const maxPos = db.prepare(
      'SELECT MAX(position) as max FROM tasks WHERE column_id = ?'
    ).get(effectiveColumnId) as { max: number | null };
    
    const position = (maxPos?.max ?? -1) + 1;
    
    db.prepare(`
      INSERT INTO tasks (id, column_id, title, description, intake_brief, refinement_source, refinement_summary, refined_at, position, priority, labels, assignee, due_date, project_id, related_repo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      effectiveColumnId,
      title,
      description || null,
      intake_brief || null,
      refinement_source || null,
      refinement_summary || null,
      refined_at || null,
      position,
      priority || 'medium',
      JSON.stringify(Array.isArray(labels) ? labels : (labels ? JSON.parse(labels) : [])),
      effectiveAssignee,
      due_date || null,
      project_id || null,
      related_repo || null,
    );

    if (Array.isArray(checklist)) {
      const insertSubtask = db.prepare(
        'INSERT INTO subtasks (id, task_id, title, completed, position) VALUES (?, ?, ?, ?, ?)'
      );
      checklist.forEach((item, index) => {
        const title = String(item?.title || '').trim();
        if (!title) return;
        insertSubtask.run(
          generateId(),
          id,
          title,
          item?.completed ? 1 : 0,
          Number.isInteger(item?.position) ? item.position : index,
        );
      });
    }
    
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
    const {
      id,
      column_id,
      title,
      description,
      intake_brief,
      refinement_source,
      refinement_summary,
      refined_at,
      priority,
      labels,
      assignee,
      due_date,
      position,
      project_id,
      related_repo,
      checklist,
      target_status,
    } = await request.json();
    
    const db = getDb();
    const currentTask = db.prepare(`
      SELECT t.id, t.column_id, c.board_id
      FROM tasks t
      JOIN columns c ON c.id = t.column_id
      WHERE t.id = ?
    `).get(id) as { id: string; column_id: string; board_id: string } | undefined;

    if (!currentTask) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    let effectiveColumnId = column_id;
    if (target_status) {
      const resolved = resolveWorkflowColumn(db, currentTask.board_id, target_status);
      if (!resolved) {
        return NextResponse.json({ error: `Workflow column missing for status "${target_status}".` }, { status: 400 });
      }
      effectiveColumnId = resolved.id;
    }

    const targetColumn = effectiveColumnId ? getColumnRecord(db, effectiveColumnId) : getColumnRecord(db, currentTask.column_id);
    if (!targetColumn) {
      return NextResponse.json({ error: 'Target column not found.' }, { status: 400 });
    }

    if (normalizeName(targetColumn.name) === 'ready') {
      const readyError = validateReadyRequirements(db, {
        taskId: id,
        intakeBrief: intake_brief,
        checklist,
      });
      if (readyError) {
        return NextResponse.json({ error: readyError }, { status: 400 });
      }
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (effectiveColumnId !== undefined) {
      updates.push('column_id = ?');
      values.push(effectiveColumnId);
    }
    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (intake_brief !== undefined) {
      updates.push('intake_brief = ?');
      values.push(intake_brief);
    }
    if (refinement_source !== undefined) {
      updates.push('refinement_source = ?');
      values.push(refinement_source);
    }
    if (refinement_summary !== undefined) {
      updates.push('refinement_summary = ?');
      values.push(refinement_summary);
    }
    if (refined_at !== undefined) {
      updates.push('refined_at = ?');
      values.push(refined_at);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      values.push(priority);
    }
    if (labels !== undefined) {
      updates.push('labels = ?');
      values.push(JSON.stringify(Array.isArray(labels) ? labels : (labels ? JSON.parse(labels) : [])));
    }
    if (due_date !== undefined) {
      updates.push('due_date = ?');
      values.push(due_date);
    }
    if (project_id !== undefined) {
      updates.push('project_id = ?');
      values.push(project_id);
    }
    if (related_repo !== undefined) {
      updates.push('related_repo = ?');
      values.push(related_repo);
    }
    const effectiveAssignee =
      assignee !== undefined
        ? (assignee && String(assignee).trim()
            ? assignee
            : normalizeName(targetColumn.name) === 'intake'
              ? 'coach'
              : assignee)
        : undefined;

    if (position !== undefined) {
      updates.push('position = ?');
      values.push(position);
    }
    if (effectiveAssignee !== undefined) {
      updates.push('assignee = ?');
      values.push(effectiveAssignee);
    }

    if (updates.length > 0) {
      updates.push('updated_at = datetime(\'now\')');
      values.push(id);
      
      db.prepare(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`
      ).run(...values);
    }

    if (Array.isArray(checklist)) {
      db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(id);
      const insertSubtask = db.prepare(
        'INSERT INTO subtasks (id, task_id, title, completed, position) VALUES (?, ?, ?, ?, ?)'
      );
      checklist.forEach((item, index) => {
        const title = String(item?.title || '').trim();
        if (!title) return;
        insertSubtask.run(
          generateId(),
          id,
          title,
          item?.completed ? 1 : 0,
          Number.isInteger(item?.position) ? item.position : index,
        );
      });
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
