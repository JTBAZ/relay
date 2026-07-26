/**
 * @fileoverview Creator plan-access presentation wire (MB-15A).
 * Postgres-only — never calls Stripe. Write-path 402 remains authoritative.
 * @see docs/FRONTEND_MONETIZATION_BUILD_PLAN.md
 */

import { CreatorPlan, type PrismaClient } from "@prisma/client";
import {
  getCreatorPlanEntitlement,
  planMeetsMinimum,
  resolveCreatorPlan
} from "./creator-plan-entitlement-service.js";
import { getCreatorSubscriptionWire } from "./subscription-sync.js";
import { isPostingAssistantAllowedForCreator } from "../creator/creator-feature-flags-service.js";

export type CreatorPlanIdWire = "studio_core" | "autopost" | "growth_engine";

export type CreatorCapabilityReason =
  | "included"
  | "operator_grant"
  | "pilot"
  | "legacy_feature_flag"
  | "plan_required"
  | "billing_past_due"
  | "feature_not_shipped";

export type CreatorCapabilityWire = {
  allowed: boolean;
  required_plan: CreatorPlanIdWire;
  reason: CreatorCapabilityReason;
};

export type CreatorPlanAccessWire = {
  effective_plan: CreatorPlanIdWire | null;
  entitlement_source: "stripe" | "operator_grant" | "pilot" | null;
  entitlement_expires_at: string | null;
  billing: {
    plan: CreatorPlanIdWire | null;
    status: "active" | "past_due" | "canceled" | "incomplete" | "trialing" | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  };
  capabilities: {
    studio_core: CreatorCapabilityWire;
    autopost: CreatorCapabilityWire;
    posting_assistant: CreatorCapabilityWire;
    growth_engine: CreatorCapabilityWire;
  };
};

function asPlanId(plan: CreatorPlan | string | null | undefined): CreatorPlanIdWire | null {
  if (
    plan === CreatorPlan.studio_core ||
    plan === CreatorPlan.autopost ||
    plan === CreatorPlan.growth_engine
  ) {
    return plan;
  }
  return null;
}

function sourceReason(
  source: string | null | undefined
): "included" | "operator_grant" | "pilot" {
  if (source === "operator_grant") return "operator_grant";
  if (source === "pilot") return "pilot";
  return "included";
}

function capabilityForPlan(
  effectivePlan: CreatorPlan | null,
  source: string | null,
  required: CreatorPlan,
  billingStatus: string | null,
  billingPlan: CreatorPlan | null
): CreatorCapabilityWire {
  const requiredId = required as CreatorPlanIdWire;
  const allowed = planMeetsMinimum(effectivePlan, required);
  if (allowed) {
    return {
      allowed: true,
      required_plan: requiredId,
      reason: sourceReason(source)
    };
  }
  if (
    billingStatus === "past_due" &&
    planMeetsMinimum(billingPlan, required)
  ) {
    return {
      allowed: false,
      required_plan: requiredId,
      reason: "billing_past_due"
    };
  }
  return {
    allowed: false,
    required_plan: requiredId,
    reason: "plan_required"
  };
}

/**
 * Build the MB-15A presentation wire from entitlement snapshot + subscription mirror +
 * posting-assistant bridge. Does not call Stripe.
 */
export async function getCreatorPlanAccessWire(
  prisma: PrismaClient,
  args: { creatorId: string; accountId: string }
): Promise<CreatorPlanAccessWire> {
  const creatorId = args.creatorId.trim();

  // Prefer snapshot for degraded-mode reads; resolve once to refresh stripe snapshot when needed.
  let snap = await getCreatorPlanEntitlement(prisma, creatorId);
  if (!snap) {
    const resolved = await resolveCreatorPlan(prisma, creatorId);
    if (resolved.plan) {
      snap = {
        plan: resolved.plan,
        source: resolved.source ?? "stripe",
        expires_at: null
      };
    }
  } else if (snap.source === "stripe") {
    // Keep stripe snapshot fresh when grants are absent.
    const resolved = await resolveCreatorPlan(prisma, creatorId);
    if (resolved.plan) {
      snap = {
        plan: resolved.plan,
        source: resolved.source ?? "stripe",
        expires_at: null
      };
    } else {
      snap = null;
    }
  }

  const billingWire = await getCreatorSubscriptionWire(prisma, args.accountId);
  const billingPlan =
    "plan" in billingWire && billingWire.plan ? billingWire.plan : null;
  const billingStatus =
    "status" in billingWire && typeof billingWire.status === "string"
      ? billingWire.status
      : null;
  const billingPeriodEnd =
    "current_period_end" in billingWire ? billingWire.current_period_end : null;
  const cancelAtPeriodEnd =
    "cancel_at_period_end" in billingWire ? billingWire.cancel_at_period_end : false;

  const effectivePlan = snap?.plan ?? null;
  const entitlementSource =
    snap?.source === "operator_grant" || snap?.source === "pilot" || snap?.source === "stripe"
      ? snap.source
      : null;

  const studio_core = capabilityForPlan(
    effectivePlan,
    entitlementSource,
    CreatorPlan.studio_core,
    billingStatus,
    billingPlan
  );
  const autopost = capabilityForPlan(
    effectivePlan,
    entitlementSource,
    CreatorPlan.autopost,
    billingStatus,
    billingPlan
  );

  const postingAllowed = await isPostingAssistantAllowedForCreator(prisma, creatorId);
  let posting_assistant: CreatorCapabilityWire;
  if (postingAllowed) {
    if (planMeetsMinimum(effectivePlan, CreatorPlan.autopost)) {
      posting_assistant = {
        allowed: true,
        required_plan: "autopost",
        reason: sourceReason(entitlementSource)
      };
    } else {
      posting_assistant = {
        allowed: true,
        required_plan: "autopost",
        reason: "legacy_feature_flag"
      };
    }
  } else if (
    billingStatus === "past_due" &&
    planMeetsMinimum(billingPlan, CreatorPlan.autopost)
  ) {
    posting_assistant = {
      allowed: false,
      required_plan: "autopost",
      reason: "billing_past_due"
    };
  } else {
    posting_assistant = {
      allowed: false,
      required_plan: "autopost",
      reason: "plan_required"
    };
  }

  const growth_engine: CreatorCapabilityWire = {
    allowed: false,
    required_plan: "growth_engine",
    reason: "feature_not_shipped"
  };

  return {
    effective_plan: asPlanId(effectivePlan),
    entitlement_source: entitlementSource,
    entitlement_expires_at: snap?.expires_at ?? null,
    billing: {
      plan: asPlanId(billingPlan),
      status: (billingStatus as CreatorPlanAccessWire["billing"]["status"]) ?? null,
      current_period_end: billingPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd
    },
    capabilities: {
      studio_core,
      autopost,
      posting_assistant,
      growth_engine
    }
  };
}
