import { NextResponse } from 'next/server';
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
    const sessionsResult = await gatewayInvoke('sessions_list', { limit: 20 });
    const sessionsData = JSON.parse(sessionsResult.content[0].text);
    
    // Get agents from config
    const configPath = join(process.env.HOME || '/root', '.openclaw/openclaw.json');
    const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
    const agents = configData.agents?.list || [];
    
    // Map agents to display format
    const agentNames: Record<string, { name: string; emoji: string }> = {
      main: { name: 'Rook', emoji: '🦅' },
      consultant: { name: 'Consultant', emoji: '💼' },
      coach: { name: 'Coach', emoji: '🧠' },
      engineer: { name: 'Engineer', emoji: '🛠️' },
      researcher: { name: 'Researcher', emoji: '📚' },
      health: { name: 'Health', emoji: '💪' },
    };
    
    const mappedAgents = agents.map((agent: any) => ({
      id: agent.id,
      name: agentNames[agent.id]?.name || agent.name || agent.id,
      emoji: agentNames[agent.id]?.emoji || '🤖',
      workspace: agent.workspace || '',
      sandbox: !!agent.sandbox,
      model: agent.model || 'MiniMax-M2.7',
    }));
    
    return NextResponse.json({
      sessions: sessionsData.sessions || [],
      agents: mappedAgents,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
