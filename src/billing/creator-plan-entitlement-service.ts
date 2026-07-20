/**
 * @fileoverview Creator plan entitlement resolution + gates (billing spine MB-2/MB-3).
 * @see docs/BILLING_SPINE_BUILD_PLAN.md
 */

import {
  CreatorPlan,
  SubscriptionStatus,
  type PrismaClient
} from "@prisma/client";

const ACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.active,
  SubscriptionStatus.trialing
];

const PLAN_RANK: Record<CreatorPlan, number> = {
  [CreatorPlan.studio_core]: 1,
  [CreatorPlan.autopost]: 2,
  [CreatorPlan.growth_engine]: 3
};

export type ResolveCreatorPlanResult = {
  plan: CreatorPlan | null;
  source: "operator_grant" | "pilot" | "stripe" | null;
};

export type PlanGateResult =
  | { ok: true; plan: CreatorPlan | null }
  | { ok: false; error: "plan_required"; required_plan: CreatorPlan };

/**
 * Resolve the effective creator plan and persist a degraded-mode snapshot.
 * Reads Postgres only — never calls Stripe.
 */
export async function resolveCreatorPlan(
  prisma: PrismaClient,
  creatorId: string
): Promise<ResolveCreatorPlanResult> {
  const id = creatorId.trim();
  if (!id) {
    return { plan: null, source: null };
  }

  const now = new Date();
  const existing = await prisma.creatorPlanEntitlement.findUnique({
    where: { creatorId: id }
  });

  if (
    existing &&
    (existing.source === "operator_grant" || existing.source === "pilot") &&
    (existing.expiresAt == null || existing.expiresAt > now)
  ) {
    return {
      plan: existing.plan,
      source: existing.source as "operator_grant" | "pilot"
    };
  }

  const account = await prisma.account.findFirst({
    where: { primaryRelayCreatorId: id },
    select: { id: true }
  });

  let stripePlan: CreatorPlan | null = null;
  if (account) {
    const sub = await prisma.planSubscription.findFirst({
      where: {
        accountId: account.id,
        scope: "creator",
        status: { in: ACTIVE_STATUSES },
        creatorPlan: { not: null }
      },
      orderBy: { updatedAt: "desc" }
    });
    stripePlan = sub?.creatorPlan ?? null;
  }

  if (stripePlan) {
    await prisma.creatorPlanEntitlement.upsert({
      where: { creatorId: id },
      create: {
        creatorId: id,
        plan: stripePlan,
        source: "stripe",
        effectiveAt: now,
        expiresAt: null
      },
      update: {
        plan: stripePlan,
        source: "stripe",
        effectiveAt: now,
        expiresAt: null
      }
    });
    return { plan: stripePlan, source: "stripe" };
  }

  if (existing?.source === "stripe") {
    await prisma.creatorPlanEntitlement.delete({ where: { creatorId: id } }).catch(() => undefined);
  }

  return { plan: null, source: null };
}

/** Snapshot read only — no writes, no Stripe. */
export async function getCreatorPlanEntitlement(
  prisma: PrismaClient,
  creatorId: string
): Promise<{ plan: CreatorPlan; source: string; expires_at: string | null } | null> {
  const row = await prisma.creatorPlanEntitlement.findUnique({
    where: { creatorId: creatorId.trim() }
  });
  if (!row) return null;
  if (row.expiresAt && row.expiresAt <= new Date()) return null;
  return {
    plan: row.plan,
    source: row.source,
    expires_at: row.expiresAt?.toISOString() ?? null
  };
}

export function planMeetsMinimum(
  plan: CreatorPlan | null | undefined,
  required: CreatorPlan
): boolean {
  if (!plan) return false;
  return PLAN_RANK[plan] >= PLAN_RANK[required];
}

/**
 * Server-side plan gate (WI-12). Uses snapshot first (degraded-mode safe), then resolve.
 */
export async function requireCreatorPlanAtLeast(
  prisma: PrismaClient,
  creatorId: string,
  required: CreatorPlan
): Promise<PlanGateResult> {
  const snap = await getCreatorPlanEntitlement(prisma, creatorId);
  if (snap && planMeetsMinimum(snap.plan, required)) {
    return { ok: true, plan: snap.plan };
  }
  const resolved = await resolveCreatorPlan(prisma, creatorId);
  if (planMeetsMinimum(resolved.plan, required)) {
    return { ok: true, plan: resolved.plan };
  }
  return { ok: false, error: "plan_required", required_plan: required };
}

/**
 * Better-tier surface gate: Autopost plan+ OR legacy posting_assistant flag (pilot bridge).
 */
export async function isAutopostBetterAllowed(
  prisma: PrismaClient,
  creatorId: string
): Promise<boolean> {
  const gate = await requireCreatorPlanAtLeast(prisma, creatorId, CreatorPlan.autopost);
  if (gate.ok) return true;
  const flag = await prisma.creatorFeatureFlag.findUnique({
    where: { creatorId: creatorId.trim() },
    select: { postingAssistantEnabled: true }
  });
  return flag?.postingAssistantEnabled === true;
}

export async function grantOperatorCreatorPlan(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    plan: CreatorPlan;
    expiresAt?: Date | null;
    source?: "operator_grant" | "pilot";
  }
): Promise<{ creator_id: string; plan: CreatorPlan; source: string; expires_at: string | null }> {
  const creatorId = args.creatorId.trim();
  const now = new Date();
  const source = args.source ?? "operator_grant";
  const row = await prisma.creatorPlanEntitlement.upsert({
    where: { creatorId },
    create: {
      creatorId,
      plan: args.plan,
      source,
      effectiveAt: now,
      expiresAt: args.expiresAt ?? null
    },
    update: {
      plan: args.plan,
      source,
      effectiveAt: now,
      expiresAt: args.expiresAt === undefined ? undefined : args.expiresAt
    }
  });
  return {
    creator_id: row.creatorId,
    plan: row.plan,
    source: row.source,
    expires_at: row.expiresAt?.toISOString() ?? null
  };
}
