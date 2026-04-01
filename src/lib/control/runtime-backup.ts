import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const BACKUP_ROOT = '/root/backups/rook-runtime';

export interface RuntimeBackupSnapshot {
  id: string;
  path: string;
  created_at: string;
  size: string | null;
  includes_dashboard_db: boolean;
  includes_task_archive: boolean;
  includes_runtime_archive: boolean;
  gdrive_remote: string | null;
}

export interface RuntimeBackupStatus {
  timer: {
    active_state: string | null;
    sub_state: string | null;
    unit_file_state: string | null;
    next_run_at: string | null;
    last_trigger_at: string | null;
  };
  latest_snapshot: RuntimeBackupSnapshot | null;
}

function parseManifest(input: string): Record<string, string> {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length > 0) {
        acc[key] = rest.join('=').trim();
      }
      return acc;
    }, {});
}

async function readLatestSnapshot(): Promise<RuntimeBackupSnapshot | null> {
  try {
    const entries = await fs.readdir(BACKUP_ROOT, { withFileTypes: true });
    const dirs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const snapshotPath = path.join(BACKUP_ROOT, entry.name);
          const stat = await fs.stat(snapshotPath);
          return {
            id: entry.name,
            path: snapshotPath,
            mtimeMs: stat.mtimeMs,
          };
        })
    );

    const latest = dirs.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    if (!latest) {
      return null;
    }

    const manifestPath = path.join(latest.path, 'manifests', 'backup-manifest.txt');
    const sizePath = path.join(latest.path, 'manifests', 'size.txt');
    const dashboardDbPath = path.join(latest.path, 'dashboard', 'kanban.db');
    const taskArchivePath = path.join(latest.path, 'operations', 'tasks.tar.gz');
    const runtimeArchivePath = path.join(latest.path, 'operations', 'runtime-state.tar.gz');

    const [manifestRaw, sizeRaw, dashboardDbStat, taskArchiveStat, runtimeArchiveStat] = await Promise.all([
      fs.readFile(manifestPath, 'utf8').catch(() => ''),
      fs.readFile(sizePath, 'utf8').catch(() => ''),
      fs.stat(dashboardDbPath).catch(() => null),
      fs.stat(taskArchivePath).catch(() => null),
      fs.stat(runtimeArchivePath).catch(() => null),
    ]);

    const manifest = parseManifest(manifestRaw);

    return {
      id: latest.id,
      path: latest.path,
      created_at: new Date(latest.mtimeMs).toISOString(),
      size: sizeRaw.trim() || null,
      includes_dashboard_db: Boolean(dashboardDbStat),
      includes_task_archive: Boolean(taskArchiveStat),
      includes_runtime_archive: Boolean(runtimeArchiveStat),
      gdrive_remote: manifest.gdrive_remote || null,
    };
  } catch {
    return null;
  }
}

async function readTimerStatus(): Promise<RuntimeBackupStatus['timer']> {
  try {
    const { stdout } = await execFileAsync('systemctl', [
      '--user',
      'show',
      'rook-runtime-backup.timer',
      '--property=ActiveState',
      '--property=SubState',
      '--property=UnitFileState',
      '--property=NextElapseUSecRealtime',
      '--property=LastTriggerUSec',
      '--value',
    ]);

    const [activeState, subState, unitFileState, nextRunAt, lastTriggerAt] = stdout
      .split('\n')
      .map((line) => line.trim());

    return {
      active_state: activeState || null,
      sub_state: subState || null,
      unit_file_state: unitFileState || null,
      next_run_at: nextRunAt || null,
      last_trigger_at: lastTriggerAt || null,
    };
  } catch {
    return {
      active_state: null,
      sub_state: null,
      unit_file_state: null,
      next_run_at: null,
      last_trigger_at: null,
    };
  }
}

export async function getRuntimeBackupStatus(): Promise<RuntimeBackupStatus> {
  const [timer, latestSnapshot] = await Promise.all([readTimerStatus(), readLatestSnapshot()]);

  return {
    timer,
    latest_snapshot: latestSnapshot,
  };
}
