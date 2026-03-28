// LLM Pricing Data
// Tracks subscription vs pay-per-use costs for models we use
// All subscription prices in EUR (what Marcus actually pays)

export interface ModelPricing {
  id: string
  name: string
  provider: string
  inputPerMillion: number // Pay-per-use price per 1M input tokens (USD)
  outputPerMillion: number // Pay-per-use price per 1M output tokens (USD)
  subscription?: {
    priceEur: number // Monthly price in EUR
    includedTokens: number // Included tokens (0 = not applicable)
    unlimitedAfter: boolean // True if unlimited after limit
    limitType?: 'requests' | 'messages' | 'tokens' | 'unknown'
    limitValue?: number // Limit amount
    limitPeriod?: string // e.g., "per 3h", "per day"
  }
  contextWindow: number
  notes?: string
}

// Current models we use
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'MiniMax-M2.7': {
    id: 'MiniMax-M2.7',
    name: 'MiniMax M2.7',
    provider: 'MiniMax',
    inputPerMillion: 0.30, // USD per 1M input tokens
    outputPerMillion: 1.20, // USD per 1M output tokens
    subscription: {
      priceEur: 10.31, // 10,31 €/Monat (Starter Plan)
      includedTokens: 0, // Request-basiert: ~1500 requests/5h
      unlimitedAfter: false,
      limitType: 'requests',
      limitValue: 1500, // per 5 hours
      limitPeriod: '5h'
    },
    contextWindow: 1000000,
    notes: 'MiniMax Starter: ~1500 Requests/5h (request-basiert)'
  },
  'kimi-coding/k2p5': {
    id: 'kimi-coding/k2p5',
    name: 'Kimi K2.5',
    provider: 'Moonshot',
    inputPerMillion: 0.60, // USD per 1M input tokens
    outputPerMillion: 2.00, // USD per 1M output tokens  
    subscription: {
      priceEur: 16.67, // 16,67 €/Monat
      includedTokens: 0, // Info nicht verfügbar
      unlimitedAfter: false,
      limitType: 'unknown',
      limitValue: 0,
      limitPeriod: 'unknown'
    },
    contextWindow: 128000,
    notes: 'Kimi Pro: Token-Limit unbekannt (bitte recherchieren)'
  },
  'minimax-portal/MiniMax-M2': {
    id: 'minimax-portal/MiniMax-M2',
    name: 'MiniMax M2 (Portal)',
    provider: 'MiniMax',
    inputPerMillion: 0.30,
    outputPerMillion: 1.20,
    subscription: {
      priceEur: 10.31, // 10,31 €/Monat
      includedTokens: 0,
      unlimitedAfter: false,
      limitType: 'requests',
      limitValue: 1500,
      limitPeriod: '5h'
    },
    contextWindow: 1000000,
    notes: 'MiniMax Starter: ~1500 Requests/5h'
  },
  'MiniMax-M2': {
    id: 'MiniMax-M2',
    name: 'MiniMax M2',
    provider: 'MiniMax',
    inputPerMillion: 0.30,
    outputPerMillion: 1.20,
    subscription: {
      priceEur: 10.31,
      includedTokens: 0,
      unlimitedAfter: false,
      limitType: 'requests',
      limitValue: 1500,
      limitPeriod: '5h'
    },
    contextWindow: 1000000,
    notes: 'MiniMax Starter: ~1500 Requests/5h'
  },
  'kimi-k2p5': {
    id: 'kimi-k2p5',
    name: 'Kimi K2.5',
    provider: 'Moonshot',
    inputPerMillion: 0.60,
    outputPerMillion: 2.00,
    subscription: {
      priceEur: 16.67,
      includedTokens: 0,
      unlimitedAfter: false,
      limitType: 'unknown',
      limitValue: 0,
      limitPeriod: 'unknown'
    },
    contextWindow: 128000,
    notes: 'Kimi Pro: Token-Limit unbekannt'
  },
  'gpt-4': {
    id: 'gpt-4',
    name: 'GPT-4 (Plus)',
    provider: 'OpenAI',
    inputPerMillion: 15.00,
    outputPerMillion: 60.00,
    subscription: {
      priceEur: 23.00, // ChatGPT Plus
      includedTokens: 0,
      unlimitedAfter: false,
      limitType: 'messages',
      limitValue: 150, // per 3 hours (GPT-4o)
      limitPeriod: '3h'
    },
    contextWindow: 128000,
    notes: 'ChatGPT Plus: ~150 Messages/3h (message-basiert)'
  },
  'gpt-4-turbo': {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    inputPerMillion: 10.00,
    outputPerMillion: 30.00,
    contextWindow: 128000,
    notes: 'Pay per use only'
  },
  'claude-3-5-sonnet': {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    subscription: {
      priceEur: 21.42, // Claude Pro
      includedTokens: 0,
      unlimitedAfter: true
    },
    contextWindow: 200000,
    notes: 'Claude Pro (21,42 €/Monat, Unlimited)'
  },
  'claude-opus': {
    id: 'claude-opus',
    name: 'Claude Opus 4',
    provider: 'Anthropic',
    inputPerMillion: 15.00,
    outputPerMillion: 75.00,
    contextWindow: 200000,
    notes: 'Pay per use only'
  }
}

