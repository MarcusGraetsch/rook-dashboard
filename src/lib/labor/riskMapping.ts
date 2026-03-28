import type { ProviderRiskProfile } from './schemas';

// Placeholder/provider-level risk profiles.
// These are heuristic proxies and MUST NOT be treated as exact measurements.

export const PROVIDER_RISK_PROFILES: ProviderRiskProfile[] = [
  {
    provider_id: 'openai',
    model_family: 'gpt-4',
    transparency_score: 55,
    labor_disclosure_score: 35,
    data_disclosure_score: 40,
    outsourcing_opacity_flag: true,
    contested_labor_practices_flag: true,
    evidence_coverage_score: 70,
    confidence: 'medium',
    methodology_version: '1.0.0',
    sources: ['stanford_fmt_index_2024', 'hrw_gig_trap_2025'],
  },
  {
    provider_id: 'anthropic',
    model_family: 'claude-sonnet',
    transparency_score: 70,
    labor_disclosure_score: 45,
    data_disclosure_score: 60,
    outsourcing_opacity_flag: true,
    contested_labor_practices_flag: false,
    evidence_coverage_score: 50,
    confidence: 'low',
    methodology_version: '1.0.0',
    sources: ['stanford_fmt_index_2024'],
  },
  {
    provider_id: 'minimax-portal',
    model_family: 'MiniMax-M2.7',
    transparency_score: 30,
    labor_disclosure_score: 20,
    data_disclosure_score: 25,
    outsourcing_opacity_flag: true,
    contested_labor_practices_flag: true,
    evidence_coverage_score: 30,
    confidence: 'low',
    methodology_version: '1.0.0',
    sources: [], // industry-level proxy, weak evidence
  },
  {
    provider_id: 'kimi-coding',
    model_family: 'k2p5',
    transparency_score: 35,
    labor_disclosure_score: 25,
    data_disclosure_score: 30,
    outsourcing_opacity_flag: true,
    contested_labor_practices_flag: true,
    evidence_coverage_score: 25,
    confidence: 'low',
    methodology_version: '1.0.0',
    sources: [],
  },
];
