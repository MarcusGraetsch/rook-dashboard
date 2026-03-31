import { NextResponse } from 'next/server';
import { getGithubDiagnostics } from '@/lib/control/github-diagnostics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const diagnostics = await getGithubDiagnostics();

    return NextResponse.json({
      status: 'ok',
      source: 'gh-cli',
      ...diagnostics,
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
