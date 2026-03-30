import { NextResponse } from 'next/server';
import { readHealthSnapshots, writeHealthSnapshots } from '@/lib/control/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    let snapshots = await readHealthSnapshots();

    if (snapshots.length === 0) {
      snapshots = await writeHealthSnapshots();
    }

    return NextResponse.json({
      status: 'ok',
      source: 'operations-health',
      snapshots,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        message: error.message,
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const snapshots = await writeHealthSnapshots();

    return NextResponse.json({
      status: 'ok',
      source: 'operations-health',
      snapshots,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        message: error.message,
      },
      { status: 500 },
    );
  }
}
