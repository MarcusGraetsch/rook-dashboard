import { NextResponse } from 'next/server';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

interface SessionEntry {
  name: string
  tokens: number
  updatedAt: string
  agent: string
  channel?: string
}

// Extract tokens from a JSONL file
function extractTokensFromJsonl(filePath: string): { tokens: number; updatedAt: number } {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    let totalTokens = 0;
    let lastUpdated = 0;
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        totalTokens += entry.totalTokens || entry.tokens || 0;
        if (entry.timestamp && entry.timestamp > lastUpdated) {
          lastUpdated = entry.timestamp;
        }
        if (entry.updatedAt && entry.updatedAt > lastUpdated) {
          lastUpdated = entry.updatedAt;
        }
      } catch {
        // Skip malformed lines
      }
    }
    
    return { tokens: totalTokens, updatedAt: lastUpdated };
  } catch {
    return { tokens: 0, updatedAt: 0 };
  }
}

// Get sessions from all agents
function getAllSessions(): { sessions: SessionEntry[]; totalTokens: number } {
  const agents = ['main', 'coach', 'engineer', 'researcher', 'health', 'consultant'];
  const sessions: SessionEntry[] = [];
  let totalTokens = 0;

  for (const agent of agents) {
    const sessionsDir = `/root/.openclaw/agents/${agent}/sessions`;
    try {
      const files = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
      
      for (const file of files) {
        const filePath = join(sessionsDir, file);
        const { tokens, updatedAt } = extractTokensFromJsonl(filePath);
        
        if (tokens > 0 || updatedAt > 0) {
          sessions.push({
            name: file.replace('.jsonl', '').substring(0, 20),
            tokens,
            updatedAt: new Date(updatedAt).toISOString(),
            agent,
          });
          totalTokens += tokens;
        }
      }
    } catch {
      // Agent might not have sessions dir
    }
  }

  return { sessions, totalTokens };
}

// GET /api/memory/tokens - Get token stats (alternative to gateway sessions_list)
export async function GET() {
  try {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const { sessions, totalTokens } = getAllSessions();
    
    // Calculate time-based stats
    let todayTokens = 0;
    let weekTokens = 0;
    
    sessions.forEach((session) => {
      const sessionTime = new Date(session.updatedAt).getTime();
      if (sessionTime > dayAgo) todayTokens += session.tokens;
      if (sessionTime > weekAgo) weekTokens += session.tokens;
    });
    
    // Estimate cost (MiniMax pricing: $0.30/1M input, $1.20/1M output)
    const estimatedCostToday = (todayTokens / 1_000_000) * (0.30 * 0.3 + 1.20 * 0.7);
    
    // Sort by tokens descending
    const sortedSessions = [...sessions].sort((a, b) => b.tokens - a.tokens);
    
    return NextResponse.json({
      summary: {
        totalTokens,
        todayTokens,
        weekTokens,
        estimatedCostToday: estimatedCostToday.toFixed(4),
        sessionCount: sessions.length,
      },
      sessions: sortedSessions,
      period: {
        today: new Date(dayAgo).toISOString(),
        weekAgo: new Date(weekAgo).toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}