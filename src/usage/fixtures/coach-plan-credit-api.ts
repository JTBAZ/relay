/**
 * Coach Plan credit API fixtures (VS2-T04).
 * No top-up CTA — topups_available stays false.
 */

import type { CoachPlanCreditStatus } from "../../goal-cycle/contracts.js";
import { GOAL_CYCLE_CONTRACT_VERSION } from "../../goal-cycle/contracts.js";

export const COACH_PLAN_CREDIT_API_FIXTURE_VERSION = "coach-plan-credit-api-v1" as const;

export type CoachPlanNoCreditMessageFixture = {
  code: "GOAL_CYCLE_NO_CREDIT";
  title: string;
  body: string;
  preserve_context: true;
  topup_cta: false;
};

export const COACH_PLAN_CREDIT_STATUS_ZERO_FIXTURE: CoachPlanCreditStatus = {
  enabled: true,
  available: 0,
  reserved: 0,
  included_per_period: null,
  period_started_at: null,
  period_ends_at: null,
  next_grant_at: null,
  topups_available: false
};

export const COACH_PLAN_CREDIT_STATUS_AVAILABLE_FIXTURE: CoachPlanCreditStatus = {
  enabled: true,
  available: 1,
  reserved: 0,
  included_per_period: null,
  period_started_at: null,
  period_ends_at: null,
  next_grant_at: null,
  topups_available: false
};

export const COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE: CoachPlanNoCreditMessageFixture = {
  code: "GOAL_CYCLE_NO_CREDIT",
  title: "No Coach Plan credit available",
  body: "Your Goal context is saved. One credit covers research, one Plan, and up to two revisions. Complete silence is free.",
  preserve_context: true,
  topup_cta: false
};

export const COACH_PLAN_CREDIT_API_FIXTURES = {
  fixture_id: COACH_PLAN_CREDIT_API_FIXTURE_VERSION,
  contract_version: GOAL_CYCLE_CONTRACT_VERSION,
  status_zero: COACH_PLAN_CREDIT_STATUS_ZERO_FIXTURE,
  status_available: COACH_PLAN_CREDIT_STATUS_AVAILABLE_FIXTURE,
  no_credit_message: COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE
} as const;
