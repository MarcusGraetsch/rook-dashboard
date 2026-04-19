import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const OPERATIONS_DIR =
  process.env.ROOK_OPERATIONS_DIR || '/root/.openclaw/workspace/operations';
const RUNTIME_ROOT = process.env.ROOK_RUNTIME_ROOT || '/root/.openclaw/runtime';
const RUNTIME_OPERATIONS_DIR =
  process.env.ROOK_RUNTIME_OPERATIONS_DIR || path.join(RUNTIME_ROOT, 'operations');
const TASKS_DIR = path.join(OPERATIONS_DIR, 'tasks');
const TASK_STATE_DIR = path.join(RUNTIME_OPERATIONS_DIR, 'task-state');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Request body required' }, { status: 400 });
    }

    const { task_id, project_id } = body;
    if (!task_id || !project_id) {
      return NextResponse.json({ error: 'task_id and project_id are required' }, { status: 400 });
    }

    // Read canonical task
    const canonicalPath = path.join(TASKS_DIR, project_id, `${task_id}.json`);
    let canonical: any;
    try {
      const raw = await fs.readFile(canonicalPath, 'utf8');
      canonical = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Canonical task not found' }, { status: 404 });
    }

    // Set status to done, clear claimed_by
    canonical.status = 'done';
    canonical.claimed_by = null;
    canonical.timestamps.completed_at = new Date().toISOString();
    canonical.timestamps.updated_at = new Date().toISOString();

    // Write updated canonical task
    await fs.writeFile(canonicalPath, `${JSON.stringify(canonical, null, 2)}\n`, 'utf8');

    // Delete runtime state file if it exists
    const runtimeStatePath = path.join(TASK_STATE_DIR, project_id, `${task_id}.json`);
    try {
      await fs.unlink(runtimeStatePath);
    } catch {
      // Runtime state file may not exist, that's ok
    }

    return NextResponse.json({
      status: 'ok',
      task_id,
      project_id,
      message: 'Task force-done successfully',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
