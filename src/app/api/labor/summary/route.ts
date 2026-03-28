import { NextRequest, NextResponse } from 'next/server';
import { PROVIDER_RISK_PROFILES } from '@/lib/labor/riskMapping';
import { MetricResultSchema, type MetricResult } from '@/lib/labor/schemas';

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
 * First version:
 * - Computes a Transparency Risk Score per provider
 * - Explicitly marked as exposure/proxy, not exact.
 */
export async function GET(_req: NextRequest) {
  try {
    const now = new Date().toISOString();

    const byProvider: ProviderMetrics[] = PROVIDER_RISK_PROFILES.map((profile) => {
      const metric: MetricResult = {
        metric_id: 'transparency_risk_score_v1',
        value: profile.transparency_score,
        label: mapTransparencyLabel(profile.transparency_score),
        unit: 'index_0_100',
        category: 'transparency',
        confidence: profile.confidence,
        exposure: true,
        from: '',
        to: now,
        methodology_version: profile.methodology_version,
        sources: profile.sources,
        calculated_at: now,
      };

      const parsed = MetricResultSchema.parse(metric);

      return {
        provider_id: profile.provider_id,
        metrics: [parsed],
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

function mapTransparencyLabel(score: number): string {
  if (score <= 25) return 'comparatively transparent';
  if (score <= 50) return 'mixed visibility';
  if (score <= 75) return 'opaque';
  return 'highly opaque';
}
