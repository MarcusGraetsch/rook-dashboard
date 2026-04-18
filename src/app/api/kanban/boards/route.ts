import { NextRequest, NextResponse } from 'next/server';
import { getDb, Board, Column, Task } from '@/lib/db';
import { reconcileKanbanProjectionFromCanonical } from '@/lib/control/task-sync';
import { getCanonicalTask } from '@/lib/control/tasks';
import { randomUUID } from 'crypto';

function generateId() {
  return randomUUID();
}

const WORKFLOW_COLUMNS = [
  { name: 'Backlog', color: '#52525b' },
  { name: 'Intake', color: '#1d4ed8' },
  { name: 'Ready', color: '#0f766e' },
  { name: 'In Progress', color: '#3b82f6' },
  { name: 'Testing', color: '#7c3aed' },
  { name: 'Review', color: '#c2410c' },
  { name: 'Blocked', color: '#b91c1c' },
  { name: 'Done', color: '#22c55e' },
];

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeTestStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'pass') return 'passed';
  if (normalized === 'passed' || normalized === 'failed') return normalized;
  return null;
}

function normalizeReviewVerdict(verdict: string | null | undefined) {
  const normalized = String(verdict || '').trim().toLowerCase();
  if (normalized === 'pass') return 'approved';
  if (normalized === 'approved' || normalized === 'changes_requested') return normalized;
  return null;
}

interface ChecklistItem {
  task_id: string;
  title: string;
  completed: number;
  position: number;
}

function ensureWorkflowColumns(db: ReturnType<typeof getDb>, boardId: string) {
  const existing = db
    .prepare('SELECT id, name, position FROM columns WHERE board_id = ? ORDER BY position')
    .all(boardId) as Array<{ id: string; name: string; position: number }>;

  const existingNames = new Set(existing.map((column) => normalizeName(column.name)));
  const insertColumn = db.prepare(
    'INSERT INTO columns (id, board_id, name, position, color) VALUES (?, ?, ?, ?, ?)'
  );

  let nextPosition = existing.length;
  for (const column of WORKFLOW_COLUMNS) {
    if (existingNames.has(normalizeName(column.name))) {
      continue;
    }
    insertColumn.run(generateId(), boardId, column.name, nextPosition, column.color);
    nextPosition += 1;
  }
}

