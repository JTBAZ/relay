/**
 * @fileoverview Sync Stripe subscription objects → PlanSubscription + entitlement snapshot (MB-2).
 * @see docs/BILLING_SPINE_BUILD_PLAN.md
 */

import {
  CreatorPlan,
  FanPlan,
  SubscriptionStatus,
  type PrismaClient
} from "@prisma/client";
import type Stripe from "stripe";
import { resolveCreatorPlan } from "./creator-plan-entitlement-service.js";
import {
  resolveBillingConfig,
  type BillingServiceConfig,
  type ResolvedBillingConfig
} from "./config.js";
import {
  creatorPlanFromPriceId,
  fanPlanFromPriceId,
  isCreatorPlanId
} from "./plan-price-map.js";
import { isPaidFanPlanId } from "./fan-plan-config.js";

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return SubscriptionStatus.active;
    case "past_due":
      return SubscriptionStatus.past_due;
    case "canceled":
      return SubscriptionStatus.canceled;
    case "incomplete":
    case "incomplete_expired":
      return SubscriptionStatus.incomplete;
    case "trialing":
      return SubscriptionStatus.trialing;
    case "unpaid":
    case "paused":
      return SubscriptionStatus.past_due;
    default:
      return SubscriptionStatus.incomplete;
  }
}

function extractPriceId(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  if (!price) return null;
  return typeof price === "string" ? price : price.id;
}

function extractAccountId(sub: Stripe.Subscription): string | null {
  const fromMeta = sub.metadata?.relay_account_id?.trim();
  if (fromMeta) return fromMeta;
  return null;
}

function extractCreatorId(sub: Stripe.Subscription): string | null {
  return sub.metadata?.relay_creator_id?.trim() || null;
}

function extractCreatorPlanHint(sub: Stripe.Subscription): CreatorPlan | null {
  const hint = sub.metadata?.creator_plan?.trim();
  if (hint && isCreatorPlanId(hint)) return hint;
  return null;
}

export type SyncSubscriptionResult = {
  planSubscriptionId: string;
  accountId: string;
  creatorId: string | null;
  scope: "creator" | "fan";
  plan: CreatorPlan | null;
  fanPlan: FanPlan | null;
  status: SubscriptionStatus;
};

function extractFanPlanHint(sub: Stripe.Subscription): FanPlan | null {
  const hint = sub.metadata?.fan_plan?.trim();
  if (hint && isPaidFanPlanId(hint)) {
    return hint === "supporter" ? FanPlan.supporter : FanPlan.curator;
  }
  return null;
}

function extractScope(sub: Stripe.Subscription): "creator" | "fan" {
  const scope = sub.metadata?.scope?.trim();
  if (scope === "fan") return "fan";
  return "creator";
}

function extractPeriodBounds(sub: Stripe.Subscription): { start: Date; end: Date } {
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;
  const startSec =
    item?.current_period_start ??
    (sub as unknown as { current_period_start?: number }).current_period_start;
  const endSec =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    start: new Date((startSec ?? nowSec) * 1000),
    end: new Date((endSec ?? nowSec + 30 * 24 * 3600) * 1000)
  };
}

/**
 * Upsert local PlanSubscription from a Stripe Subscription object, then refresh entitlement.
 */
