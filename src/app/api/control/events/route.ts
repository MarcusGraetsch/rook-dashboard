import { spawn } from 'child_process';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EVENT_SUMMARY_SCRIPT = '/root/.openclaw/workspace/operations/bin/summarize-events.mjs';

function runEventSummary(): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [EVENT_SUMMARY_SCRIPT], {
      cwd: '/root/.openclaw/workspace',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      if ((code ?? 1) !== 0) {
        reject(new Error(stderr.trim() || `event summary exited with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || '{}'));
      } catch (error: any) {
        reject(new Error(stderr || error?.message || 'Failed to parse event summary output'));
      }
    });
    child.on('error', reject);
  });
}

export async function GET() {
  try {
    const events = await runEventSummary();

    return NextResponse.json({
      status: 'ok',
      source: 'operations-event-ledger',
      events,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
