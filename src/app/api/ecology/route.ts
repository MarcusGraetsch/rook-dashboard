import { NextResponse } from 'next/server';
import { calculateEcologicalImpact, MODEL_ECOLOGY, MODEL_SOCIAL } from '@/lib/ecology';
import * as fs from 'fs';
import * as path from 'path';

const AGENTS_DIR = process.env.AGENTS_DIR || '/root/.openclaw/agents';

// Read session data from local agent session files
async function getLocalSessions(): Promise<any[]> {
  const sessions: any[] = [];
  const agentsDir = AGENTS_DIR;
  
  try {
    const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());
    
    for (const agentDir of agentDirs) {
      const sessionsFile = path.join(agentsDir, agentDir.name, 'sessions', 'sessions.json');
      if (fs.existsSync(sessionsFile)) {
        try {
          const content = fs.readFileSync(sessionsFile, 'utf-8');
          const data = JSON.parse(content);
          
          // Extract sessions from the sessions.json format
          Object.values(data).forEach((session: any) => {
            if (session.sessionId && session.model) {
              sessions.push({
                sessionId: session.sessionId,
                model: session.model,
                modelProvider: session.modelProvider,
                contextTokens: session.contextTokens || 0,
                inputTokens: session.inputTokens || 0,
                outputTokens: session.outputTokens || 0,
                totalTokens: session.totalTokens || 0,
                label: session.label || '',
              });
            }
          });
        } catch (e) {
          // Skip malformed files
        }
      }
    }
  } catch (e) {
    console.error('Error reading agent sessions:', e);
  }
  
  return sessions;
}

// Get infrastructure metrics from the system
async function getInfrastructureMetrics(): Promise<{
  cpuHours: number;
  memoryGbHours: number;
  diskGbRead: number;
  diskGbWrite: number;
  networkMb: number;
}> {
  // Estimate based on system uptime and average resource usage
  // In a production system, this would come from actual monitoring (Prometheus, etc.)
  
  try {
    // Read uptime
    const uptime = fs.readFileSync('/proc/uptime', 'utf-8');
    const uptimeSeconds = parseFloat(uptime.split(' ')[0]);
    const uptimeHours = uptimeSeconds / 3600;
    
    // Estimate: 2 vCPUs average at ~20% utilization
    const cpuHours = uptimeHours * 2 * 0.2;
    
    // Estimate: ~2GB RAM average
    const memoryGbHours = uptimeHours * 2;
    
    // Estimate: minimal disk I/O for a containerized agent system
    const diskGbRead = uptimeHours * 0.1;
    const diskGbWrite = uptimeHours * 0.05;
    
    // Estimate: ~50MB/hour for API calls, logs, etc.
    const networkMb = uptimeHours * 50;
    
    return { cpuHours, memoryGbHours, diskGbRead, diskGbWrite, networkMb };
  } catch (e) {
    // Fallback for non-Linux systems
    return { cpuHours: 0, memoryGbHours: 0, diskGbRead: 0, diskGbWrite: 0, networkMb: 0 };
  }
}

// Calculate infrastructure carbon footprint
function calculateInfrastructureImpact(cpuHours: number, memoryGbHours: number, networkMb: number) {
  // Estimates based on recent studies (Ko et al., 2023; Ligo Sustainable AI)
  // CPU: ~0.05 kWh per core-hour (average server CPU)
  // Memory: ~0.005 kWh per GB-hour
  // Network: ~0.001 kWh per MB transferred
  
  const cpuKwh = cpuHours * 0.05;
  const memoryKwh = memoryGbHours * 0.005;
  const networkKwh = (networkMb / 1024) * 0.001;
  
  const totalKwh = cpuKwh + memoryKwh + networkKwh;
  
  // Average grid emission: ~400 gCO2/kWh (global average)
  // For Berlin/germany: ~350 gCO2/kWh
  const co2G = totalKwh * 400;
  
  // Water for cooling: ~0.5L per kWh (average data center)
  const waterMl = totalKwh * 500;
  
  return { energyKwh: totalKwh, co2G, waterMl };
}

// GET /api/ecology - Get ecological impact for all sessions
export async function GET() {
  try {
    // Try local sessions first (more reliable than gateway)
    let sessions = await getLocalSessions();
    const usingFallback = sessions.length === 0;
    
    // Also try gateway as secondary source if local is empty
    if (sessions.length === 0) {
      try {
        const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || 'e860d5a94d6b9558093c05fa0d4b3018092db93ec5755e6a';
        const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:18789';
        
        const res = await fetch(`${GATEWAY_URL}/tools/invoke`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GATEWAY_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tool: 'sessions_list', args: { limit: 100 } }),
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.result?.content) {
            const sessionsData = JSON.parse(data.result.content[0].text);
            sessions = sessionsData.sessions || [];
          }
        }
      } catch (gatewayError) {
        // Ignore gateway errors, use local sessions
      }
    }

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

    // Calculate infrastructure impact (VM/resources)
    const infraMetrics = await getInfrastructureMetrics();
    const infraImpact = calculateInfrastructureImpact(
      infraMetrics.cpuHours,
      infraMetrics.memoryGbHours,
      infraMetrics.networkMb
    );

    // Add infrastructure impact to totals
    totalEnergy += infraImpact.energyKwh;
    totalCo2 += infraImpact.co2G;
    totalWater += infraImpact.waterMl;
    totalCo2All += infraImpact.co2G;

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
      infrastructure: {
        cpuHours: infraMetrics.cpuHours,
        memoryGbHours: infraMetrics.memoryGbHours,
        networkMb: infraMetrics.networkMb,
        energyKwh: infraImpact.energyKwh,
        co2G: infraImpact.co2G,
        waterMl: infraImpact.waterMl,
      },
      byModel: Object.values(modelImpacts),
      availableModels: Object.keys(MODEL_ECOLOGY),
      socialMetrics: MODEL_SOCIAL,
      usingLocalSessions: true,
      fallback: usingFallback && sessions.length === 0,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}