export async function syncSubscriptionFromStripe(
  prisma: PrismaClient,
  stripeSubscription: Stripe.Subscription,
  overrides: BillingServiceConfig = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<SyncSubscriptionResult | null> {
  const cfg: ResolvedBillingConfig = resolveBillingConfig(
    overrides,
    env,
    () => undefined
  );

  let accountId = extractAccountId(stripeSubscription);
  const customerId =
    typeof stripeSubscription.customer === "string"
      ? stripeSubscription.customer
      : stripeSubscription.customer?.id;

  if (!accountId && customerId) {
    const bc = await prisma.billingCustomer.findFirst({
      where: { stripeCustomerId: customerId }
    });
    accountId = bc?.accountId ?? null;
  }
  if (!accountId) {
    return null;
  }

  const priceId = extractPriceId(stripeSubscription);
  const fanPlanFromPrice = fanPlanFromPriceId(priceId, cfg);
  const fanPlanHint = extractFanPlanHint(stripeSubscription);
  const scopeFromMeta = extractScope(stripeSubscription);
  const scope: "creator" | "fan" =
    Boolean(fanPlanFromPrice) || Boolean(fanPlanHint) || scopeFromMeta === "fan"
      ? "fan"
      : "creator";

  const creatorPlan =
    scope === "creator"
      ? creatorPlanFromPriceId(priceId, cfg) ?? extractCreatorPlanHint(stripeSubscription)
      : null;
  const fanPlan =
    scope === "fan" ? fanPlanFromPrice ?? fanPlanHint ?? FanPlan.supporter : null;

  const status = mapStripeSubscriptionStatus(stripeSubscription.status);
  const { start: periodStart, end: periodEnd } = extractPeriodBounds(stripeSubscription);

  const row = await prisma.planSubscription.upsert({
    where: { stripeSubscriptionId: stripeSubscription.id },
    create: {
      accountId,
      scope,
      creatorPlan,
      fanPlan,
      stripeSubscriptionId: stripeSubscription.id,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end === true
    },
    update: {
      accountId,
      scope,
      creatorPlan,
      fanPlan,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end === true
    }
  });

  let creatorId: string | null = null;
  if (scope === "creator") {
    creatorId = extractCreatorId(stripeSubscription);
    if (!creatorId) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { primaryRelayCreatorId: true }
      });
      creatorId = account?.primaryRelayCreatorId ?? null;
    }
    if (creatorId) {
      await resolveCreatorPlan(prisma, creatorId);
    }
  }

  return {
    planSubscriptionId: row.id,
    accountId,
    creatorId,
    scope,
    plan: creatorPlan,
    fanPlan,
    status
  };
}

export async function markSubscriptionPastDue(
  prisma: PrismaClient,
  stripeSubscriptionId: string
): Promise<void> {
  const existing = await prisma.planSubscription.findUnique({
    where: { stripeSubscriptionId }
  });
  if (!existing) return;
  await prisma.planSubscription.update({
    where: { stripeSubscriptionId },
    data: { status: SubscriptionStatus.past_due }
  });
  const account = await prisma.account.findUnique({
    where: { id: existing.accountId },
    select: { primaryRelayCreatorId: true }
  });
  if (account?.primaryRelayCreatorId) {
    await resolveCreatorPlan(prisma, account.primaryRelayCreatorId);
  }
}

export async function getCreatorSubscriptionWire(
  prisma: PrismaClient,
  accountId: string
): Promise<{
  scope: string;
  plan: CreatorPlan | null;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
} | { plan: null }> {
  const sub = await prisma.planSubscription.findFirst({
    where: { accountId, scope: "creator" },
    orderBy: { updatedAt: "desc" }
  });
  if (!sub) {
    return { plan: null };
  }
  return {
    scope: sub.scope,
    plan: sub.creatorPlan,
    status: sub.status,
    current_period_end: sub.currentPeriodEnd.toISOString(),
    cancel_at_period_end: sub.cancelAtPeriodEnd
  };
}

export async function getActiveFanSubscription(
  prisma: PrismaClient,
  accountId: string
): Promise<{
  fanPlan: FanPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
} | null> {
  const sub = await prisma.planSubscription.findFirst({
    where: {
      accountId,
      scope: "fan",
      status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing] },
      fanPlan: { not: null }
    },
    orderBy: { updatedAt: "desc" }
  });
  if (!sub?.fanPlan) return null;
  return {
    fanPlan: sub.fanPlan,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd
  };
}

export async function getFanSubscriptionWire(
  prisma: PrismaClient,
  accountId: string
): Promise<{
  scope: "fan";
  plan: FanPlan | null;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
} | { plan: null }> {
  const sub = await prisma.planSubscription.findFirst({
    where: { accountId, scope: "fan" },
    orderBy: { updatedAt: "desc" }
  });
  if (!sub) {
    return { plan: null };
  }
  return {
    scope: "fan",
    plan: sub.fanPlan,
    status: sub.status,
    current_period_end: sub.currentPeriodEnd.toISOString(),
    cancel_at_period_end: sub.cancelAtPeriodEnd
  };
}
