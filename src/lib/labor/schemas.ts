import { z } from 'zod';

// ===== Source Registry =====

export const SourceRegistryEntrySchema = z.object({
  source_id: z.string(),
  title: z.string(),
  organization: z.string(),
  url: z.string().url().optional(),
  source_type: z.enum([
    'research',
    'journalism',
    'ngo',
    'academic_index',
    'advocacy',
    'dataset',
  ]),
  geography: z.string().optional(),
  publication_date: z.string().optional(),
  retrieval_date: z.string(),
  version: z.string(),
  credibility_notes: z.string().optional(),
  known_limitations: z.string().optional(),
  license_notes: z.string().optional(),
  citation_short: z.string(),
  citation_full: z.string(),
});

export type SourceRegistryEntry = z.infer<typeof SourceRegistryEntrySchema>;

// ===== Provider Risk Profile =====

export const ProviderRiskProfileSchema = z.object({
  provider_id: z.string(),
  model_family: z.string().optional(),

  transparency_score: z.number().min(0).max(100),
  labor_disclosure_score: z.number().min(0).max(100),
  data_disclosure_score: z.number().min(0).max(100),
  outsourcing_opacity_flag: z.boolean(),
  contested_labor_practices_flag: z.boolean(),
  evidence_coverage_score: z.number().min(0).max(100),

  confidence: z.enum(['low', 'medium', 'high']),
  methodology_version: z.string(),
  sources: z.array(z.string()),
});

export type ProviderRiskProfile = z.infer<typeof ProviderRiskProfileSchema>;

// ===== Metrics =====

export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const MetricCategorySchema = z.enum([
  'transparency',
  'labor',
  'supply_chain',
  'fairness',
  'meta',
]);
export type MetricCategory = z.infer<typeof MetricCategorySchema>;

export const MetricMethodologySchema = z.object({
  formula: z.string(),
  inputs: z.array(z.string()),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  notes: z.string().optional(),
});
export type MetricMethodology = z.infer<typeof MetricMethodologySchema>;

export const MetricResultSchema = z.object({
  metric_id: z.string(),
  value: z.union([z.number(), z.string()]),
  label: z.string(),
  unit: z.string().optional(),
  category: MetricCategorySchema,
  confidence: ConfidenceSchema,
  exposure: z.boolean().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  methodology_version: z.string(),
  sources: z.array(z.string()),
  calculated_at: z.string(),
});

export type MetricResult = z.infer<typeof MetricResultSchema>;

// ===== Social / Labor Metrics =====

export const SocialMetricsSchema = z.object({
  modelId: z.string(),
  provider: z.string(),
  laborRating: z.enum(['A', 'B', 'C', 'D', 'F']),
  dataEthics: z.enum(['A', 'B', 'C', 'D', 'F']),
  colonialismIndex: z.number().min(0).max(10),
  clickworkerNotes: z.string(),
});

export type SocialMetrics = z.infer<typeof SocialMetricsSchema>;
