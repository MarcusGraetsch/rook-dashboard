import { NextRequest, NextResponse } from 'next/server';
import { getCanonicalTasks } from '@/lib/control/tasks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const tasks = await getCanonicalTasks();
    return NextResponse.json(tasks);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
