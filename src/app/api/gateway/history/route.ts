import { NextResponse } from 'next/server';

// GET /api/gateway/history - Get historical token usage data
export async function GET() {
  try {
    // Placeholder - sessions_list tool doesn't exist in gateway
    return NextResponse.json({
      error: 'Gateway tool sessions_list not available',
      days: [],
      maxTokens: 0,
      total: 0,
    }, { status: 503 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}