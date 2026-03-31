import type { SocialMetrics } from './schemas';

// Social/labor metrics per provider
// Based on public reports, worker accounts, research, and Marcus's sources
// Provider IDs must match PROVIDER_RISK_PROFILES in riskMapping.ts
export const SOCIAL_METRICS: Record<string, SocialMetrics> = {
  'openai': {
    modelId: 'openai',
    provider: 'OpenAI (USA)',
    laborRating: 'C',
    dataEthics: 'C',
    colonialismIndex: 7,
    clickworkerNotes: `Scale AI und Clickworker-Plattformen mit niedrigen Löhnen ($1-2/h).
Trainingsdaten oft aus westlichen Quellen, Extraktion von globalem Wissen.
Rechenzentren im Nahen Osten Ziel von Konflikten (Data Centre Magazine).
Quellen: DC Byte, TechPolicy.Press zu KI-Infrastruktur im Krieg.`,
  },
  'anthropic': {
    modelId: 'anthropic',
    provider: 'Anthropic (USA)',
    laborRating: 'B',
    dataEthics: 'B',
    colonialismIndex: 5,
    clickworkerNotes: `Besser dokumentierte Praktiken als OpenAI. Eigene Annotations-Teams.
Dennoch hardware-abhängig von Nvidia GPUs mit ähnlichen Supply-Chain-Risiken.
Lieferketten-Problematik (Germanium, Gallium Exportbeschränkungen China) betrifft alle.`,
  },
  'minimax-portal': {
    modelId: 'minimax-portal',
    provider: 'MiniMax (China)',
    laborRating: 'C',
    dataEthics: 'C',
    colonialismIndex: 6,
    clickworkerNotes: `Hardware-Produktion stark in China. Konfliktmineralien (3TG, Kobalt) oft aus Afrika. 
Quellen: Responsible Minerals Initiative (RMI), Z2Data für Supply-Chain zu Konfliktzonen.
Exportbeschränkungen (Gallium, Germanium) zeigen geopolitische Risiken. (WEF)`,
  },
  'kimi-coding': {
    modelId: 'kimi-coding',
    provider: 'Moonshot AI (China)',
    laborRating: 'C',
    dataEthics: 'C',
    colonialismIndex: 6,
    clickworkerNotes: `Ähnliche Bedenken wie MiniMax. Wenig öffentliche Daten zu Arbeitspraktiken.
Hardware-Lieferkette ähnlich problematisch wie bei anderen China-Providern.
Quellen: RMI, Fairphone Reports zu Konfliktmineralien in IT-Lieferketten.`,
  },
}

// Get social metrics for a model
export function getSocialMetrics(modelId: string): SocialMetrics | null {
  return SOCIAL_METRICS[modelId] || null
}

// Get rating color class
export function getRatingColor(rating: string): string {
  const colors: Record<string, string> = {
    'A': 'text-green-400',
    'B': 'text-blue-400',
    'C': 'text-yellow-400',
    'D': 'text-orange-400',
    'F': 'text-red-400',
  }
  return colors[rating] || 'text-gray-400'
}

// Get rating description
export function getRatingDescription(rating: string): string {
  const descriptions: Record<string, string> = {
    'A': 'Sehr gut dokumentiert',
    'B': 'Gut dokumentiert',
    'C': 'Befriedigend',
    'D': 'Mangelhaft',
    'F': 'Unzureichend',
  }
  return descriptions[rating] || rating
}