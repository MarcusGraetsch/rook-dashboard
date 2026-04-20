import type Database from 'better-sqlite3';
import { getCanonicalTask } from '@/lib/control/tasks';
import { isWorkflowColumnName, normalizeKanbanName, WORKFLOW_COLUMNS } from '@/lib/control/kanban-workflow';

interface BoardRow {
  id: string;
  name: string;
}

interface ColumnRow {
  id: string;
  board_id: string;
  name: string;
  position: number;
}

interface TaskRow {
  id: string;
  title: string;
  canonical_task_id: string | null;
  project_id: string | null;
  sync_status: string | null;
  board_name: string;
  column_name: string;
}

function expectedWorkflowNames() {
  return WORKFLOW_COLUMNS.map((column) => column.name);
}

export async function collectKanbanIntegrityFindings(db: Database.Database) {
  const boards = db.prepare('SELECT id, name FROM boards ORDER BY name').all() as BoardRow[];
  const columns = db.prepare('SELECT id, board_id, name, position FROM columns ORDER BY board_id, position').all() as ColumnRow[];
  const tasks = db.prepare(`
    SELECT
      t.id,
      t.title,
      t.canonical_task_id,
      t.project_id,
      t.sync_status,
      b.name as board_name,
      c.name as column_name
    FROM tasks t
    JOIN columns c ON c.id = t.column_id
    JOIN boards b ON b.id = c.board_id
    WHERE t.archived_at IS NULL
    ORDER BY b.name, c.position, t.position
  `).all() as TaskRow[];

  const findings: Array<Record<string, unknown>> = [];
  const expectedNames = expectedWorkflowNames();

  for (const board of boards) {
    const boardColumns = columns.filter((column) => column.board_id === board.id);
    const normalizedCounts = new Map<string, number>();

    for (const column of boardColumns) {
      const normalized = normalizeKanbanName(column.name);
      normalizedCounts.set(normalized, (normalizedCounts.get(normalized) || 0) + 1);

      if (!isWorkflowColumnName(column.name)) {
        findings.push({
          source: 'dashboard_kanban_integrity',
          severity: 'warning',
          type: 'kanban_nonworkflow_column',
          board_id: board.id,
          board_name: board.name,
          column_id: column.id,
          column_name: column.name,
          position: column.position,
          details: `Board "${board.name}" contains non-workflow column "${column.name}".`,
        });
      }
    }

    for (const workflowName of expectedNames) {
      const normalized = normalizeKanbanName(workflowName);
      const count = normalizedCounts.get(normalized) || 0;

      if (count === 0) {
        findings.push({
          source: 'dashboard_kanban_integrity',
          severity: 'warning',
          type: 'kanban_missing_workflow_column',
          board_id: board.id,
          board_name: board.name,
          column_name: workflowName,
          details: `Board "${board.name}" is missing workflow column "${workflowName}".`,
        });
      } else if (count > 1) {
        findings.push({
          source: 'dashboard_kanban_integrity',
          severity: 'warning',
          type: 'kanban_duplicate_workflow_column',
          board_id: board.id,
          board_name: board.name,
          column_name: workflowName,
          count,
          details: `Board "${board.name}" contains ${count} copies of workflow column "${workflowName}".`,
        });
      }
    }
  }

  for (const task of tasks) {
    if (!task.canonical_task_id || !task.project_id) {
      findings.push({
        source: 'dashboard_kanban_integrity',
        severity: 'warning',
        type: 'kanban_task_missing_canonical_link',
        task_id: task.id,
        title: task.title,
        board_name: task.board_name,
        column_name: task.column_name,
        canonical_task_id: task.canonical_task_id,
        project_id: task.project_id,
        sync_status: task.sync_status,
        details: `Task "${task.title}" is missing canonical linkage metadata.`,
      });
      continue;
    }

    const canonicalTask = await getCanonicalTask(task.canonical_task_id, task.project_id);
    if (!canonicalTask) {
      findings.push({
        source: 'dashboard_kanban_integrity',
        severity: 'warning',
        type: 'kanban_task_missing_canonical_record',
        task_id: task.id,
        title: task.title,
        board_name: task.board_name,
        column_name: task.column_name,
        canonical_task_id: task.canonical_task_id,
        project_id: task.project_id,
        sync_status: task.sync_status,
        details: `Task "${task.title}" points to missing canonical task ${task.project_id}:${task.canonical_task_id}.`,
      });
    }
  }

  return {
    ok: findings.length === 0,
    checked_at: new Date().toISOString(),
    board_count: boards.length,
    active_task_count: tasks.length,
    warning_count: findings.length,
    findings,
  };
}
