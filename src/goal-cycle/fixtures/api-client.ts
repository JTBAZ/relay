/**
 * Goal Cycle API client fixtures (VS1-T04).
 * Stable envelopes for 404 / 409 / resume without inventing wire fields.
 */

import type { GoalCycleDetail, GoalCycleSummary } from "../contracts.js";
import { GOAL_CYCLE_CONTRACT_VERSION } from "../contracts.js";
import { DREAM_FIXTURE_CREATED_AT, DREAM_FLOW_FIXTURE } from "./dream-flow.js";

export const GOAL_CYCLE_API_FIXTURE_VERSION = "goal-cycle-api-client-v1" as const;

export type GoalCycleApiErrorFixture = {
  status: number;
  code: string;
  message: string;
  details?: Array<{ field: string; issue: string }>;
};

/** Cross-tenant or missing cycle. */
export const GOAL_CYCLE_NOT_FOUND_FIXTURE: GoalCycleApiErrorFixture = {
  status: 404,
  code: "GOAL_CYCLE_NOT_FOUND",
  message: "Goal Cycle not found."
};

/** Second active start without matching idempotency key. */
export const GOAL_CYCLE_ACTIVE_EXISTS_FIXTURE: GoalCycleApiErrorFixture = {
  status: 409,
  code: "GOAL_CYCLE_ACTIVE_EXISTS",
  message: "Another Goal Cycle is already active.",
  details: [{ field: "cycle_id", issue: DREAM_FLOW_FIXTURE.sample_cycle_summary.cycle_id }]
};

/** Stale checkpoint expected_version. */
export const GOAL_CYCLE_VERSION_CONFLICT_FIXTURE: GoalCycleApiErrorFixture = {
  status: 409,
  code: "GOAL_CYCLE_VERSION_CONFLICT",
  message: "Goal Cycle version conflict.",
  details: [
    { field: "expected_version", issue: "1" },
    { field: "current_version", issue: "2" }
  ]
};

/** Library reopen / hydrate resume shape (checkpoint authoritative). */
export const GOAL_CYCLE_RESUME_SUMMARY_FIXTURE: GoalCycleSummary = {
  ...DREAM_FLOW_FIXTURE.sample_cycle_summary,
  state: "questions",
  phase: "questions",
  version: 3,
  updated_at: "2026-07-17T16:05:00.000Z"
};

export const GOAL_CYCLE_RESUME_DETAIL_FIXTURE: GoalCycleDetail = {
  ...GOAL_CYCLE_RESUME_SUMMARY_FIXTURE,
  time_zone: DREAM_FLOW_FIXTURE.creator.time_zone,
  context: {
    niche: "character sketches",
    notes: "Resume after closing Library modal."
  },
  plan: null,
  progress: DREAM_FLOW_FIXTURE.sample_progress.slice(0, 2),
  credit: DREAM_FLOW_FIXTURE.credit,
  evidence: DREAM_FLOW_FIXTURE.sample_evidence.slice(0, 1),
  outcome: null,
  reflection: null,
  learning: null,
  materialization: null
};

export const GOAL_CYCLE_API_CLIENT_FIXTURES = {
  fixture_id: GOAL_CYCLE_API_FIXTURE_VERSION,
  contract_version: GOAL_CYCLE_CONTRACT_VERSION,
  created_at: DREAM_FIXTURE_CREATED_AT,
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
