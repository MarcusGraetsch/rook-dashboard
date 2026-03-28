// Ecological Impact Metrics for LLM Inference
// Based on EcoLogits research + supplementary data

// Energy and emissions data per model per 1M tokens (estimated)
// Sources: EcoLogits, UC Riverside studies, provider disclosures

export interface EcologicalMetrics {
  modelId: string
  energyKwh: number // kWh per 1M tokens
  co2G: number // grams CO2 equivalent per 1M tokens
  waterMl: number // milliliters water per 1M tokens
  hardwareLifecycleFactor: number // manufacturing impact multiplier
}

export interface SocialMetrics {
  modelId: string
  provider: string
  laborRating: 'A' | 'B' | 'C' | 'D' | 'F' // Labor practices
  dataEthics: 'A' | 'B' | 'C' | 'D' | 'F' // Data sourcing
  colonialismIndex: number // 0-10 (0 = very ethical, 10 = extractive)
  clickworkerNotes: string
}

// Per-model ecological data (per 1M tokens inference)
export const MODEL_ECOLOGY: Record<string, EcologicalMetrics> = {
  'MiniMax-M2.7': {
    modelId: 'MiniMax-M2.7',
    energyKwh: 0.15, // Estimated based on efficient inference
    co2G: 45, // gCO2 (China grid ~300g/kWh)
    waterMl: 150, // Cooling estimate
    hardwareLifecycleFactor: 1.8, // GPU manufacturing factor
  },
  'kimi-coding/k2p5': {
    modelId: 'kimi-coding/k2p5',
    energyKwh: 0.18, // Estimated
    co2G: 55, // gCO2
    waterMl: 180,
    hardwareLifecycleFactor: 1.8,
  },
  'MiniMax-M2': {
    modelId: 'MiniMax-M2',
    energyKwh: 0.15,
    co2G: 45,
    waterMl: 150,
    hardwareLifecycleFactor: 1.8,
  },
  'gpt-4': {
    modelId: 'gpt-4',
    energyKwh: 0.65, // Larger model, higher energy
    co2G: 260, // gCO2 (US grid ~400g/kWh)
    waterMl: 500, // Significant cooling needs
    hardwareLifecycleFactor: 2.0,
  },
  'gpt-4-turbo': {
    modelId: 'gpt-4-turbo',
    energyKwh: 0.35,
    co2G: 140,
    waterMl: 350,
    hardwareLifecycleFactor: 2.0,
  },
  'claude-3-5-sonnet': {
    modelId: 'claude-3-5-sonnet',
    energyKwh: 0.28,
    co2G: 112, // Anthropic uses renewable energy credits
    waterMl: 280,
    hardwareLifecycleFactor: 1.9,
  },
  'claude-opus': {
    modelId: 'claude-opus',
    energyKwh: 0.55,
    co2G: 220,
    waterMl: 550,
    hardwareLifecycleFactor: 1.9,
  },
}

// Social/labor metrics per provider
// Based on public reports, worker accounts, and research
export const MODEL_SOCIAL: Record<string, SocialMetrics> = {
  'MiniMax-M2.7': {
    modelId: 'MiniMax-M2.7',
    provider: 'MiniMax (China)',
    laborRating: 'C', // Limited public data on labor practices
    dataEthics: 'C', // Some concerns about data sourcing
    colonialismIndex: 6, // Data center profits often leave origin countries
    clickworkerNotes: 'Limited transparency on annotation workforce. Most data centers in China with local labor.',
  },
  'kimi-coding/k2p5': {
    modelId: 'kimi-coding/k2p5',
    provider: 'Moonshot AI (China)',
    laborRating: 'C',
    dataEthics: 'C',
    colonialismIndex: 6,
    clickworkerNotes: 'Similar to MiniMax. Less public information available.',
  },
  'gpt-4': {
    modelId: 'gpt-4',
    provider: 'OpenAI (USA)',
    laborRating: 'B', // Better documented but concerns about Clickworker/MSCash rates
    dataEthics: 'C', // Training data concerns
    colonialismIndex: 7, // Significant value extraction from global data
    clickworkerNotes: 'Uses Scale AI and other clickwork platforms. Rates as low as $1-2/hour reported. Training data largely from Western internet.',
  },
  'claude-3-5-sonnet': {
    modelId: 'claude-3-5-sonnet',
    provider: 'Anthropic (USA)',
    laborRating: 'B+', // Better practices, PII protection documented
    dataEthics: 'B', // More careful about data sourcing
    colonialismIndex: 5, // Still extractive but more thoughtful
    clickworkerNotes: 'Uses proprietary annotation workforce with better conditions documented. Less reliance on clickwork platforms.',
  },
}

// Calculate ecological impact for given token usage
export function calculateEcologicalImpact(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): {
  energyKwh: number
  co2G: number
  waterMl: number
  hardwareManufacturingCo2G: number
  totalCo2G: number
  socialScore: SocialMetrics | null
  model: EcologicalMetrics | null
} {
  const totalTokens = inputTokens + outputTokens
  const model = MODEL_ECOLOGY[modelId]
  const social = MODEL_SOCIAL[modelId]

  if (!model) {
    return {
      energyKwh: 0,
      co2G: 0,
      waterMl: 0,
      hardwareManufacturingCo2G: 0,
      totalCo2G: 0,
      socialScore: social || null,
      model: null,
    }
  }

  // Scale to actual token count
  const factor = totalTokens / 1_000_000
  const energyKwh = model.energyKwh * factor
  const co2G = model.co2G * factor
  const waterMl = model.waterMl * factor

  // Hardware manufacturing impact (lifecycle factor includes this)
  // Operational CO2 + manufacturing CO2 (amortized)
  const hardwareManufacturingCo2G = co2G * (model.hardwareLifecycleFactor - 1)
  const totalCo2G = co2G + hardwareManufacturingCo2G

  return {
    energyKwh,
    co2G,
    waterMl,
    hardwareManufacturingCo2G,
    totalCo2G,
    socialScore: social || null,
    model,
  }
}

// Get display info for a model
export function getEcologicalInfo(modelId: string): {
  energyPerMillion: string
  co2PerMillion: string
  waterPerMillion: string
  laborRating: string
  ethicsRating: string
  colonialismIndex: string
  notes: string
} | null {
  const ecology = MODEL_ECOLOGY[modelId]
  const social = MODEL_SOCIAL[modelId]

  if (!ecology) return null

  const ratingToText: Record<string, string> = {
    'A': '✓ Sehr gut',
    'B': '✓ Gut',
    'B+': '✓ Gut+',
    'C': '⚠ Befriedigend',
    'D': '⚠ Mangelhaft',
    'F': '✗ Unzureichend',
  }

  return {
    energyPerMillion: `${ecology.energyKwh} kWh`,
    co2PerMillion: `${ecology.co2G}g CO₂`,
    waterPerMillion: `${ecology.waterMl}ml Wasser`,
    laborRating: social ? ratingToText[social.laborRating] || social.laborRating : '?',
    ethicsRating: social ? ratingToText[social.dataEthics] || social.dataEthics : '?',
    colonialismIndex: social ? `${social.colonialismIndex}/10` : '?',
    notes: social?.clickworkerNotes || '',
  }
}