// Calculate actual cost for a model given token usage
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  subscriptionMonths: number = 1
): {
  actualCostEur: number
  payPerUseCostEur: number
  model: ModelPricing | undefined
  isSubscription: boolean
  savingsVsPayPerUse: number
  effectivePricePerMillion: number
} {
  const model = MODEL_PRICING[modelId]
  const USD_TO_EUR = 0.92 // Approximate rate
  
  if (!model) {
    return {
      actualCostEur: 0,
      payPerUseCostEur: 0,
      model: undefined,
      isSubscription: false,
      savingsVsPayPerUse: 0,
      effectivePricePerMillion: 0
    }
  }
  
  // Pay-per-use cost in USD then convert to EUR
  const inputCost = (inputTokens / 1_000_000) * model.inputPerMillion
  const outputCost = (outputTokens / 1_000_000) * model.outputPerMillion
  const payPerUseCostUsd = inputCost + outputCost
  const payPerUseCostEur = payPerUseCostUsd * USD_TO_EUR
  
  let actualCostEur: number
  let isSubscription: boolean = false
  
  if (model.subscription) {
    isSubscription = true
    if (model.subscription.unlimitedAfter) {
      // Unlimited subscription - just subscription cost
      actualCostEur = model.subscription.priceEur * subscriptionMonths
    } else {
      // Limited subscription
      const includedTokens = model.subscription.includedTokens * subscriptionMonths
      if (inputTokens + outputTokens <= includedTokens) {
        actualCostEur = model.subscription.priceEur * subscriptionMonths
      } else {
        actualCostEur = model.subscription.priceEur * subscriptionMonths
      }
    }
  } else {
    // Pure pay-per-use
    actualCostEur = payPerUseCostEur
  }
  
  return {
    actualCostEur,
    payPerUseCostEur,
    model,
    isSubscription,
    savingsVsPayPerUse: payPerUseCostEur - actualCostEur,
    effectivePricePerMillion: inputTokens + outputTokens > 0 
      ? (actualCostEur / (inputTokens + outputTokens)) * 1_000_000 
      : 0
  }
}

// Get pricing for display
export function getModelPricingInfo(modelId: string): {
  displayName: string
  provider: string
  inputDisplay: string
  outputDisplay: string
  subscriptionDisplay: string | null
  limitDisplay: string | null
  notes: string
} | null {
  const model = MODEL_PRICING[modelId]
  
  if (!model) {
    return {
      displayName: modelId,
      provider: 'Unknown',
      inputDisplay: '?',
      outputDisplay: '?',
      subscriptionDisplay: null,
      limitDisplay: null,
      notes: 'Preis nicht bekannt'
    }
  }
  
  const inputDisplay = `$${model.inputPerMillion}/1M in`
  const outputDisplay = `$${model.outputPerMillion}/1M out`
  
  let subscriptionDisplay: string | null = null
  let limitDisplay: string | null = null
  
  if (model.subscription) {
    subscriptionDisplay = `${model.subscription.priceEur} €/Monat`
    
    if (model.subscription.limitType && model.subscription.limitValue) {
      const limitTypeNames: Record<string, string> = {
        'requests': 'Requests',
        'messages': 'Messages',
        'tokens': 'Tokens'
      }
      limitDisplay = `~${model.subscription.limitValue.toLocaleString()} ${limitTypeNames[model.subscription.limitType] || model.subscription.limitType}/${model.subscription.limitPeriod}`
    } else if (model.subscription.unlimitedAfter) {
      limitDisplay = 'Unlimited'
    }
  }
  
  return {
    displayName: model.name,
    provider: model.provider,
    inputDisplay,
    outputDisplay,
    subscriptionDisplay,
    limitDisplay,
    notes: model.notes || ''
  }
}
