import { NextRequest, NextResponse } from 'next/server';
import { getTrackedAgentIds, readHealthSnapshots, writeHealthSnapshots } from '@/lib/control/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent');

    let snapshots = await readHealthSnapshots();
    if (snapshots.length === 0) {
      snapshots = await writeHealthSnapshots();
    }

    if (agentId) {
      const snapshot = snapshots.find((item) => item.agent_id === agentId);
      if (!snapshot) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }

      const lastActivity = snapshot.runtime.latest_session_update_at
        ? new Date(snapshot.runtime.latest_session_update_at).getTime()
        : null;

      return NextResponse.json({
        agentId: snapshot.agent_id,
        sessions: snapshot.runtime.session_count,
        totalTokens: null,
        lastActivity,
        lastActivityAge: lastActivity ? Date.now() - lastActivity : null,
        healthStatus: snapshot.status,
        currentTaskId: snapshot.current_task_id,
        queueDepth: snapshot.queue_depth,
        lastError: snapshot.last_error,
        lastCompletedTask: snapshot.last_completed_task,
      });
    }

    const trackedAgents = getTrackedAgentIds();
    const summary = trackedAgents.map((id) => {
      const snapshot = snapshots.find((item) => item.agent_id === id);
      const lastActivity = snapshot?.runtime.latest_session_update_at
        ? new Date(snapshot.runtime.latest_session_update_at).getTime()
        : null;

      return {
        id,
        sessions: snapshot?.runtime.session_count || 0,
        totalTokens: null,
        lastActivity,
        healthStatus: snapshot?.status || 'offline',
        currentTaskId: snapshot?.current_task_id || null,
        queueDepth: snapshot?.queue_depth || 0,
        lastError: snapshot?.last_error || null,
        lastCompletedTask: snapshot?.last_completed_task || null,
      };
    });

    return NextResponse.json({ agents: summary, source: 'operations-health' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
