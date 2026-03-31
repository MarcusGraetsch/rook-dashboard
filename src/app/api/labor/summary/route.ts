import { NextRequest, NextResponse } from 'next/server';
import { MetricResultSchema, type MetricResult, type SocialMetrics } from '@/lib/labor/schemas';
import { getProviderMetricsSummary } from '@/lib/labor/metrics';
import { SOCIAL_METRICS } from '@/lib/labor/socialMetrics';

export const dynamic = 'force-dynamic';

interface ProviderMetrics {
  provider_id: string;
  metrics: MetricResult[];
  socialMetrics?: SocialMetrics;
}

interface LaborSummaryResponse {
  status: 'ok' | 'fallback' | 'error';
  summary?: {
    byProvider: ProviderMetrics[];
    social?: Record<string, SocialMetrics>;
  };
  message?: string;
}

/**
 * Labor summary API
 * - Returns per-provider metrics: transparency, hidden labor exposure, source coverage
 * - Also returns social metrics: labor rating, data ethics, colonialism index
 */
export async function GET(_req: NextRequest) {
  try {
    const byProvider: ProviderMetrics[] = getProviderMetricsSummary().map((entry) => {
      const metrics = entry.metrics.map((m) => MetricResultSchema.parse(m));
      const social = SOCIAL_METRICS[entry.provider_id] || null;
      return {
        provider_id: entry.provider_id,
        metrics,
        ...(social ? { socialMetrics: social } : {}),
      };
    });

    const response: LaborSummaryResponse = {
      status: 'ok',
      summary: { 
        byProvider,
        social: SOCIAL_METRICS,
      },
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