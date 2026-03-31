import { NextResponse } from 'next/server';
import { getTokenHistory } from '@/lib/control/session-index';

export async function GET() {
  try {
    return NextResponse.json(getTokenHistory(7));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
