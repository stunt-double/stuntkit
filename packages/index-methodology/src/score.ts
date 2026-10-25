// What the Stunt Double Index measures and how it turns evidence into a
// published score: the categories and their weights, when a category applies,
// the probe and session blend, and the curve every published number is on.

export type CategoryId =
  | 'brand-awareness'
  | 'discovery'
  | 'information-retrieval'
  | 'market-ranking'
  | 'accuracy'
  | 'checkout'
  | 'delegated-access'
  | 'support';

export type Category = {
  id: CategoryId;
  label: string;
  tagline: string;
  description: string;
  weight: number;
};

// Weights sum to 1. Task completion carries the most: an agent finishing a
// delegated task is the index's headline claim. Market ranking carries less
// than the site-facing categories because it measures what a model already
// believes about the market, which a site's own changes move slowly if at all.
export const CATEGORIES: Category[] = [
  {
    id: 'brand-awareness',
    label: 'Brand awareness',
    tagline: 'Can agents recognize you exist?',
    description:
      'Measures how often and how accurately leading agents mention your brand in unprompted research and comparison tasks.',
    weight: 0.1,
  },
  {
    id: 'discovery',
    label: 'Discovery',
    tagline: 'Will they pick you?',
    description:
      'How well agents discover, shortlist and recommend your product when a user asks for a solution in your category.',
    weight: 0.15,
  },
  {
    id: 'information-retrieval',
    label: 'Information retrieval',
    tagline: 'Can they read your site?',
    description:
      'Quality of structured data, semantics and navigability for agents extracting pricing, specs and policies.',
    weight: 0.15,
  },
  {
    id: 'market-ranking',
    label: 'Market ranking',
    tagline: 'Where do you sit in the lineup?',
    description:
      'Your relative placement vs. competitors when agents produce ranked lists for buyers in your market.',
    weight: 0.1,
  },
  {
    id: 'accuracy',
    label: 'Accuracy',
    tagline: 'Do they tell the truth about you?',
    description:
      'How often agents report correct pricing, features, availability and policies, and how often they hallucinate.',
    weight: 0.15,
  },
  {
    id: 'checkout',
    label: 'Task completion',
    tagline: 'Can an agent complete a task on behalf of a user?',
    description:
      'Whether an agent can carry out a delegated interaction end-to-end: a primary call-to-action is exposed, the destination is reachable without a login wall, no bot-challenge blocks the first step, and the service signals support for agent-friendly auth.',
    weight: 0.2,
  },
  {
    id: 'delegated-access',
    label: 'Delegated access',
    tagline: 'Do you let agents in, safely?',
    description:
      'Availability of scoped auth (OIDC, API keys, MCP), rate limits, and tooling for delegated agent sessions.',
    weight: 0.1,
  },
  {
    id: 'support',
    label: 'Contact & communication',
    tagline: 'Can an agent reach a human?',
    description:
      'Whether an agent acting on a user’s behalf can find a way to contact or communicate with the business: contact page, support email, live chat, phone, help hub, or a social profile it can DM.',
    weight: 0.05,
  },
];

export type DomainSector =
  | 'ecommerce'
  | 'saas'
  | 'travel'
  | 'finance'
  | 'media'
  | 'marketplace'
  | 'professional-services'
  | 'developer-tools'
  | 'utilities'
  | 'social'
  | 'education'
  | 'health'
  | 'government';

// ── score blending ──────────────────────────────────────────────────────────
// Every category score has up to two evidence sources: deterministic HTTP
// probes (cheap, run on every score request) and live agent sessions
// (a real browser, graded against a rubric). The two writers used
// to overwrite each other's numbers; instead each writer updates its own
// provenance field and recomputes the blended `score`.

