import { NextRequest, NextResponse } from 'next/server';
import { getIndexedSessions } from '@/lib/control/session-index';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    
    const sessions = getIndexedSessions(500, from, to);
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    let totalTokens = 0;
    let todayTokens = 0;
    let weekTokens = 0;
    
    sessions.forEach((session) => {
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
    const sessionBreakdown = sessions.map((s) => ({
      name: s.displayName || s.key,
      tokens: s.totalTokens || 0,
      updatedAt: new Date(s.updatedAt).toISOString(),
      agent: s.agent,
      channel: s.lastChannel,
    })).sort((a, b) => b.tokens - a.tokens);
    
    return NextResponse.json({
      source: 'local-session-index',
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
