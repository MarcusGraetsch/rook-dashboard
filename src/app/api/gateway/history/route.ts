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

// GET /api/gateway/history - Get historical token usage data
export async function GET() {
  try {
    const sessionsResult = await gatewayInvoke('sessions_list', { limit: 100 });
    const sessionsData = JSON.parse(sessionsResult.content[0].text);
    const sessions = sessionsData.sessions || [];
    
    // Group tokens by day for the last 7 days
    const now = Date.now();
    const days: Record<string, { tokens: number; date: string }> = {};
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      days[key] = { tokens: 0, date: d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' }) };
    }
    
    sessions.forEach((session: any) => {
      const key = new Date(session.updatedAt).toISOString().split('T')[0];
      if (days[key]) {
        days[key].tokens += session.totalTokens || 0;
      }
    });
    
    const chartData = Object.values(days);
    const maxTokens = Math.max(...chartData.map(d => d.tokens), 1);
    
    return NextResponse.json({
      days: chartData,
      maxTokens,
      total: chartData.reduce((sum, d) => sum + d.tokens, 0),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
