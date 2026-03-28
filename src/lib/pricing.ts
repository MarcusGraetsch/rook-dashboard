// LLM Pricing Data
// Tracks subscription vs pay-per-use costs for models we use

export interface ModelPricing {
  id: string
  name: string
  provider: string
  inputPerMillion: number // Pay-per-use price per 1M input tokens
  outputPerMillion: number // Pay-per-use price per 1M output tokens
  subscription?: {
    price: number // Monthly price
    includedTokens: number // Included tokens per month
    pricePerExtraMillion: number // Extra cost per 1M tokens after limit
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
    inputPerMillion: 0.30, // ~$0.30/1M input
    outputPerMillion: 1.20, // ~$1.20/1M output
    subscription: {
      price: 20, // MiniMax Coding Pro
      includedTokens: 50000000, // 50M tokens included (geschätzt)
      pricePerExtraMillion: 0
    },
    contextWindow: 1000000,
    notes: 'Subscription: MiniMax Coding Pro ($20/mo)'
  },
  'kimi-coding/k2p5': {
    id: 'kimi-coding/k2p5',
    name: 'Kimi K2.5',
    provider: 'Moonshot',
    inputPerMillion: 0.60, // ~$0.60/1M input
    outputPerMillion: 2.00, // ~$2.00/1M output  
    subscription: {
      price: 19, // Kimi Pro (~$19/mo)
      includedTokens: 10000000, // 10M tokens (geschätzt)
      pricePerExtraMillion: 0
    },
    contextWindow: 128000,
    notes: 'Subscription: Kimi Pro (~$19/mo)'
  },
  'minimax-portal/MiniMax-M2': {
    id: 'minimax-portal/MiniMax-M2',
    name: 'MiniMax M2 (Portal)',
    provider: 'MiniMax',
    inputPerMillion: 0.30,
    outputPerMillion: 1.20,
    subscription: {
      price: 20, // MiniMax Coding Pro
      includedTokens: 50000000,
      pricePerExtraMillion: 0
    },
    contextWindow: 1000000,
    notes: 'Subscription: MiniMax Coding Pro ($20/mo)'
  },
  'gpt-4': {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'OpenAI',
    inputPerMillion: 15.00, // $15/1M input
    outputPerMillion: 60.00, // $60/1M output
    subscription: {
      price: 20, // ChatGPT Plus
      includedTokens: 25000000, // 25M tokens included
      pricePerExtraMillion: 0
    },
    contextWindow: 128000,
    notes: 'Subscription (ChatGPT Plus) vs $15/1M API'
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
      price: 20, // Claude Pro
      includedTokens: 5000000, // 5M tokens
      pricePerExtraMillion: 0 // Unlimited after limit
    },
    contextWindow: 200000,
    notes: 'Claude Pro subscription vs API pricing'
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
  actualCost: number
  payPerUseCost: number
  model: ModelPricing | undefined
  isSubscription: boolean
  savingsVsPayPerUse: number
  effectivePricePerMillion: number
} {
  const model = MODEL_PRICING[modelId]
  
  if (!model) {
    return {
      actualCost: 0,
      payPerUseCost: 0,
      model: undefined,
      isSubscription: false,
      savingsVsPayPerUse: 0,
      effectivePricePerMillion: 0
    }
  }
  
  // Pay-per-use cost
  const inputCost = (inputTokens / 1_000_000) * model.inputPerMillion
  const outputCost = (outputTokens / 1_000_000) * model.outputPerMillion
  const payPerUseCost = inputCost + outputCost
  
  let actualCost: number
  let isSubscription: boolean = false
  
  if (model.subscription) {
    // Subscription model
    isSubscription = true
    const totalSubscriptionCost = model.subscription.price * subscriptionMonths
    const includedTokens = model.subscription.includedTokens * subscriptionMonths
    
    if (inputTokens + outputTokens <= includedTokens) {
      // Within limit - just subscription cost
      actualCost = totalSubscriptionCost
    } else {
      // Over limit - subscription + overage (but many subs have unlimited after)
      actualCost = totalSubscriptionCost // Most subscriptions don't charge overage
    }
  } else {
    // Pure pay-per-use
    actualCost = payPerUseCost
  }
  
  return {
    actualCost,
    payPerUseCost,
    model,
    isSubscription,
    savingsVsPayPerUse: payPerUseCost - actualCost,
    effectivePricePerMillion: inputTokens + outputTokens > 0 
      ? (actualCost / (inputTokens + outputTokens)) * 1_000_000 
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
      notes: 'Preis nicht bekannt'
    }
  }
  
  const inputDisplay = `$${model.inputPerMillion}/1M in`
  const outputDisplay = `$${model.outputPerMillion}/1M out`
  
  let subscriptionDisplay: string | null = null
  if (model.subscription) {
    const included = model.subscription.includedTokens >= 1_000_000 
      ? `${model.subscription.includedTokens / 1_000_000}M`
      : `${model.subscription.includedTokens / 1000}K`
    subscriptionDisplay = `$${model.subscription.price}/mo (${included} tokens)`
  }
  
  return {
    displayName: model.name,
    provider: model.provider,
    inputDisplay,
    outputDisplay,
    subscriptionDisplay,
    notes: model.notes || ''
  }
}
