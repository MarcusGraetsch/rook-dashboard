/**
 * Metrics API Route
 * 
 * Provides metrics data from the metrics-collector database
 * for the Ecology dashboard page.
 * 
 * GET /api/metrics
 *   - Returns summary of all metrics with source attribution
 * 
 * GET /api/metrics?category=ecological
 *   - Returns only ecological metrics
 * 
 * GET /api/metrics?sources=true
 *   - Returns source status information
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMetricsDb, getSources, getSourceStatus, getLatestMetricsByCategory } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get('category');
  const sources = searchParams.get('sources') === 'true';
  const provider = searchParams.get('provider');

  try {
    const db = getMetricsDb();
    
    if (!db) {
      // Database not available - return fallback static data
      return NextResponse.json({
        status: 'fallback',
        message: 'Metrics database not available. Run metrics-collector first.',
        fallback: true,
        data: getFallbackData()
      });
    }

    // Return source status
    if (sources) {
      const sourceStatus = getSourceStatus();
      const allSources = getSources();
      
      return NextResponse.json({
        status: 'ok',
        sources: allSources,
        summary: sourceStatus
      });
    }

    // Return metrics by category
    if (category) {
      const metrics = getLatestMetricsByCategory(category);
      return NextResponse.json({
        status: 'ok',
        category,
        count: metrics.length,
        metrics
      });
    }

    // Return all categories summary
    const ecological = getLatestMetricsByCategory('ecological');
    const social = getLatestMetricsByCategory('social');
    const supplyChain = getLatestMetricsByCategory('supply_chain');
    const sourceStatus = getSourceStatus();

    return NextResponse.json({
      status: 'ok',
      summary: {
        total_metrics: ecological.length + social.length + supplyChain.length,
        by_category: {
          ecological: ecological.length,
          social: social.length,
          supply_chain: supplyChain.length
        },
        sources: sourceStatus
      },
      metrics: {
        ecological,
        social,
        supply_chain: supplyChain
      }
    });

  } catch (error: any) {
    console.error('Metrics API error:', error);
    return NextResponse.json({
      status: 'error',
      message: error.message
    }, { status: 500 });
  }
}

/**
 * Fallback data when metrics database is not available
 * This provides basic ecological data based on research
 */
function getFallbackData() {
  return {
    ecological: [
      {
        id: 'fallback-eco-1',
        source_id: 'eco_liot',
        category: 'ecological',
        metric_type: 'co2_per_million_tokens',
        provider: 'OpenAI',
        model_id: 'gpt-4',
        value: 0.023,
        value_unit: 'gCO2',
        confidence: 'medium',
        source_note: 'Based on EcoLogits research (UC Riverside)',
        fetched_at: new Date().toISOString()
      },
      {
        id: 'fallback-eco-2',
        source_id: 'eco_liot',
        category: 'ecological',
        metric_type: 'energy_per_million_tokens',
        provider: 'OpenAI',
        model_id: 'gpt-4',
        value: 0.0007,
        value_unit: 'kWh',
        confidence: 'medium',
        source_note: 'Based on EcoLogits research (UC Riverside)',
        fetched_at: new Date().toISOString()
      }
    ],
    social: [
      {
        id: 'fallback-social-1',
        source_id: 'techpolicy',
        category: 'social',
        metric_type: 'ai_infrastructure_militarization',
        provider: 'Various',
        value: 3,
        value_unit: 'rating',
        confidence: 'low',
        source_note: 'Based on TechPolicy.Press research',
        fetched_at: new Date().toISOString()
      }
    ],
    supply_chain: [
      {
        id: 'fallback-sc-1',
        source_id: 'rmi',
        category: 'supply_chain',
        metric_type: 'conflict_minerals_risk_score',
        provider: 'Various',
        value: 45,
        value_unit: 'score',
        confidence: 'medium',
        source_note: 'Based on RMI Risk Readiness Assessment',
        fetched_at: new Date().toISOString()
      }
    ]
  };
}
