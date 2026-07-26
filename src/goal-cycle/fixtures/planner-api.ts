/**
 * Goal Cycle planner API fixtures (VS5-T05 exit freeze for VS6/VS7).
 * Stable shapes for generate / revise / hydrate without inventing wire fields.
 */

import type { GoalCycleDetail, GoalCyclePlan, GoalCycleProgressEvent } from "../contracts.js";
import { GOAL_CYCLE_CONTRACT_VERSION } from "../contracts.js";
import { DREAM_FIXTURE_CREATED_AT, DREAM_FLOW_FIXTURE } from "./dream-flow.js";
import {
  GOAL_CYCLE_LIMIT_EXCEEDED_FIXTURE,
  GOAL_CYCLE_NO_CREDIT_FIXTURE,
  GOAL_CYCLE_PLAN_INVALID_FIXTURE
} from "./planner-api-errors.js";

export const GOAL_CYCLE_PLANNER_API_FIXTURE_VERSION = "goal-cycle-planner-api-v1" as const;

export const GOAL_CYCLE_PLANNER_PROGRESS_SEQUENCE_FIXTURE: GoalCycleProgressEvent[] = [
  {
    sequence: 1,
    phase: "revisions",
    message_code: "credit_reserved",
    occurred_at: "2026-07-17T16:01:00.000Z",
    retryable: false
  },
  {
    sequence: 2,
    phase: "revisions",
    message_code: "facts_loaded",
    occurred_at: "2026-07-17T16:01:10.000Z",
    retryable: false
  },
  {
    sequence: 3,
    phase: "revisions",
    message_code: "plan_ready",
    occurred_at: "2026-07-17T16:02:00.000Z",
    retryable: true
  }
];

export const GOAL_CYCLE_PLANNER_FALLBACK_PLAN_FIXTURE: GoalCyclePlan = {
  ...DREAM_FLOW_FIXTURE.sample_plan,
  rationale: "History-paced engagement posts from recent creator cadence.",
  evidence_summary:
    "Fallback uses creator history and cadence only; external trend evidence was not applied.",
  warnings: [
    "Deterministic fallback Plan — no external trend evidence claimed.",
    "Attach media and confirm logistics before approval."
  ],
  ai_revision_count: 0,
  questions_asked: []
};

export const GOAL_CYCLE_PLANNER_HYDRATE_FIXTURE: {
  cycle: GoalCycleDetail;
  plan: GoalCyclePlan;
  progress: GoalCycleProgressEvent[];
} = {
  cycle: {
    ...DREAM_FLOW_FIXTURE.sample_cycle_summary,
    state: "review",
    phase: "revisions",
    version: 4,
    time_zone: DREAM_FLOW_FIXTURE.creator.time_zone,
    context: { topic: "character sketch warmups" },
    plan: DREAM_FLOW_FIXTURE.sample_plan,
    progress: GOAL_CYCLE_PLANNER_PROGRESS_SEQUENCE_FIXTURE,
    credit: DREAM_FLOW_FIXTURE.credit,
    evidence: DREAM_FLOW_FIXTURE.sample_evidence,
    outcome: null,
    reflection: null,
    learning: null,
    materialization: null
  },
  plan: DREAM_FLOW_FIXTURE.sample_plan,
  progress: GOAL_CYCLE_PLANNER_PROGRESS_SEQUENCE_FIXTURE
};

export const GOAL_CYCLE_PLANNER_API_FIXTURES = {
  fixture_id: GOAL_CYCLE_PLANNER_API_FIXTURE_VERSION,
  contract_version: GOAL_CYCLE_CONTRACT_VERSION,
  created_at: DREAM_FIXTURE_CREATED_AT,
  prompt_version: "goal-cycle-planner-prompt-v1",
  routes: {
    hydrate: "GET /api/v1/creator/goal-cycles/:id/planner",
    questions: "POST /api/v1/creator/goal-cycles/:id/planner/questions",
    answers: "POST /api/v1/creator/goal-cycles/:id/planner/answers",
    generate: "POST /api/v1/creator/goal-cycles/:id/planner/generate",
    revise: "POST /api/v1/creator/goal-cycles/:id/planner/revise",
    manual_edit: "POST /api/v1/creator/goal-cycles/:id/planner/manual-edit",
    research: "POST|GET /api/v1/creator/goal-cycles/:id/research"
  },
  hydrate: GOAL_CYCLE_PLANNER_HYDRATE_FIXTURE,
  fallback_plan: GOAL_CYCLE_PLANNER_FALLBACK_PLAN_FIXTURE,
  errors: {
    plan_invalid: GOAL_CYCLE_PLAN_INVALID_FIXTURE,
    limit_exceeded: GOAL_CYCLE_LIMIT_EXCEEDED_FIXTURE,
    no_credit: GOAL_CYCLE_NO_CREDIT_FIXTURE
  }
} as const;
