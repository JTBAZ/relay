/**
 * P5a-ins-003 — Creator membership KPIs from `CreatorMembershipEvent` + live patron tier distribution.
 */
import {
  CreatorMembershipEventType,
  type PrismaClient,
  TenantRole
} from "@prisma/client";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../patreon/relay-access-tiers.js";

export type CreatorMembershipKpis = {
  window: {
    days: number;
    start: string;
    end: string;
  };
  /** Patrons with at least one paid tier (same notion as patron-tier-summary). */
  active_paying_members: number;
  free_patrons: number;
  total_patrons: number;
  events_in_window: {
    join: number;
    rejoin: number;
    upgrade: number;
    downgrade: number;
    cancel: number;
  };
  adds_in_window: number;
  cancels_in_window: number;
  /** join + rejoin − cancel (in the selected window). */
  net_growth_events: number;
  tier_breakdown: Array<{
    tier_id: string;
    title: string;
    amount_cents: number | null;
    patron_count: number;
  }>;
  estimated_from_sync: boolean;
};

/**
 * @param relayCreatorId — `Tenant.relayCreatorId` / studio scope.
 * @returns `null` when no tenant exists for this creator.
 */
export async function getCreatorMembershipKpis(
  prisma: PrismaClient,
  relayCreatorId: string,
  windowDays: number
): Promise<CreatorMembershipKpis | null> {
  const days = Math.min(Math.max(Math.floor(windowDays), 1), 366);
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);

  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId },
    select: { id: true }
  });
  if (!tenant) {
    return null;
  }

  const eventWhere = {
    creatorId: relayCreatorId,
    occurredAt: { gte: start, lte: end }
  } as const;

  const [
    memberships,
    tiers,
    joinCt,
    rejoinCt,
    upgradeCt,
    downgradeCt,
    cancelCt
  ] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { tenantId: tenant.id, role: TenantRole.patron },
      select: { tierIds: true }
    }),
    prisma.tier.findMany({
      where: { creatorId: relayCreatorId },
      select: {
        id: true,
        relayTierId: true,
        title: true,
        amountCents: true
      },
      orderBy: [{ amountCents: "asc" }, { title: "asc" }]
    }),
    prisma.creatorMembershipEvent.count({
      where: { ...eventWhere, eventType: CreatorMembershipEventType.join }
    }),
    prisma.creatorMembershipEvent.count({
      where: { ...eventWhere, eventType: CreatorMembershipEventType.rejoin }
    }),
    prisma.creatorMembershipEvent.count({
      where: { ...eventWhere, eventType: CreatorMembershipEventType.upgrade }
    }),
    prisma.creatorMembershipEvent.count({
      where: { ...eventWhere, eventType: CreatorMembershipEventType.downgrade }
    }),
    prisma.creatorMembershipEvent.count({
      where: { ...eventWhere, eventType: CreatorMembershipEventType.cancel }
    })
  ]);

  const pseudoTierIds = new Set([RELAY_TIER_PUBLIC, RELAY_TIER_ALL_PATRONS]);
  const isRealPaidTier = (tier: {
    relayTierId: string;
    title: string;
    amountCents: number | null;
  }) => {
    const title = tier.title.trim().toLowerCase();
    if (pseudoTierIds.has(tier.relayTierId)) return false;
    if (title === "public" || title === "free" || title === "all patrons") {
      return false;
    }
    return (tier.amountCents ?? 0) > 0;
  };
  const realPaidTierIds = new Set(
    tiers
      .filter(isRealPaidTier)
      .flatMap((tier) => [tier.relayTierId, tier.id])
  );

  const countsByTierId = new Map<string, number>();
  let freeCount = 0;
  for (const membership of memberships) {
    const tierIds = membership.tierIds.filter((tierId) =>
      realPaidTierIds.has(tierId.trim())
    );
    if (tierIds.length === 0) {
      freeCount += 1;
      continue;
    }
    for (const tierId of new Set(tierIds)) {
      countsByTierId.set(tierId, (countsByTierId.get(tierId) ?? 0) + 1);
    }
  }

  const tierBreakdown = tiers
    .filter(isRealPaidTier)
    .map((tier) => ({
      tier_id: tier.relayTierId,
      title: tier.title,
      amount_cents: tier.amountCents,
      patron_count:
        countsByTierId.get(tier.relayTierId) ??
        countsByTierId.get(tier.id) ??
        0
    }));

  const adds = joinCt + rejoinCt;
  const eventLedgerRows = await prisma.creatorMembershipEvent.count({
    where: { creatorId: relayCreatorId }
  });

  return {
    window: {
      days,
      start: start.toISOString(),
      end: end.toISOString()
    },
    active_paying_members: memberships.length - freeCount,
    free_patrons: freeCount,
    total_patrons: memberships.length,
    events_in_window: {
      join: joinCt,
      rejoin: rejoinCt,
      upgrade: upgradeCt,
      downgrade: downgradeCt,
      cancel: cancelCt
    },
    adds_in_window: adds,
    cancels_in_window: cancelCt,
    net_growth_events: adds - cancelCt,
    tier_breakdown: tierBreakdown,
    estimated_from_sync: eventLedgerRows > 0
  };
}
