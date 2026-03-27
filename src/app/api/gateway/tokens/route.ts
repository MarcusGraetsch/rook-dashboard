import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '398e4457a0c2272f7f4a4559a8e80876479fe2f1ecdf2ee1';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:18789';

async function gatewayInvoke(tool: string, args: Record<string, any> = {}) {
  const res = await fetch(`${GATEWAY_URL}/tools/invoke`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tool, args }),
  });
  
  if (!res.ok) {
    throw new Error(`Gateway error: ${res.status}`);
  }
  
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error?.message || 'Unknown error');
  }
  
  return data.result;
}

export async function GET() {
  try {
    // Get sessions
    const sessionsResult = await gatewayInvoke('sessions_list', { limit: 50 });
    const sessionsData = JSON.parse(sessionsResult.content[0].text);
    const sessions = sessionsData.sessions || [];
    
    // Calculate token usage
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    let totalTokens = 0;
    let todayTokens = 0;
    let weekTokens = 0;
    
    sessions.forEach((session: any) => {
      const tokens = session.totalTokens || 0;
      totalTokens += tokens;
      
      if (session.updatedAt > dayAgo) {
        todayTokens += tokens;
      }
      if (session.updatedAt > weekAgo) {
        weekTokens += tokens;
      }
    });
    
    // Estimate cost (MiniMax pricing: $0.30/1M input, $1.20/1M output)
    // Assuming 30% input, 70% output ratio
    const estimatedCostToday = (todayTokens / 1_000_000) * (0.30 * 0.3 + 1.20 * 0.7);
    
    // Per-session breakdown
    const sessionBreakdown = sessions.map((s: any) => ({
      name: s.displayName || s.key,
      tokens: s.totalTokens || 0,
      updatedAt: new Date(s.updatedAt).toISOString(),
    })).sort((a: any, b: any) => b.tokens - a.tokens);
    
    return NextResponse.json({
      summary: {
        totalTokens,
        todayTokens,
        weekTokens,
        estimatedCostToday: estimatedCostToday.toFixed(4),
        sessionCount: sessions.length,
      },
      sessions: sessionBreakdown,
      period: {
        today: new Date(dayAgo).toISOString(),
        weekAgo: new Date(weekAgo).toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
