// Gateway API Client for Rook Dashboard
// Connects to OpenClaw Gateway on port 18789

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

export interface Session {
  key: string;
  kind: string;
  channel: string;
  displayName: string;
  updatedAt: number;
  sessionId: string;
  model: string;
  contextTokens: number;
  totalTokens: number;
  lastChannel: string;
}

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  status: 'active' | 'idle' | 'ready';
  workspace: string;
  sandbox?: boolean;
  model?: string;
}

export interface SystemStats {
  cpu: number;
  memory: number;
  disk: string;
  uptime: string;
}

// Fetch wrapper with auth
async function gatewayInvoke(tool: string, args: Record<string, any> = {}): Promise<any> {
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

// Sessions API
export async function listSessions(): Promise<Session[]> {
  const result = await gatewayInvoke('sessions_list', { limit: 20 });
  // Parse the nested JSON string in content[0].text
  const sessionsData = JSON.parse(result.content[0].text);
  return sessionsData.sessions || [];
}

// Get session history
export async function getSessionHistory(sessionKey: string, limit: number = 50): Promise<any[]> {
  const result = await gatewayInvoke('sessions_history', { sessionKey, limit });
  const historyData = JSON.parse(result.content[0].text);
  return historyData.messages || [];
}

// System stats (via exec on host)
export async function getSystemStats(): Promise<SystemStats> {
  // These would come from exec tool or direct system queries
  return {
    cpu: 23, // Mock for now
    memory: 45,
    disk: '32GB / 1.2TB',
    uptime: '14 days',
  };
}

// Gateway info
export async function getGatewayInfo() {
  return {
    version: '2026.3.13',
    port: 18789,
    mode: 'local',
    authMode: 'token',
  };
}
