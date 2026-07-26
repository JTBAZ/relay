/**
 * @fileoverview Map Stripe price IDs ↔ CreatorPlan / FanPlan (no hardcoded dollar amounts).
 * @see docs/BILLING_SPINE_BUILD_PLAN.md, docs/FAN_PREMIUM_BUILD_PLAN.md
 */

import { CreatorPlan, FanPlan } from "@prisma/client";
import {
  resolveBillingConfig,
  type BillingServiceConfig,
  type ResolvedBillingConfig
} from "./config.js";
import { isPaidFanPlanId, type FanPlanId } from "./fan-plan-config.js";

export const CREATOR_PLANS = [
  CreatorPlan.studio_core,
  CreatorPlan.autopost,
  CreatorPlan.growth_engine
] as const;

export type CreatorPlanId = (typeof CREATOR_PLANS)[number];

export type PaidFanPlanId = "supporter" | "curator";

export function isCreatorPlanId(value: unknown): value is CreatorPlanId {
  return (
    typeof value === "string" &&
    (CREATOR_PLANS as readonly string[]).includes(value)
  );
}

export function priceIdForCreatorPlan(
  plan: CreatorPlanId,
  cfg: ResolvedBillingConfig
): string | null {
  switch (plan) {
    case CreatorPlan.studio_core:
      return cfg.priceStudioCore;
    case CreatorPlan.autopost:
      return cfg.priceAutopost;
    case CreatorPlan.growth_engine:
      return cfg.priceGrowthEngine;
    default:
      return null;
  }
}

export function priceIdForFanPlan(
  plan: PaidFanPlanId,
  cfg: ResolvedBillingConfig
): string | null {
  switch (plan) {
    case "supporter":
      return cfg.priceSupporter;
    case "curator":
      return cfg.priceCurator;
    default:
      return null;
  }
}

export function creatorPlanFromPriceId(
  priceId: string | null | undefined,
  cfg: ResolvedBillingConfig = resolveBillingConfig({}, process.env, () => undefined)
): CreatorPlan | null {
  const id = priceId?.trim() ?? "";
  if (!id) return null;
  if (cfg.priceStudioCore && id === cfg.priceStudioCore) return CreatorPlan.studio_core;
  if (cfg.priceAutopost && id === cfg.priceAutopost) return CreatorPlan.autopost;
  if (cfg.priceGrowthEngine && id === cfg.priceGrowthEngine) {
    return CreatorPlan.growth_engine;
  }
  return null;
}

export function fanPlanFromPriceId(
  priceId: string | null | undefined,
  cfg: ResolvedBillingConfig = resolveBillingConfig({}, process.env, () => undefined)
): FanPlan | null {
  const id = priceId?.trim() ?? "";
  if (!id) return null;
  if (cfg.priceSupporter && id === cfg.priceSupporter) return FanPlan.supporter;
  if (cfg.priceCurator && id === cfg.priceCurator) return FanPlan.curator;
  return null;
}

export function resolveBillingConfigForPlans(
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): ResolvedBillingConfig {
  return resolveBillingConfig(overrides, env, () => undefined);
}

export function paidFanPlanFromUnknown(value: unknown): PaidFanPlanId | null {
  if (isPaidFanPlanId(value)) return value;
  return null;
}

export type { FanPlanId };
