/**
 * @fileoverview Fan plan parameters (MB-9). Single source for allowances, windows, caps.
 * @see docs/FAN_PREMIUM_BUILD_PLAN.md
 */

import type { FanPlan } from "@prisma/client";

export type FanPlanId = "free" | "supporter" | "curator";

export type FanPlanParams = {
  plan: FanPlanId;
  monthlyTips: number;
  revealWindowDays: number | null;
  freePreviewWindowDays: number;
  rolloverCap: number | null;
};

export const RELOAD_PACK_TIPS = 10;

const FAN_PLAN_TABLE: Record<FanPlanId, FanPlanParams> = {
  free: {
    plan: "free",
    monthlyTips: 0,
    revealWindowDays: null,
    freePreviewWindowDays: 7,
    rolloverCap: null
  },
  supporter: {
    plan: "supporter",
    monthlyTips: 5,
    revealWindowDays: 14,
    freePreviewWindowDays: 7,
    rolloverCap: 10
  },
  curator: {
    plan: "curator",
    monthlyTips: 15,
    revealWindowDays: 30,
    freePreviewWindowDays: 14,
    rolloverCap: 30
  }
};

export function isFanPlanId(value: unknown): value is FanPlanId {
  return value === "free" || value === "supporter" || value === "curator";
}

export function isPaidFanPlanId(value: unknown): value is "supporter" | "curator" {
  return value === "supporter" || value === "curator";
}

export function fanPlanParams(plan: FanPlanId | FanPlan | null | undefined): FanPlanParams {
  if (plan === "supporter") return FAN_PLAN_TABLE.supporter;
  if (plan === "curator") return FAN_PLAN_TABLE.curator;
  return FAN_PLAN_TABLE.free;
}

export function allFanPlanParams(): FanPlanParams[] {
  return [FAN_PLAN_TABLE.free, FAN_PLAN_TABLE.supporter, FAN_PLAN_TABLE.curator];
}

function envTruthy(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Master switch for fan premium (MB-9). Default off — Tip beta behavior persists. */
export function isFanPremiumEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envTruthy(env.RELAY_FAN_PREMIUM_ENABLED);
}
