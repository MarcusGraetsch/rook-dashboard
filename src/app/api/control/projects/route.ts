import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const OPERATIONS_DIR =
  process.env.ROOK_OPERATIONS_DIR || '/root/.openclaw/workspace/operations';
const PROJECTS_FILE = path.join(OPERATIONS_DIR, 'projects', 'projects.json');

export async function GET() {
  try {
    const raw = await fs.readFile(PROJECTS_FILE, 'utf8');
    const projects = JSON.parse(raw);
    return NextResponse.json({ projects: Array.isArray(projects) ? projects : [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load projects.' },
      { status: 500 }
    );
  }
}
