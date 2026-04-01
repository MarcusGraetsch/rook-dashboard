import { NextResponse } from 'next/server';
import { getRuntimeBackupStatus } from '@/lib/control/runtime-backup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const backup = await getRuntimeBackupStatus();

    return NextResponse.json({
      status: 'ok',
      source: 'runtime-backup',
      backup,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
