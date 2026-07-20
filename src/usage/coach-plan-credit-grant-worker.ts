/**
 * Coach Plan credit jobs (VS2-T05): monthly grants + abandoned reservation expiry.
 * Allowance is config-only (RELAY_COACH_PLAN_INCLUDED_CREDITS); never hardcode tier values.
 * Jobs emit counts/reason codes only — no prompts or provider text.
 */

import type { PrismaClient } from "@prisma/client";
import { getGoalCycleFeatureFlags } from "../goal-cycle/contracts.js";
import {
  expireAbandonedCoachPlanReservations,
  grantMonthlyCoachPlanCredits,
  resolveIncludedCoachPlanCredits
} from "./coach-plan-credit-service.js";

export const DEFAULT_COACH_PLAN_GRANT_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const MIN_COACH_PLAN_GRANT_INTERVAL_MS = 60_000;
export const DEFAULT_COACH_PLAN_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;
export const MIN_COACH_PLAN_EXPIRY_INTERVAL_MS = 60_000;

export type CoachPlanCreditGrantCycleResult = {
  cycle_started_at: string;
  period_key: string;
  creators_scanned: number;
  grants_applied: number;
  grants_idempotent: number;
  reason_codes: string[];
  skipped_reason?: string;
};

export type CoachPlanCreditExpiryCycleResult = {
  cycle_started_at: string;
  expired: number;
  reason_codes: string[];
  skipped_reason?: string;
};

export function coachPlanCreditPeriodKeyUtc(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function coachPlanCreditGrantRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  if (!getGoalCycleFeatureFlags(env).enabled) return null;
  if (resolveIncludedCoachPlanCredits(env) == null) return null;
  const raw = env.RELAY_COACH_PLAN_GRANT_INTERVAL_MS?.trim();
  if (raw === "0" || raw === "off") return null;
  if (!raw) return DEFAULT_COACH_PLAN_GRANT_INTERVAL_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MIN_COACH_PLAN_GRANT_INTERVAL_MS) {
    return DEFAULT_COACH_PLAN_GRANT_INTERVAL_MS;
  }
  return n;
}

export function coachPlanCreditExpiryRepeatEveryMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number | null {
  if (!getGoalCycleFeatureFlags(env).enabled) return null;
  const raw = env.RELAY_COACH_PLAN_EXPIRY_INTERVAL_MS?.trim();
  if (raw === "0" || raw === "off") return null;
  if (!raw) return DEFAULT_COACH_PLAN_EXPIRY_INTERVAL_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MIN_COACH_PLAN_EXPIRY_INTERVAL_MS) {
    return DEFAULT_COACH_PLAN_EXPIRY_INTERVAL_MS;
  }
  return n;
}

/**
 * Idempotent monthly grant sweep. No-ops when Goal Cycle is off or included credits unset.
 */
export async function runCoachPlanCreditGrantOnce(
  prisma: PrismaClient,
  options: {
    creatorId?: string;
    now?: Date;
    env?: NodeJS.ProcessEnv;
    log?: (msg: string, ctx?: Record<string, unknown>) => void;
  } = {}
): Promise<CoachPlanCreditGrantCycleResult> {
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const log = options.log ?? (() => undefined);
  const periodKey = coachPlanCreditPeriodKeyUtc(now);
  const reason_codes: string[] = [];

  if (!getGoalCycleFeatureFlags(env).enabled) {
    log("coach-plan-credit-grant: skipped — goal cycle disabled");
    return {
      cycle_started_at: now.toISOString(),
      period_key: periodKey,
      creators_scanned: 0,
      grants_applied: 0,
      grants_idempotent: 0,
      reason_codes: ["goal_cycle_disabled"],
      skipped_reason: "goal_cycle_disabled"
    };
  }

  const allowance = resolveIncludedCoachPlanCredits(env);
  if (allowance == null || allowance <= 0) {
    log("coach-plan-credit-grant: skipped — included credits not configured");
    return {
      cycle_started_at: now.toISOString(),
      period_key: periodKey,
      creators_scanned: 0,
      grants_applied: 0,
      grants_idempotent: 0,
      reason_codes: ["allowance_unconfigured"],
      skipped_reason: "allowance_unconfigured"
    };
  }

  const creatorIds: string[] = [];
  if (options.creatorId?.trim()) {
    creatorIds.push(options.creatorId.trim());
  } else {
    const tenants = await prisma.tenant.findMany({
      where: { relayCreatorId: { not: null } },
      select: { relayCreatorId: true },
      take: 5000
    });
    for (const t of tenants) {
      const id = t.relayCreatorId?.trim();
      if (id) creatorIds.push(id);
    }
  }

  let grants_applied = 0;
  let grants_idempotent = 0;
  for (const creatorId of creatorIds) {
    try {
      const result = await grantMonthlyCoachPlanCredits(prisma, {
        creatorId,
        periodKey,
        allowance,
        idempotencyKey: `grant:monthly:${creatorId}:${periodKey}`,
        now
      });
      if (result.idempotent) {
        grants_idempotent += 1;
        reason_codes.push("grant_idempotent");
      } else {
        grants_applied += 1;
        reason_codes.push("grant_applied");
      }
    } catch (err) {
      reason_codes.push("grant_error");
      log("coach-plan-credit-grant: creator failed", {
        creator_id: creatorId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return {
    cycle_started_at: now.toISOString(),
    period_key: periodKey,
    creators_scanned: creatorIds.length,
    grants_applied,
    grants_idempotent,
    reason_codes
  };
}

/** Recover abandoned reservations past TTL. */
export async function runCoachPlanCreditExpiryOnce(
  prisma: PrismaClient,
  options: {
    now?: Date;
    batchSize?: number;
    env?: NodeJS.ProcessEnv;
    log?: (msg: string, ctx?: Record<string, unknown>) => void;
  } = {}
): Promise<CoachPlanCreditExpiryCycleResult> {
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const log = options.log ?? (() => undefined);

  if (!getGoalCycleFeatureFlags(env).enabled) {
    log("coach-plan-credit-expiry: skipped — goal cycle disabled");
    return {
      cycle_started_at: now.toISOString(),
      expired: 0,
      reason_codes: ["goal_cycle_disabled"],
      skipped_reason: "goal_cycle_disabled"
    };
  }

  const result = await expireAbandonedCoachPlanReservations(prisma, {
    now,
    batchSize: options.batchSize ?? 50
  });
  log("coach-plan-credit-expiry: tick", {
    expired: result.expired,
    reason_codes: result.reason_codes
  });
  return {
    cycle_started_at: now.toISOString(),
    expired: result.expired,
    reason_codes: result.reason_codes
  };
}
