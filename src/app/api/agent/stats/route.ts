import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
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
  
  if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message || 'Unknown error');
  return data.result;
}

// GET /api/agent/stats?agent=xxx
// Returns compact stats for a specific agent
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent');
    
    // Get all sessions
    const sessionsResult = await gatewayInvoke('sessions_list', { limit: 50 });
    const sessionsData = JSON.parse(sessionsResult.content[0].text);
    const allSessions = sessionsData.sessions || [];
    
    if (agentId) {
      // Filter for specific agent
      const agentSessions = allSessions.filter((s: any) => 
        s.key.includes(`:${agentId}:`)
      );
      
      const totalTokens = agentSessions.reduce((sum: number, s: any) => sum + (s.totalTokens || 0), 0);
      const lastActivity = agentSessions.length > 0 
        ? Math.max(...agentSessions.map((s: any) => s.updatedAt))
        : null;
      
      return NextResponse.json({
        agentId,
        sessions: agentSessions.length,
        totalTokens,
        lastActivity,
        lastActivityAge: lastActivity ? Date.now() - lastActivity : null,
      });
    }
    
    // Return all agents summary
    const agentIds = ['main', 'consultant', 'coach', 'engineer', 'researcher', 'health'];
    const summary = agentIds.map(id => {
      const agentSessions = allSessions.filter((s: any) => s.key.includes(`:${id}:`));
      const totalTokens = agentSessions.reduce((sum: number, s: any) => sum + (s.totalTokens || 0), 0);
      const lastActivity = agentSessions.length > 0 
        ? Math.max(...agentSessions.map((s: any) => s.updatedAt))
        : null;
      
      return { id, sessions: agentSessions.length, totalTokens, lastActivity };
    });
    
    return NextResponse.json({ agents: summary });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
