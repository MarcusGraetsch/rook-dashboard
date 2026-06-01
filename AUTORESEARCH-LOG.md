# AUTORESEARCH LOG

## 2026-06-01

### Baseline

- Production build before changes completed successfully.
- Build wall time: `1m46.544s`
- Focus area from the monthly task: Kanban reliability and dashboard resource pressure.

### Changes Applied

- Stopped mutating `column.tasks` and `activeBoard.columns` during render by sorting copies instead of the live arrays.
- Added a fetch-in-flight guard to the Kanban board refresh loop so overlapping board fetches do not stack up.
- Paused the 5-second Kanban refresh when the tab is hidden, and resumed it on visibility changes.

### Validation

- Rebuilt the dashboard successfully after the change.
- Build wall time after changes: `3m0.180s`
- The build stayed green; the runtime fixes are focused on correctness and reduced background polling, not bundle shrinkage.

### Notes

- The in-place sort bug was a real reliability issue because render-time sorting mutated stateful arrays.
- The refresh guard and visibility gate reduce unnecessary request pressure on the dashboard and gateway while the Kanban view is idle or backgrounded.
