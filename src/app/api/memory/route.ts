import { NextResponse } from 'next/server';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const AGENTS = ['main', 'coach', 'engineer', 'researcher', 'health'];

// GET /api/memory - Get memory files for an agent
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get('agent') || 'main';
  const filePath = searchParams.get('path');

  if (!AGENTS.includes(agent)) {
    return NextResponse.json({ error: 'Invalid agent' }, { status: 400 });
  }

  try {
    const workspaceBase = '/root/.openclaw/workspace';
    const agentWorkspace = `${workspaceBase}-${agent}`;
    const memoryDir = join(agentWorkspace, 'memory');

    if (filePath) {
      // Return specific file
      const fullPath = join(agentWorkspace, filePath);
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, 'utf-8');
        return NextResponse.json({ content, path: filePath });
      }
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Return file list and MEMORY.md content
    const files: { path: string; size: string; modified: string }[] = [];

    // Read MEMORY.md
    const memoryPath = join(agentWorkspace, 'MEMORY.md');
    let memoryContent = '';
    if (existsSync(memoryPath)) {
      const stat = require('fs').statSync(memoryPath);
      files.push({
        path: 'MEMORY.md',
        size: formatBytes(stat.size),
        modified: stat.mtime.toISOString().split('T')[0],
      });
      memoryContent = readFileSync(memoryPath, 'utf-8');
    }

    // Read daily memory files
    if (existsSync(memoryDir)) {
      const dailyFiles = readdirSync(memoryDir)
        .filter(f => f.endsWith('.md') && /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
        .sort()
        .reverse();

      dailyFiles.forEach(file => {
        const fullPath = join(memoryDir, file);
        const stat = require('fs').statSync(fullPath);
        files.push({
          path: join('memory', file),
          size: formatBytes(stat.size),
          modified: stat.mtime.toISOString().split('T')[0],
        });
      });
    }

    return NextResponse.json({
      agent,
      files,
      memoryContent,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}