import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const BACKUP_ROOT = '/root/backups/rook-runtime';
const LEGACY_BACKUP_ROOT = '/root/.openclaw/workspace/backups';

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

export interface BackupCollectionStatus {
  key: string;
  label: string;
  path: string;
  kind: 'runtime' | 'legacy';
  latest_entry: string | null;
  latest_entry_path: string | null;
  latest_entry_created_at: string | null;
  exists: boolean;
  notes: string | null;
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
  collections: BackupCollectionStatus[];
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
    ]);

    const values = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, line) => {
        const [key, ...rest] = line.split('=');
        acc[key] = rest.join('=').trim();
        return acc;
      }, {});

    return {
      active_state: values.ActiveState || null,
      sub_state: values.SubState || null,
      unit_file_state: values.UnitFileState || null,
      next_run_at: values.NextElapseUSecRealtime || null,
      last_trigger_at: values.LastTriggerUSec || null,
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

async function readCollectionStatus(
  key: string,
  label: string,
  collectionPath: string,
  kind: BackupCollectionStatus['kind'],
  notes: string | null
): Promise<BackupCollectionStatus> {
  try {
    const stat = await fs.stat(collectionPath);
    if (!stat.isDirectory()) {
      throw new Error('not a directory');
    }

    const entries = await fs.readdir(collectionPath, { withFileTypes: true });
    const candidates = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(collectionPath, entry.name);
        const entryStat = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          mtimeMs: entryStat.mtimeMs,
        };
      })
    );

    const latest = candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] || null;

    return {
      key,
      label,
      path: collectionPath,
      kind,
      latest_entry: latest?.name || null,
      latest_entry_path: latest?.path || null,
      latest_entry_created_at: latest ? new Date(latest.mtimeMs).toISOString() : null,
      exists: true,
      notes,
    };
  } catch {
    return {
      key,
      label,
      path: collectionPath,
      kind,
      latest_entry: null,
      latest_entry_path: null,
      latest_entry_created_at: null,
      exists: false,
      notes,
    };
  }
}

export async function getRuntimeBackupStatus(): Promise<RuntimeBackupStatus> {
  const [timer, latestSnapshot, runtimeCollection, legacyCollection] = await Promise.all([
    readTimerStatus(),
    readLatestSnapshot(),
    readCollectionStatus(
      'runtime',
      'Runtime Backup',
      BACKUP_ROOT,
      'runtime',
      'Operational backup set for dashboard state, canonical tasks, health snapshots, and dispatcher logs.'
    ),
    readCollectionStatus(
      'legacy_research',
      'Research / Working Notes Backup',
      LEGACY_BACKUP_ROOT,
      'legacy',
      'Legacy Google Drive backup path used by the older digital-research and working-notes backup script.'
    ),
  ]);

  return {
    timer,
    latest_snapshot: latestSnapshot,
    collections: [runtimeCollection, legacyCollection],
  };
}
