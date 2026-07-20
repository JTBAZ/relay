/**
 * @fileoverview Active Curator status for MB-14 badge + perks.
 * @see docs/FAN_PREMIUM_BUILD_PLAN.md
 */

import { FanPlan, SubscriptionStatus, type PrismaClient } from "@prisma/client";
import { isFanPremiumEnabled } from "../billing/fan-plan-config.js";
import { getActiveFanSubscription } from "../billing/subscription-sync.js";

/** Live check: active/trialing fan sub with plan curator. */
export async function isActiveCuratorForAccount(
  prisma: PrismaClient,
  accountId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  if (!isFanPremiumEnabled(env)) return false;
  const sub = await getActiveFanSubscription(prisma, accountId);
  return sub?.fanPlan === FanPlan.curator;
}

/**
 * Batch: which TenantMembership ids currently belong to active Curators.
 * Used when enriching comment lists (no stale cache — always queried).
 */
export async function activeCuratorMembershipIds(
  prisma: PrismaClient,
  membershipIds: string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!isFanPremiumEnabled(env) || membershipIds.length === 0) return out;

  const unique = [...new Set(membershipIds.filter(Boolean))];
  if (unique.length === 0) return out;

  const memberships = await prisma.tenantMembership.findMany({
    where: { id: { in: unique } },
    select: { id: true, accountId: true }
  });
  if (memberships.length === 0) return out;

  const accountIds = [...new Set(memberships.map((m) => m.accountId))];
  const curatorSubs = await prisma.planSubscription.findMany({
    where: {
      accountId: { in: accountIds },
      scope: "fan",
      status: { in: [SubscriptionStatus.active, SubscriptionStatus.trialing] },
      fanPlan: FanPlan.curator
    },
    select: { accountId: true }
  });
  const curatorAccounts = new Set(curatorSubs.map((s) => s.accountId));
  for (const m of memberships) {
    if (curatorAccounts.has(m.accountId)) out.add(m.id);
  }
  return out;
}

export async function isActiveCuratorForMembership(
  prisma: PrismaClient,
  membershipId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  if (!isFanPremiumEnabled(env)) return false;
  const membership = await prisma.tenantMembership.findUnique({
    where: { id: membershipId },
    select: { accountId: true }
  });
  if (!membership) return false;
  return isActiveCuratorForAccount(prisma, membership.accountId, env);
}
