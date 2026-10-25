// The result shapes a probe run returns. They match what the Index stores and
// shows, so a report written here reads the same wherever it is consumed.

import type { CategoryId } from '../index.ts';

export type Friction = {
  severity: 'low' | 'medium' | 'high';
  category: CategoryId;
  summary: string;
  evidence?: string;
};

export type CheckFinding = {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  /** Partial credit in (0, 1) for a check that half-passed. Absent means `passed` decides. */
  credit?: number;
  detail?: string;
};

/** A category's published score and its raw points. */
export type CategoryScore = {
  category: CategoryId;
  score: number;
  deltaWeek: number;
  probeScore?: number | null;
  sessionScore?: number | null;
  applicable?: boolean;
};

export type ProviderScore = {
  provider: string;
  score: number;
};
