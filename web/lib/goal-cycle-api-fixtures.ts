/**
 * Goal Cycle API client fixtures for Library Dream UX (VS1-T04).
 * Mirrors `src/goal-cycle/fixtures/api-client.ts` without DB fields.
 */

import type { GoalCycleDetail, GoalCycleSummary } from "./goal-cycle-types";
import { GOAL_CYCLE_CONTRACT_VERSION } from "./goal-cycle-types";

export const GOAL_CYCLE_API_FIXTURE_VERSION = "goal-cycle-api-client-v1" as const;

export type GoalCycleApiErrorFixture = {
  status: number;
  code: string;
  message: string;
  details?: Array<{ field: string; issue: string }>;
};

export const GOAL_CYCLE_NOT_FOUND_FIXTURE: GoalCycleApiErrorFixture = {
  status: 404,
  code: "GOAL_CYCLE_NOT_FOUND",
  message: "Goal Cycle not found."
};

export const GOAL_CYCLE_ACTIVE_EXISTS_FIXTURE: GoalCycleApiErrorFixture = {
  status: 409,
  code: "GOAL_CYCLE_ACTIVE_EXISTS",
  message: "Another Goal Cycle is already active.",
  details: [{ field: "cycle_id", issue: "cycle_dream_seed" }]
};

export const GOAL_CYCLE_VERSION_CONFLICT_FIXTURE: GoalCycleApiErrorFixture = {
  status: 409,
  code: "GOAL_CYCLE_VERSION_CONFLICT",
  message: "Goal Cycle version conflict.",
  details: [
    { field: "expected_version", issue: "1" },
    { field: "current_version", issue: "2" }
  ]
};

export const GOAL_CYCLE_RESUME_SUMMARY_FIXTURE: GoalCycleSummary = {
  cycle_id: "cycle_dream_seed",
  state: "questions",
  phase: "questions",
  goal_kind: "engagement",
  break_mode: null,
  version: 3,
  period_key: "2026-07",
  created_at: "2026-07-17T16:00:00.000Z",
  updated_at: "2026-07-17T16:05:00.000Z"
};

export const GOAL_CYCLE_RESUME_DETAIL_FIXTURE: GoalCycleDetail = {
  ...GOAL_CYCLE_RESUME_SUMMARY_FIXTURE,
  time_zone: "America/New_York",
  context: {
    niche: "character sketches",
    notes: "Resume after closing Library modal."
  },
  plan: null,
  progress: [
    {
      sequence: 1,
      phase: "research",
      message_code: "history_loaded",
      occurred_at: "2026-07-17T16:01:00.000Z",
      retryable: false
    },
    {
      sequence: 2,
      phase: "research",
      message_code: "evidence_weak",
      occurred_at: "2026-07-17T16:01:30.000Z",
      retryable: false
    }
  ],
  credit: {
    enabled: true,
    available: 1,
    reserved: 0,
    included_per_period: null,
    period_started_at: "2026-07-01T04:00:00.000Z",
    period_ends_at: "2026-08-01T04:00:00.000Z",
    next_grant_at: "2026-08-01T04:00:00.000Z",
    topups_available: false
  },
  evidence: [
    {
      ref_id: "ev_history_top",
      kind: "history",
      confidence: "high",
      freshness_seconds: 0,
      summary: "Midweek evening posts earned the strongest engagement in the last 90 days."
    }
  ],
  outcome: null,
  reflection: null,
  learning: null,
  materialization: null
};

export const GOAL_CYCLE_API_CLIENT_FIXTURES = {
  fixture_id: GOAL_CYCLE_API_FIXTURE_VERSION,
  contract_version: GOAL_CYCLE_CONTRACT_VERSION,
  created_at: "2026-07-17T16:00:00.000Z",
  errors: {
    not_found: GOAL_CYCLE_NOT_FOUND_FIXTURE,
    active_exists: GOAL_CYCLE_ACTIVE_EXISTS_FIXTURE,
    version_conflict: GOAL_CYCLE_VERSION_CONFLICT_FIXTURE
  },
  resume: {
    summary: GOAL_CYCLE_RESUME_SUMMARY_FIXTURE,
    detail: GOAL_CYCLE_RESUME_DETAIL_FIXTURE
  }
} as const;
