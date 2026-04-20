export const WORKFLOW_COLUMNS = [
  { name: 'Backlog', color: '#52525b' },
  { name: 'Intake', color: '#1d4ed8' },
  { name: 'Ready', color: '#0f766e' },
  { name: 'In Progress', color: '#3b82f6' },
  { name: 'Testing', color: '#7c3aed' },
  { name: 'Review', color: '#c2410c' },
  { name: 'Blocked', color: '#b91c1c' },
  { name: 'Done', color: '#22c55e' },
] as const;

export function normalizeKanbanName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isWorkflowColumnName(value: string | null | undefined) {
  const normalized = normalizeKanbanName(String(value || ''));
  return WORKFLOW_COLUMNS.some((column) => normalizeKanbanName(column.name) === normalized);
}

export function workflowColumnPosition(name: string) {
  const normalized = normalizeKanbanName(name);
  return WORKFLOW_COLUMNS.findIndex((column) => normalizeKanbanName(column.name) === normalized);
}
