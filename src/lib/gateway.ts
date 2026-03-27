// Gateway API Client for Rook Dashboard
// Connects to OpenClaw Gateway on port 18789

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  status: 'active' | 'idle' | 'ready';
  workspace: string;
}

export interface Session {
  key: string;
  agentId: string;
  model: string;
  createdAt: string;
  lastActive: string;
  messageCount: number;
}

export interface SystemStats {
  cpu: number;
  memory: number;
  disk: string;
  uptime: string;
}

export interface TokenUsage {
  total: number;
  today: number;
  cost: number;
}

// Fetch wrapper with auth
async function gatewayFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${GATEWAY_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!res.ok) {
    throw new Error(`Gateway error: ${res.status}`);
  }
  
  return res.json();
}

// Agents API
export async function listAgents(): Promise<Agent[]> {
  return gatewayFetch('/api/agents');
}

export async function getAgentStatus(agentId: string): Promise<Agent> {
  return gatewayFetch(`/api/agents/${agentId}/status`);
}

// Sessions API
export async function listSessions(): Promise<Session[]> {
  return gatewayFetch('/api/sessions');
}

export async function getSessionHistory(sessionKey: string): Promise<any[]> {
  return gatewayFetch(`/api/sessions/${sessionKey}/history`);
}

// System API
export async function getSystemStats(): Promise<SystemStats> {
  return gatewayFetch('/api/system/stats');
}

export async function getTokenUsage(): Promise<TokenUsage> {
  return gatewayFetch('/api/metrics/token-usage');
}

// WebSocket for real-time updates
export function createGatewayWS(onMessage: (data: any) => void) {
  const ws = new WebSocket(`ws://localhost:18789/ws`);
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  return ws;
}
