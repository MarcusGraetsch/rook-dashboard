import { SourceRegistryEntry } from './schemas';

// Seed/placeholder data — clearly marked as such.
// Real data should be ingested via metrics-collector and persisted in a DB.

export const LABOR_SOURCE_FIXTURES: SourceRegistryEntry[] = [
  {
    source_id: 'hrw_gig_trap_2025',
    title: '"The Gig Trap": Algorithmic, Wage and Labor Exploitation in Platform Work in the US',
    organization: 'Human Rights Watch',
    url: 'https://www.hrw.org/report/2025/05/12/the-gig-trap/algorithmic-wage-and-labor-exploitation-in-platform-work-in-the-us',
    source_type: 'ngo',
    geography: 'US',
    publication_date: '2025-05-12',
    retrieval_date: '2026-03-28',
    version: '1.0.0',
    credibility_notes: 'Large NGO with established research methodology.',
    known_limitations: 'US-focused; not all platforms covered; no full supply chain analysis.',
    license_notes: 'See HRW terms of use.',
    citation_short: 'HRW, The Gig Trap (2025)',
    citation_full:
      'Human Rights Watch, "The Gig Trap: Algorithmic, Wage and Labor Exploitation in Platform Work in the United States", May 12, 2025.',
  },
  {
    source_id: 'stanford_fmt_index_2024',
    title: 'Foundation Model Transparency Index',
    organization: 'Stanford Center for Research on Foundation Models',
    url: 'https://crfm.stanford.edu/fmti',
    source_type: 'academic_index',
    geography: 'Global',
    publication_date: '2024-10-01',
    retrieval_date: '2026-03-28',
    version: '1.0.0',
    credibility_notes: 'Academic transparency index; focuses on disclosure, not labor per se.',
    known_limitations: 'Scopes transparency; does not directly quantify labor exploitation.',
    license_notes: 'See Stanford CRFM licence.',
    citation_short: 'Stanford FM Transparency Index (2024)',
    citation_full:
      'Rishi Bommasani et al., "Foundation Model Transparency Index", Stanford Center for Research on Foundation Models, 2024.',
  },
];
