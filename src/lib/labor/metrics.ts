import { PROVIDER_RISK_PROFILES } from './riskMapping';
import {
  type MetricResult,
  MetricResultSchema,
  type ProviderRiskProfile,
} from './schemas';

// Version tags for metric definitions
const TRANSPARENCY_VERSION = '1.0.0';
const EXPOSURE_VERSION = '1.0.0';
const COVERAGE_VERSION = '1.0.0';

// ===== Helper mapping functions =====

function mapExposureLabel(score: number): string {
  if (score <= 20) return 'very low';
  if (score <= 40) return 'low';
  if (score <= 60) return 'moderate';
  if (score <= 80) return 'high';
  return 'very high';
}

function mapCoverageLabel(score: number): string {
  if (score >= 75) return 'strong evidence';
  if (score >= 50) return 'partial evidence';
  if (score >= 25) return 'weak evidence';
  return 'speculative';
}

// ===== Metric Computation =====

/**
 * Compute transparency risk score (already used in summary route).
 * Kept here for completeness / reuse.
 */
export function computeTransparencyRiskMetric(
  profile: ProviderRiskProfile,
  now: string,
): MetricResult {
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
    methodology_version: TRANSPARENCY_VERSION,
    sources: profile.sources,
    calculated_at: now,
  };

  return MetricResultSchema.parse(metric);
}

/**
 * Hidden Labor Exposure Score (v1)
 *
 * Heuristischer Index 0–100, der Proxy-Signale kombiniert:
 * - labor_disclosure_score (niedrige Offenlegung = höheres Exposure)
 * - outsourcing_opacity_flag
 * - contested_labor_practices_flag
 * - transparency_score (niedrige Transparenz = höheres Exposure)
 *
 * WICHTIG: Dies ist eine Exposure-/Proxy-Metrik, KEINE Schätzung realer Arbeitsstunden.
 */
export function computeHiddenLaborExposureMetric(
  profile: ProviderRiskProfile,
  now: string,
): MetricResult {
  const lackOfLaborDisclosure = 100 - profile.labor_disclosure_score;
  const lackOfTransparency = 100 - profile.transparency_score;

  const outsourcingPenalty = profile.outsourcing_opacity_flag ? 15 : 0;
  const contestedPenalty = profile.contested_labor_practices_flag ? 20 : 0;

  // Grobe Heuristik: gewichtete Summe der Proxy-Signale
  let raw =
    0.35 * lackOfLaborDisclosure +
    0.25 * lackOfTransparency +
    outsourcingPenalty +
    contestedPenalty;

  // Clamp to [0, 100]
  raw = Math.max(0, Math.min(100, raw));

  const label = mapExposureLabel(raw);

  const metric: MetricResult = {
    metric_id: 'hidden_labor_exposure_score_v1',
    value: Number(raw.toFixed(1)),
    label,
    unit: 'index_0_100',
    category: 'labor',
    confidence: profile.confidence, // bleibt vorsichtig (oft low/medium)
    exposure: true,
    from: '',
    to: now,
    methodology_version: EXPOSURE_VERSION,
    sources: profile.sources,
    calculated_at: now,
  };

  return MetricResultSchema.parse(metric);
}

/**
 * Source Coverage Score (v1)
 *
 * Mapping evidence_coverage_score (0–100) → verbales Label.
 * Zeigt, wie gut die genutzten Proxies empirisch abgestützt sind.
 */
export function computeSourceCoverageMetric(
  profile: ProviderRiskProfile,
  now: string,
): MetricResult {
  const score = profile.evidence_coverage_score;
  const label = mapCoverageLabel(score);

  const metric: MetricResult = {
    metric_id: 'source_coverage_score_v1',
    value: score,
    label,
    unit: 'index_0_100',
    category: 'meta',
    confidence: profile.confidence,
    exposure: true,
    from: '',
    to: now,
    methodology_version: COVERAGE_VERSION,
    sources: profile.sources,
    calculated_at: now,
  };

  return MetricResultSchema.parse(metric);
}

export function getProviderMetricsSummary() {
  const now = new Date().toISOString();

  return PROVIDER_RISK_PROFILES.map((profile) => {
    const transparency = computeTransparencyRiskMetric(profile, now);
    const exposure = computeHiddenLaborExposureMetric(profile, now);
    const coverage = computeSourceCoverageMetric(profile, now);

    return {
      provider_id: profile.provider_id,
      metrics: [transparency, exposure, coverage],
    };
  });
}

function mapTransparencyLabel(score: number): string {
  if (score <= 25) return 'comparatively transparent';
  if (score <= 50) return 'mixed visibility';
  if (score <= 75) return 'opaque';
  return 'highly opaque';
}
