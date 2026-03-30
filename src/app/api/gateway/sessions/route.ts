import { NextResponse } from 'next/server';

// GET /api/gateway/sessions - Get sessions (placeholder)
export async function GET() {
  try {
    // Placeholder - sessions_list tool doesn't exist in gateway
    return NextResponse.json({
      error: 'Gateway tool sessions_list not available',
      sessions: [],
    }, { status: 503 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}