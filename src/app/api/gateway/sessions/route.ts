import { NextResponse } from 'next/server';
import { getDefaultModel, getIndexedAgents, getIndexedSessions } from '@/lib/control/session-index';

export async function GET() {
  try {
    const sessions = getIndexedSessions(100);
    return NextResponse.json({
      source: 'local-session-index',
      sessions,
      agents: getIndexedAgents(),
      defaultModel: getDefaultModel(sessions),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
