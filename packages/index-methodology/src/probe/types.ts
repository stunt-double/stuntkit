import type { CategoryId, DomainSector } from '../index.ts';
import type { DomainMetadata } from './metadata.ts';
import type { Monetisation } from './monetisation-model.ts';
import type { ProviderProbe } from './providers.ts';
import type { IndexOptOut } from './robots.ts';
import type { CategoryScore, CheckFinding, Friction, ProviderScore } from './shapes.ts';

export type { CheckFinding };

/** What a category check knows about the domain beyond this run's probe. */
export type CheckContext = {
  /** The stored monetisation verdict, null when the domain has none yet. */
  monetisation: Monetisation | null;
};

export type CategoryCheckResult = {
  category: CategoryId;
  score: number;
  findings: CheckFinding[];
  frictions: Friction[];
  /**
   * False when the category does not apply to this site (delegated access on
   * a site with no sign-in). Left out of the overall score and of agent
   * sessions. Absent means applicable.
   */
  applicable?: boolean;
};

export type DomainReport = {
  domain: string;
  name: string;
  sector: DomainSector;
  // Finer-grained vertical (e.g. 'payments'). Optional: the probe may
  // not detect it, in which case the existing DB value is preserved.
  service?: string | null;
  // Parent/owning organisation name (e.g. 'Meta').
  organisation?: string | null;
  // Soft reference to the organisation's primary domain.
  organisationDomain?: string | null;
  fetchedAt: string;
  durationMs: number;
  overallScore: number;
  categoryScores: CategoryScore[];
  providerScores: ProviderScore[];
  providerProbes: ProviderProbe[];
  frictions: Friction[];
  findings: Record<CategoryId, CheckFinding[]>;
  reachable: boolean;
  homepageStatus: number;
  metadata: DomainMetadata;
  parentDomain: string | null;
  /**
   * Set when the site asked the Index to stay out (robots.txt or
   * X-Robots-Tag). Such a report carries no scores: the probe stopped at
   * that answer, and nothing is stored or enqueued for it.
   */
  optOut?: IndexOptOut | null;
};
