import { NextRequest, NextResponse } from 'next/server';
import { getDefaultModel, getIndexedAgents, getIndexedSessions } from '@/lib/control/session-index';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    
    const sessions = getIndexedSessions(100, from, to);
    return NextResponse.json({
      source: 'local-session-index',
      sessions,
      agents: getIndexedAgents(),
      defaultModel: getDefaultModel(sessions),
      filter: from && to ? { from, to } : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
