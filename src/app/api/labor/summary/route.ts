import { NextRequest, NextResponse } from 'next/server';
import { MetricResultSchema, type MetricResult } from '@/lib/labor/schemas';
import { getProviderMetricsSummary } from '@/lib/labor/metrics';

export const dynamic = 'force-dynamic';

interface ProviderMetrics {
  provider_id: string;
  metrics: MetricResult[];
}

interface LaborSummaryResponse {
  status: 'ok' | 'fallback' | 'error';
  summary?: {
    byProvider: ProviderMetrics[];
  };
  message?: string;
}

/**
 * Labor summary API
 * - Returns per-provider metrics: transparency, hidden labor exposure, source coverage
 */
export async function GET(_req: NextRequest) {
  try {
    const byProvider: ProviderMetrics[] = getProviderMetricsSummary().map((entry) => {
      const metrics = entry.metrics.map((m) => MetricResultSchema.parse(m));
      return {
        provider_id: entry.provider_id,
        metrics,
      };
    });

    const response: LaborSummaryResponse = {
      status: 'ok',
      summary: { byProvider },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Labor summary error:', error);
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 },
    );
  }
}
