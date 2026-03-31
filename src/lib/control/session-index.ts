import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface IndexedSession {
  key: string;
  sessionId: string;
  agent: string;
  displayName: string;
  model: string;
  totalTokens: number;
  contextTokens: number;
  updatedAt: number;
  lastChannel: string;
}

const AGENT_META: Record<string, { name: string; emoji: string; workspace: string; sandbox?: boolean }> = {
  rook: { name: 'Rook', emoji: '🦅', workspace: '/root/.openclaw/workspace' },
  main: { name: 'Main', emoji: '🦅', workspace: '/root/.openclaw/workspace' },
  coach: { name: 'Coach', emoji: '🧠', workspace: '/root/.openclaw/workspace-coach' },
  engineer: { name: 'Engineer', emoji: '🛠️', workspace: '/root/.openclaw/workspace-engineer', sandbox: true },
  researcher: { name: 'Researcher', emoji: '📚', workspace: '/root/.openclaw/workspace-researcher' },
  health: { name: 'Health', emoji: '💪', workspace: '/root/.openclaw/workspace-health' },
  consultant: { name: 'Consultant', emoji: '💼', workspace: '/root/.openclaw/workspace-consultant' },
};

function safeJsonParse(line: string): any | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function inferChannelFromText(text: string): string {
  if (text.includes('Conversation info') || text.includes('Sender (untrusted metadata)')) return 'telegram';
  if (text.startsWith('[cron:')) return 'cron';
  if (text.includes('discord')) return 'discord';
  return 'cli';
}

function inferDisplayName(agent: string, channel: string, sessionId: string): string {
  const meta = AGENT_META[agent] || { name: agent, emoji: '🤖', workspace: '' };
  return `${meta.emoji} ${meta.name} / ${channel} / ${sessionId.slice(0, 8)}`;
}

function readSessionFile(agent: string, filePath: string): IndexedSession | null {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;

  let sessionId = filePath.split('/').pop()?.replace(/\.jsonl$/, '') || 'unknown';
  let model = 'unknown';
  let totalTokens = 0;
  let contextTokens = 0;
  let updatedAt = 0;
  let lastChannel = 'cli';

  for (const line of lines) {
    const entry = safeJsonParse(line);
    if (!entry) continue;

    const timestampValue = typeof entry.timestamp === 'string'
      ? new Date(entry.timestamp).getTime()
      : typeof entry.timestamp === 'number'
        ? entry.timestamp
        : 0;
    if (timestampValue > updatedAt) updatedAt = timestampValue;

    if (entry.type === 'session' && entry.id) {
      sessionId = entry.id;
    }

    if (entry.type === 'model_change' && entry.modelId) {
      model = entry.modelId;
    }

    if (entry.type === 'message') {
      const usage = entry.message?.usage;
      if (usage?.totalTokens) totalTokens += usage.totalTokens;
      if (usage?.input) contextTokens += usage.input;

      const contents = entry.message?.content;
      if (Array.isArray(contents)) {
        const textParts = contents
          .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string')
          .map((part: any) => part.text)
          .join('\n');
        if (textParts) {
          lastChannel = inferChannelFromText(textParts);
        }
      }
    }

    if (typeof entry.totalTokens === 'number') totalTokens += entry.totalTokens;
    if (typeof entry.contextTokens === 'number') contextTokens += entry.contextTokens;
    if (typeof entry.updatedAt === 'number' && entry.updatedAt > updatedAt) updatedAt = entry.updatedAt;
  }

  return {
    key: `${agent}:${sessionId}`,
    sessionId,
    agent,
    displayName: inferDisplayName(agent, lastChannel, sessionId),
    model,
    totalTokens,
    contextTokens,
    updatedAt,
    lastChannel,
  };
}

export function getIndexedSessions(limit = 100, from?: string | null, to?: string | null): IndexedSession[] {
  const sessions: IndexedSession[] = [];
  const fromTime = from ? new Date(from).getTime() : 0;
  const toTime = to ? new Date(to).getTime() : Date.now();

  for (const agent of Object.keys(AGENT_META)) {
    const dir = `/root/.openclaw/agents/${agent}/sessions`;
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir)
      .filter((file) => file.endsWith('.jsonl'))
      .map((file) => join(dir, file));

    for (const filePath of files) {
      const session = readSessionFile(agent, filePath);
      if (session) sessions.push(session);
    }
  }

  return sessions
    .filter(s => s.updatedAt >= fromTime && s.updatedAt <= toTime)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export function getIndexedAgents() {
  return Object.entries(AGENT_META)
    .filter(([id]) => id !== 'main')
    .map(([id, meta]) => ({
      id,
      name: meta.name,
      emoji: meta.emoji,
      workspace: meta.workspace,
      sandbox: meta.sandbox,
    }));
}

export function getDefaultModel(sessions: IndexedSession[]): string {
  return sessions.find((session) => session.model && session.model !== 'unknown')?.model || 'MiniMax-M2.5';
}

export function getTokenHistory(days = 7) {
  const sessions = getIndexedSessions(500);
  const byDay = new Map<string, number>();
  const now = new Date();

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    byDay.set(key, 0);
  }

  for (const session of sessions) {
    const dayKey = new Date(session.updatedAt).toISOString().slice(0, 10);
    if (byDay.has(dayKey)) {
      byDay.set(dayKey, (byDay.get(dayKey) || 0) + session.totalTokens);
    }
  }

  const values = Array.from(byDay.entries()).map(([date, tokens]) => ({ date, tokens }));
  const maxTokens = values.reduce((max, entry) => Math.max(max, entry.tokens), 0);
  const total = values.reduce((sum, entry) => sum + entry.tokens, 0);

  return { days: values, maxTokens, total };
}

