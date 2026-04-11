import { NextRequest, NextResponse } from 'next/server';
import { getDb, Task } from '@/lib/db';
import { getCanonicalTask, writeCanonicalTask } from '@/lib/control/tasks';
import {
  archiveKanbanTaskSync,
  autoSyncKanbanTaskToGithub,
  syncKanbanTaskToCanonical,
} from '@/lib/control/task-sync';
import { refineTaskDraft } from '@/lib/control/task-refinement';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
const DISPATCH_WRAPPER =
  process.env.ROOK_DISPATCH_WRAPPER || '/root/.openclaw/workspace/operations/bin/dispatch-canonical-task.mjs';
const AUTO_DISPATCH_READY = process.env.ROOK_AUTO_DISPATCH_READY !== '0';

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

type DispatchAttempt = {
  triggered: boolean;
  ok: boolean;
  accepted: boolean;
  status?: string | null;
  claimed_by?: string | null;
  assigned_agent?: string | null;
  reason?: string | null;
  stdout?: string | null;
  stderr?: string | null;
};

async function autoDispatchReadyTask(canonicalTaskId: string): Promise<DispatchAttempt> {
  if (!AUTO_DISPATCH_READY) {
    return { triggered: false, ok: true, accepted: false, reason: 'auto_dispatch_disabled' };
  }

  try {
    const child = spawn('node', [DISPATCH_WRAPPER, canonicalTaskId], {
      cwd: '/root/.openclaw/workspace',
      env: process.env,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return {
      triggered: true,
      ok: true,
      accepted: true,
      status: 'in_progress',
      claimed_by: 'dispatcher:unknown',
      assigned_agent: null,
      reason: null,
      stdout: null,
      stderr: null,
    };
  } catch (error: any) {
    return {
      triggered: true,
      ok: false,
      accepted: false,
      status: null,
      claimed_by: null,
      assigned_agent: null,
      reason: error instanceof Error ? error.message : 'dispatch_failed',
      stdout: null,
      stderr: null,
    };
  }
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

function getChecklistForTask(db: ReturnType<typeof getDb>, taskId: string) {
  return db
    .prepare(
      `
        SELECT title, completed, position
        FROM subtasks
        WHERE task_id = ?
        ORDER BY position
      `
    )
    .all(taskId)
    .map((item: any) => ({
      title: item.title,
      completed: Boolean(item.completed),
      position: item.position,
    }));
}

function attachChecklist<T extends { id: string }>(
  db: ReturnType<typeof getDb>,
  task: T | undefined
) {
  if (!task) {
    return task;
  }

  return {
    ...task,
    checklist: getChecklistForTask(db, task.id),
  };
}

function normalizeChecklistPayload(checklist: unknown) {
  if (!Array.isArray(checklist)) {
    return [];
  }

  return checklist
    .map((item, index) => {
      if (typeof item === 'string') {
        const title = item.trim();
        return title
          ? { title, completed: false, position: index }
          : null;
      }

      const title = String((item as any)?.title || '').trim();
      if (!title) {
        return null;
      }

      return {
        title,
        completed: Boolean((item as any)?.completed),
        position: Number.isInteger((item as any)?.position) ? (item as any).position : index,
      };
    })
    .filter((item): item is { title: string; completed: boolean; position: number } => Boolean(item));
}

async function ensureChecklistForRefinedTask(args: {
  checklist: unknown;
  title?: unknown;
  description?: unknown;
  intake_brief?: unknown;
  priority?: unknown;
  assignee?: unknown;
  labels?: unknown;
  project_id?: unknown;
  related_repo?: unknown;
  refinement_source?: unknown;
  refined_at?: unknown;
  refinement_summary?: unknown;
}) {
  const normalized = normalizeChecklistPayload(args.checklist);
  if (normalized.length > 0) {
    return normalized;
  }

  const hasRefinementMetadata = Boolean(
    String(args.refinement_source || '').trim()
      || String(args.refined_at || '').trim()
      || String(args.refinement_summary || '').trim()
  );

  if (!hasRefinementMetadata) {
    return normalized;
  }

  const refinement = await refineTaskDraft({
    title: String(args.title || '').trim() || null,
    description: String(args.description || '').trim() || null,
    intake_brief: String(args.intake_brief || '').trim() || null,
    project_id: String(args.project_id || '').trim() || null,
    related_repo: String(args.related_repo || '').trim() || null,
    priority: (String(args.priority || '').trim() || null) as any,
    assignee: String(args.assignee || '').trim() || null,
    labels: (() => {
      if (Array.isArray(args.labels)) {
        return args.labels.map((label) => String(label).trim()).filter(Boolean);
      }
      if (typeof args.labels === 'string' && args.labels.trim()) {
        try {
          const parsed = JSON.parse(args.labels);
          return Array.isArray(parsed) ? parsed.map((label) => String(label).trim()).filter(Boolean) : [];
        } catch {
          return [];
        }
      }
      return [];
    })(),
  });

  return normalizeChecklistPayload(refinement.checklist);
}

async function persistChecklistToCanonical(
  canonicalTaskId: string,
  projectId: string | null | undefined,
  checklist: Array<{ title: string; completed: boolean; position: number }>
) {
  const canonicalTask = await getCanonicalTask(canonicalTaskId, projectId);
  if (!canonicalTask) {
    return;
  }

  await writeCanonicalTask({
    ...canonicalTask,
    checklist,
    timestamps: {
      ...canonicalTask.timestamps,
      updated_at: new Date().toISOString(),
    },
  });
}

async function persistCanonicalMetadata(
  canonicalTaskId: string,
  projectId: string | null | undefined,
  updates: {
    handoff_notes?: string | null;
  }
) {
  const canonicalTask = await getCanonicalTask(canonicalTaskId, projectId);
  if (!canonicalTask) {
    return;
  }

  await writeCanonicalTask({
    ...canonicalTask,
    handoff_notes:
      updates.handoff_notes !== undefined
        ? String(updates.handoff_notes || '')
        : canonicalTask.handoff_notes || '',
    timestamps: {
      ...canonicalTask.timestamps,
      updated_at: new Date().toISOString(),
    },
  });
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

    return NextResponse.json(tasks.map((task: any) => attachChecklist(db, task)));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/kanban/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const {
      column_id,
      target_board_id,
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
      handoff_notes,
      project_id,
      related_repo,
      checklist,
      target_status,
      plan,
    } = await request.json();
    const id = generateId();
    
    const db = getDb();
    let effectiveColumnId = column_id;
    if (target_board_id) {
      const backlogColumn = resolveWorkflowColumn(db, target_board_id, 'backlog');
      if (!backlogColumn) {
        return NextResponse.json({ error: 'Target board backlog column not found.' }, { status: 400 });
      }
      effectiveColumnId = backlogColumn.id;
    }
    if (target_status) {
      const sourceColumn = getColumnRecord(db, column_id);
      const targetBoardId = target_board_id || sourceColumn?.board_id;
      const resolved = targetBoardId ? resolveWorkflowColumn(db, targetBoardId, target_status) : null;
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

    const effectiveChecklist = await ensureChecklistForRefinedTask({
      checklist,
      title,
      description,
      intake_brief,
      priority,
      assignee,
      labels,
      project_id,
      related_repo,
      refinement_source,
      refined_at,
      refinement_summary,
    });

    if (normalizeName(targetColumn.name) === 'ready') {
      const readyError = validateReadyRequirements(db, {
        intakeBrief: intake_brief,
        checklist: effectiveChecklist,
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
    
    const planJson = plan
      ? (typeof plan === 'string' ? plan : JSON.stringify(plan))
      : null;

    db.prepare(`
      INSERT INTO tasks (id, column_id, title, description, intake_brief, refinement_source, refinement_summary, refined_at, position, priority, labels, assignee, due_date, handoff_notes, project_id, related_repo, plan)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      handoff_notes || null,
      project_id || null,
      related_repo || null,
      planJson,
    );

    if (effectiveChecklist.length > 0) {
      const insertSubtask = db.prepare(
        'INSERT INTO subtasks (id, task_id, title, completed, position) VALUES (?, ?, ?, ?, ?)'
      );
      effectiveChecklist.forEach((item, index) => {
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
    await persistChecklistToCanonical(sync.canonicalTaskId, sync.projectId, effectiveChecklist);
    await persistCanonicalMetadata(sync.canonicalTaskId, sync.projectId, {
      handoff_notes: handoff_notes !== undefined ? handoff_notes : undefined,
    });
    try {
      await autoSyncKanbanTaskToGithub(db, sync.canonicalTaskId);
    } catch {
      // Canonical task is already saved; GitHub sync errors are persisted separately.
    }
    const dispatch =
      normalizeName(targetColumn.name) === 'ready'
        ? await autoDispatchReadyTask(sync.canonicalTaskId)
        : null;
    const task = attachChecklist(
      db,
      db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
    );

    return NextResponse.json({ ...(task || {}), sync, dispatch }, { status: 201 });
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
      target_board_id,
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
      handoff_notes,
      position,
      project_id,
      related_repo,
      checklist,
      target_status,
      plan,
    } = await request.json();

    const db = getDb();
    const currentTask = db.prepare(`
      SELECT t.id, t.column_id, c.board_id, c.name as column_name
      FROM tasks t
      JOIN columns c ON c.id = t.column_id
      WHERE t.id = ?
    `).get(id) as { id: string; column_id: string; board_id: string; column_name: string } | undefined;

    if (!currentTask) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    let effectiveColumnId = column_id;
    if (target_board_id) {
      const backlogColumn = resolveWorkflowColumn(db, target_board_id, 'backlog');
      if (!backlogColumn) {
        return NextResponse.json({ error: 'Target board backlog column not found.' }, { status: 400 });
      }
      effectiveColumnId = backlogColumn.id;
    }
    if (target_status) {
      const resolved = resolveWorkflowColumn(db, target_board_id || currentTask.board_id, target_status);
      if (!resolved) {
        return NextResponse.json({ error: `Workflow column missing for status "${target_status}".` }, { status: 400 });
      }
      effectiveColumnId = resolved.id;
    }

    const targetColumn = effectiveColumnId ? getColumnRecord(db, effectiveColumnId) : getColumnRecord(db, currentTask.column_id);
    if (!targetColumn) {
      return NextResponse.json({ error: 'Target column not found.' }, { status: 400 });
    }

    const effectiveChecklist = await ensureChecklistForRefinedTask({
      checklist,
      title,
      description,
      intake_brief,
      priority,
      assignee,
      labels,
      project_id,
      related_repo,
      refinement_source,
      refined_at,
      refinement_summary,
    });

    if (normalizeName(targetColumn.name) === 'ready') {
      const readyError = validateReadyRequirements(db, {
        taskId: id,
        intakeBrief: intake_brief,
        checklist: effectiveChecklist,
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
    if (handoff_notes !== undefined) {
      updates.push('handoff_notes = ?');
      values.push(handoff_notes);
    }
    if (project_id !== undefined) {
      updates.push('project_id = ?');
      values.push(project_id);
    }
    if (related_repo !== undefined) {
      updates.push('related_repo = ?');
      values.push(related_repo);
    }
    if (plan !== undefined) {
      updates.push('plan = ?');
      values.push(plan ? (typeof plan === 'string' ? plan : JSON.stringify(plan)) : null);
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

    if (Array.isArray(checklist) || effectiveChecklist.length > 0) {
      db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(id);
      const insertSubtask = db.prepare(
        'INSERT INTO subtasks (id, task_id, title, completed, position) VALUES (?, ?, ?, ?, ?)'
      );
      effectiveChecklist.forEach((item, index) => {
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
    await persistChecklistToCanonical(sync.canonicalTaskId, sync.projectId, effectiveChecklist);
    await persistCanonicalMetadata(sync.canonicalTaskId, sync.projectId, {
      handoff_notes: handoff_notes !== undefined ? handoff_notes : undefined,
    });
    try {
      await autoSyncKanbanTaskToGithub(db, sync.canonicalTaskId);
    } catch {
      // Canonical task is already saved; GitHub sync errors are persisted separately.
    }
    const movedIntoReady =
      normalizeName(currentTask.column_name) !== 'ready'
      && normalizeName(targetColumn.name) === 'ready';
    const dispatch = movedIntoReady ? await autoDispatchReadyTask(sync.canonicalTaskId) : null;
    const task = attachChecklist(
      db,
      db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
    );

    return NextResponse.json({ ...(task || {}), sync, dispatch });
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