export type BlendedCategoryScore = {
  category: string;
  /** Blended headline score shown on the index. */
  score: number;
  deltaWeek: number;
  /** Latest deterministic probe score, when one has run. */
  probeScore?: number | null;
  /** Latest agent-session score, when sessions have run. */
  sessionScore?: number | null;
  /**
   * False when the probe found the category does not apply to this site (see
   * `CATEGORY_REQUIREMENTS`). A non-applicable category is left out of the
   * weighted overall and gets no agent sessions. Absent means applicable.
   */
  applicable?: boolean;
};

/**
 * What a site must have for a category to be scored at all. Delegated access
 * (MCP, OAuth, scoped API keys) is about letting an agent act inside a user's
 * account, so a site with no sign-in has nothing to delegate: scoring it would
 * mark down a brochure site for lacking a feature it has no use for, and its
 * agent sessions would pay for a browser to confirm as much.
 */
export const CATEGORY_REQUIREMENTS: Partial<Record<CategoryId, 'sign-in'>> = {
  'delegated-access': 'sign-in',
};

/**
 * Categories a provider arm is never graded for. The Cloudflare arm's Workers
 * AI model has no internet access of its own, so its accuracy and information
 * retrieval answers measure what the model can make up, not what the site told
 * it. The Grok and Llama arms run in the same Worker (Grok through AI
 * Gateway), with no search tool either. The planner creates no session for these, and the
 * Index hides any recorded before this list existed.
 */
export const PROVIDER_SKIPPED_CATEGORIES: Readonly<Record<string, ReadonlyArray<CategoryId>>> = {
  cloudflare: ['accuracy', 'information-retrieval'],
  grok: ['accuracy', 'information-retrieval'],
  llama: ['accuracy', 'information-retrieval'],
};

/**
 * Arms whose sessions no public surface returns: the self-hosted arm, which
 * runs detached after the hosted arms and can
 * take hours, so counting it would hold a public run at "running" long after
 * its published score landed. Its results are for our own comparison.
 */
export const UNPUBLISHED_PROVIDER_IDS: ReadonlyArray<string> = ['local'];

/** Whether a provider's sessions may be shown publicly (see `UNPUBLISHED_PROVIDER_IDS`). */
export function isProviderPublished(providerId: string): boolean {
  return !UNPUBLISHED_PROVIDER_IDS.includes(providerId);
}

/** Whether a provider arm is graded for a category (see `PROVIDER_SKIPPED_CATEGORIES`). */
export function isProviderGradedFor(providerId: string, category: string): boolean {
  return !(PROVIDER_SKIPPED_CATEGORIES[providerId] as ReadonlyArray<string> | undefined)?.includes(
    category
  );
}

/** Whether a category counts for a domain, given its stored category scores. */
export function isCategoryApplicable(
  scores: ReadonlyArray<{ category: string; applicable?: boolean }> | null | undefined,
  category: string
): boolean {
  return scores?.find((s) => s.category === category)?.applicable !== false;
}

/**
 * How much of a sector's task set an agent run drives.
 *
 * - `full` runs every applicable task.
 * - `light` keeps the tasks that cover the most for one session: the browser
 *   tasks graded for several categories (Research and Journey) and the
 *   no-browser knowledge task, and drops the browser tasks graded for one
 *   category only (delegated access, support). About half the browser
 *   sessions per arm. A category a light run skips keeps its previous session
 *   score, as any category with no session in a run does. The Claude arms
 *   drive the light set on every run, full ones included.
 */
export type AgentRunDepth = 'light' | 'full';

export const AGENT_RUN_DEPTHS: readonly AgentRunDepth[] = ['light', 'full'];

/** Whether a value names an agent run depth. */
export function isAgentRunDepth(value: unknown): value is AgentRunDepth {
  return value === 'light' || value === 'full';
}

// Sessions carry more weight: observed agent behaviour is the product's
// headline claim, probes are the diagnostic layer underneath it.
export const PROBE_BLEND_WEIGHT = 0.4;
export const SESSION_BLEND_WEIGHT = 0.6;

