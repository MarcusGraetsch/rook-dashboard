# Session Review: dashboard-0050 slice 1

**Date:** 2026-06-01  
**Scope:** First implementation slice of the failed `dashboard-0050` task in `rook-dashboard`.

## Lagebild

The dashboard already had a canonical-task control plane, but its UI and API surface lagged behind the task-state model the runtime was using. The task system needed a richer workflow model, task detail state, and a clearer health snapshot for operators.

## Befunde

- The kanban workflow was still missing the `Review`, `Rework`, `Human Review`, and `Merging` stages.
- The control-plane task API only exposed the older read path and did not support filtering or updates for artifacts, parent/child links, or retry metadata.
- The kanban modal could not show proof-of-work artifacts or child task links.
- The agent health view did not surface retry queue depth or running-session counts.
- The health schema in `operations/schemas/health.schema.json` was stale relative to the runtime snapshot shape.

## Arbeitsplan

1. Extend the canonical task and workflow model.
2. Wire the control-plane task API to expose richer task state.
3. Surface artifact, retry, and child-task data in the kanban modal.
4. Surface the new health metrics in the agent overview.
5. Bring the health schema back in sync.
6. Validate with TypeScript and a production build.

## Umgesetzte Änderungen

- Updated `src/lib/control/kanban-workflow.ts` with the new workflow stages.
- Extended `src/lib/control/task-sync.ts` so the new task states map correctly.
- Extended `src/lib/control/tasks.ts` with canonical task filters plus artifact, retry, parent, and child-task metadata.
- Replaced `src/app/api/control/tasks/route.ts` with GET filtering and PATCH updates for status, artifacts, parent links, and retry resets.
- Updated `src/app/api/kanban/boards/route.ts` and `src/app/api/kanban/tasks/route.ts` to project the new canonical fields.
- Updated `src/components/kanban/KanbanBoard.tsx`, `src/components/kanban/KanbanCard.tsx`, `src/components/kanban/KanbanColumn.tsx`, and `src/components/kanban/TaskModal.tsx` to render the new workflow states and task details.
- Extended `src/lib/control/health.ts` and `src/app/agents/page.tsx` to surface retry queue depth and running-session counts.
- Updated `/root/.openclaw/workspace/operations/schemas/health.schema.json` to match the runtime health snapshot shape.

## Validierung

- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed.
- The build completed successfully with static generation and route compilation.

## Offene Risiken

- The new task-state model is broader than the old dashboard assumptions, so the remaining UI and operator workflows still need to be checked against live runtime behavior.
- The control-plane `tasks/registry` restore warning is still a separate unresolved issue.
- This is only the first dashboard-0050 slice, not the full task completion.

## Nächste Schritte

1. Continue with the remaining `dashboard-0050` work: task-state/source-of-truth cleanup, retry/lease policy, and operator-facing validation.
2. Tackle the persistent `tasks/registry` restore warning.
3. Expand the agent capability and approval-gate surfaces so dangerous actions are explicit.
