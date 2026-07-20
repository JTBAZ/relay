/**
 * Shared planner API error fixtures (VS5 exit freeze).
 */

export type GoalCyclePlannerApiErrorFixture = {
  status: number;
  code: string;
  message: string;
  details?: Array<{ field: string; issue: string }>;
};

export const GOAL_CYCLE_PLAN_INVALID_FIXTURE: GoalCyclePlannerApiErrorFixture = {
  status: 400,
  code: "GOAL_CYCLE_PLAN_INVALID",
  message: "Plan failed validation.",
  details: [{ field: "slots", issue: "unknown_evidence_ref" }]
};

export const GOAL_CYCLE_LIMIT_EXCEEDED_FIXTURE: GoalCyclePlannerApiErrorFixture = {
  status: 409,
  code: "GOAL_CYCLE_LIMIT_EXCEEDED",
  message: "At most 2 AI revisions are allowed.",
  details: [{ field: "ai_revision_count", issue: "max_exceeded" }]
};

export const GOAL_CYCLE_NO_CREDIT_FIXTURE: GoalCyclePlannerApiErrorFixture = {
  status: 402,
  code: "GOAL_CYCLE_NO_CREDIT",
  message: "No Coach Plan credit available.",
  details: [{ field: "credit", issue: "insufficient" }]
};
