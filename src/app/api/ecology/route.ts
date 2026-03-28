import { NextResponse } from 'next/server';
import { calculateEcologicalImpact, MODEL_ECOLOGY, MODEL_SOCIAL } from '@/lib/ecology';

const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '398e4457a0c2272f7f4a4559a8e80876479fe2f1ecdf2ee1';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:18789';

async function gatewayInvoke(tool: string, args: Record<string, any> = {}) {
  const res = await fetch(`${GATEWAY_URL}/tools/invoke`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tool, args }),
  });
  
  if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message || 'Unknown error');
  return data.result;
}

// GET /api/ecology - Get ecological impact for all sessions
export async function GET() {
  try {
    // Get sessions with token data
    const sessionsResult = await gatewayInvoke('sessions_list', { limit: 100 });
    const sessionsData = JSON.parse(sessionsResult.content[0].text);
    const sessions = sessionsData.sessions || [];

    // Calculate impact per model
    const modelImpacts: Record<string, {
      modelId: string
      sessions: number
      totalTokens: number
      energyKwh: number
      co2G: number
      waterMl: number
      hardwareManufacturingCo2G: number
      totalCo2G: number
    }> = {}

    let totalEnergy = 0
    let totalCo2 = 0
    let totalWater = 0
    let totalHardwareCo2 = 0
    let totalCo2All = 0

    sessions.forEach((session: any) => {
      const modelId = session.model || 'unknown'
      const inputTokens = session.contextTokens || 0
      const outputTokens = (session.totalTokens || 0) - inputTokens

      const impact = calculateEcologicalImpact(modelId, inputTokens, outputTokens)

      if (!modelImpacts[modelId]) {
        modelImpacts[modelId] = {
          modelId,
          sessions: 0,
          totalTokens: 0,
          energyKwh: 0,
          co2G: 0,
          waterMl: 0,
          hardwareManufacturingCo2G: 0,
          totalCo2G: 0,
        }
      }

      modelImpacts[modelId].sessions++
      modelImpacts[modelId].totalTokens += session.totalTokens || 0
      modelImpacts[modelId].energyKwh += impact.energyKwh
      modelImpacts[modelId].co2G += impact.co2G
      modelImpacts[modelId].waterMl += impact.waterMl
      modelImpacts[modelId].hardwareManufacturingCo2G += impact.hardwareManufacturingCo2G
      modelImpacts[modelId].totalCo2G += impact.totalCo2G

      totalEnergy += impact.energyKwh
      totalCo2 += impact.co2G
      totalWater += impact.waterMl
      totalHardwareCo2 += impact.hardwareManufacturingCo2G
      totalCo2All += impact.totalCo2G
    })

    // CO2 equivalents for context
    const co2Descriptions: Record<string, string> = {
      '10': '≈ 50km Auto fahren',
      '50': '≈ 250km Auto fahren',
      '100': '≈ 500km Auto fahren',
      '500': '≈ 2500km Auto fahren (Berlin → Lissabon)',
      '1000': '≈ 5000km Flug (Berlin → Kapstadt)',
    }

    // Find closest description
    const getCo2Description = (g: number): string => {
      const keys = Object.keys(co2Descriptions).map(Number).sort((a, b) => a - b)
      for (const k of keys) {
        if (g <= k) return co2Descriptions[String(k)]
      }
      return '≈ ' + (g / 1000).toFixed(1) + 't CO₂'
    }

    return NextResponse.json({
      summary: {
        totalEnergyKwh: totalEnergy,
        totalCo2G: totalCo2,
        totalWaterMl: totalWater,
        totalHardwareCo2G: totalHardwareCo2,
        totalCo2AllG: totalCo2All,
        co2EquivalentDescription: getCo2Description(totalCo2All),
        sessionCount: sessions.length,
      },
      byModel: Object.values(modelImpacts),
      availableModels: Object.keys(MODEL_ECOLOGY),
      socialMetrics: MODEL_SOCIAL,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