// GET /api/kanban/boards - List all boards with columns and tasks
export async function GET() {
  try {
    const db = getDb();
    const boards = db.prepare('SELECT * FROM boards ORDER BY created_at DESC').all() as Board[];
    for (const board of boards) {
      ensureWorkflowColumns(db, board.id);
    }
    await reconcileKanbanProjectionFromCanonical(db);
    const columns = db.prepare('SELECT * FROM columns ORDER BY position').all() as Column[];
    // Include subtask counts for token-efficient card display
    const tasks = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM subtasks WHERE task_id = t.id) as subtask_count,
        (SELECT COUNT(*) FROM subtasks WHERE task_id = t.id AND completed = 1) as subtask_done
      FROM tasks t
      WHERE t.archived_at IS NULL
      ORDER BY t.position
    `).all() as any[];
    const checklistRows = db.prepare(
      `
        SELECT task_id, title, completed, position
        FROM subtasks
        ORDER BY task_id, position
      `
    ).all() as ChecklistItem[];
    const checklistByTaskId = new Map<string, Array<{ title: string; completed: boolean; position: number }>>();

    checklistRows.forEach((item) => {
      const existing = checklistByTaskId.get(item.task_id) || [];
      existing.push({
        title: item.title,
        completed: Boolean(item.completed),
        position: item.position,
      });
      checklistByTaskId.set(item.task_id, existing);
    });

    const taskRefs = Array.from(
      new Set(
        tasks
          .map((task: any) =>
            task.canonical_task_id && task.project_id
              ? `${task.project_id}:${task.canonical_task_id}`
              : null
          )
          .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
      )
    );
    const canonicalEntries = await Promise.all(
      taskRefs.map(async (taskRef) => {
        const [projectId, taskId] = taskRef.split(':', 2);
        return [taskRef, await getCanonicalTask(taskId, projectId)] as const;
      })
    );
    const canonicalById = new Map(canonicalEntries);
    
    // Group by board
    const result = boards.map((board: Board) => ({
      ...board,
      columns: columns
        .filter((col: Column) => col.board_id === board.id)
        .map((col: Column) => ({
          ...col,
          tasks: tasks.filter((task: any) => task.column_id === col.id).map((task: any) => {
            const canonicalKey = task.canonical_task_id && task.project_id
              ? `${task.project_id}:${task.canonical_task_id}`
              : null;
            const canonical = canonicalKey ? canonicalById.get(canonicalKey) : null;
            const claimedBy = canonical?.claimed_by || null;
            const currentWorker = claimedBy?.startsWith('dispatcher:')
              ? claimedBy.replace(/^dispatcher:/, '')
              : null;
            const pipelineState = claimedBy
              ? 'running'
              : canonical?.status && ['done', 'blocked'].includes(canonical.status)
                ? canonical.status
                : 'idle';
            const blockedReason = canonical?.blocked_reason || null;
            const failureReason = canonical?.failure_reason || null;
            const isDoneLike = pipelineState === 'done' || canonical?.status === 'done' || col.name.toLowerCase() === 'done';
            const prState = canonical?.github_pull_request?.state || null;
            const prNumber = canonical?.github_pull_request?.number || null;
            const cardWarning = failureReason || blockedReason
              ? (failureReason || blockedReason)
              : isDoneLike && prState !== 'merged'
                ? prNumber
                  ? `Done, but PR #${prNumber} is ${prState || 'missing state'}.`
                  : 'Done, but PR metadata is missing.'
                : null;

            return {
              id: task.id,
              column_id: task.column_id,
              title: task.title,
              description: task.description,
              intake_brief: task.intake_brief,
              refinement_source: task.refinement_source,
              refinement_summary: task.refinement_summary,
              refined_at: task.refined_at,
              checklist: checklistByTaskId.get(task.id) || [],
              position: task.position,
              priority: task.priority,
              labels: task.labels,
              assignee: task.assignee,
              due_date: task.due_date,
              column_name: col.name,
              canonical_task_id: task.canonical_task_id,
              project_id: task.project_id,
              related_repo: task.related_repo,
              github_issue_number: task.github_issue_number,
              github_issue_url: task.github_issue_url,
              sync_status: task.sync_status,
              sync_error: task.sync_error,
              created_at: task.created_at,
              updated_at: task.updated_at,
              subtask_count: task.subtask_count || 0,
              subtask_done: task.subtask_done || 0,
              canonical_status: canonical?.status || null,
              canonical_assigned_agent: canonical?.assigned_agent || null,
              commit_count: Array.isArray(canonical?.commits) ? canonical.commits.length : 0,
              pr_state: prState,
              pr_number: prNumber,
              test_status: normalizeTestStatus(canonical?.test_evidence?.status),
              test_commands: canonical?.test_evidence?.commands || [],
              test_summary: canonical?.test_evidence?.summary || null,
              review_verdict: normalizeReviewVerdict(canonical?.review_evidence?.verdict),
              review_summary: canonical?.review_evidence?.summary || null,
              has_handoff_notes: Boolean(task.handoff_notes || canonical?.handoff_notes),
              handoff_notes: task.handoff_notes || canonical?.handoff_notes || null,
              blocked_reason: blockedReason,
              failure_reason: failureReason,
              card_warning: cardWarning,
              claimed_by: claimedBy,
              current_worker: currentWorker,
              pipeline_state: pipelineState,
              last_heartbeat: canonical?.last_heartbeat || null,
            };
          })
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
    const defaultColumns = WORKFLOW_COLUMNS.map((column, position) => ({
      ...column,
      position,
    }));
    
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