// ── published scale ─────────────────────────────────────────────────────────
// Probe checks and session rubrics award raw points, and raw points ran low:
// across 656 domains the median overall was 52.6 (57.8 among sites the probe
// could reach), so most of the index read as Poor or OK while its best sites
// topped out at 86. Every published score (each category and the overall) is
// therefore the raw points on a curve, `100 * (raw / 100) ^ 0.45`, which puts
// the median site in Good (52.6 publishes as 75, 57.8 as 78) and the top
// decile in Excellent. The curve is monotonic, so it never reorders sites; it
// only spreads the upper half of the scale, where most sites sit, and
// compresses the long tail below it. Raw points stay stored as
// `probeScore` / `sessionScore`, and the overall is always computed from raw
// points and curved once, never averaged from curved categories.
export const SCORE_CURVE_EXPONENT = 0.45;

const round1 = (n: number) => Math.round(n * 10) / 10;
const clampScore = (n: number) => Math.min(100, Math.max(0, n));

/** Raw points (0 to 100) as the published score. */
export function curveScore(raw: number): number {
  return round1(100 * (clampScore(raw) / 100) ** SCORE_CURVE_EXPONENT);
}

/** A published score back to raw points: the inverse of `curveScore`. */
export function uncurveScore(published: number): number {
  return 100 * (clampScore(published) / 100) ** (1 / SCORE_CURVE_EXPONENT);
}

/** The raw points a category earns from whichever evidence it has. */
export function blendRawScore(
  probeScore: number | null | undefined,
  sessionScore: number | null | undefined
): number {
  const hasProbe = typeof probeScore === 'number';
  const hasSession = typeof sessionScore === 'number';
  if (hasProbe && hasSession) {
    return round1(probeScore * PROBE_BLEND_WEIGHT + sessionScore * SESSION_BLEND_WEIGHT);
  }
  if (hasSession) return sessionScore;
  if (hasProbe) return probeScore;
  return 0;
}

/** A category's published score: its blended raw points, curved. */
export function blendScore(
  probeScore: number | null | undefined,
  sessionScore: number | null | undefined
): number {
  return curveScore(blendRawScore(probeScore, sessionScore));
}

/**
 * Weighted overall across all categories, from their published scores.
 * Missing categories count as 0; a category marked `applicable: false` is
 * left out and the remaining weights are scaled back up to 1, so a site is
 * neither rewarded nor marked down for a category that does not apply to it.
 *
 * The weighting happens on raw points: each category is uncurved, weighted,
 * and the result curved once. Averaging curved categories would land lower
 * than the curve of the average, because the curve is concave.
 */
export function weightedOverallScore(
  scores: ReadonlyArray<{ category: string; score: number; applicable?: boolean }>
): number {
  let total = 0;
  let excludedWeight = 0;
  for (const s of scores) {
    const weight = CATEGORIES.find((c) => c.id === s.category)?.weight ?? 0;
    if (s.applicable === false) excludedWeight += weight;
    else total += uncurveScore(s.score) * weight;
  }
  const remaining = 1 - excludedWeight;
  if (remaining <= 0) return 0;
  return curveScore(total / remaining);
}

// Finer-grained vertical than `sector`. Treated as a hint (free text),
// so new services can be added without a migration. The values below
// are canonical suggestions shared between the probe, admin UI, and
// agent prompts so that the same product is described consistently.
export const KNOWN_SERVICES = [
  'payments',
  'banking',
  'money-transfer',
  'lending',
  'investing',
  'accounting',
  'design-tooling',
  'developer-tooling',
  'source-control',
  'project-management',
  'productivity',
  'communication',
  'messaging',
  'social-network',
  'video-sharing',
  'news-publishing',
  'streaming-video',
  'streaming-audio',
  'ticketing',
  'commerce-platform',
  'fashion-retail',
  'grocery',
  'food-delivery',
  'ride-hailing',
  'stays',
  'flights',
  'travel-booking',
  'freelance-marketplace',
  'jobs-marketplace',
  'education',
  'health',
] as const;

export type KnownService = (typeof KNOWN_SERVICES)[number];
