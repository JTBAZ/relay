/**
 * P5a-ins-005 — Per-tier tenure + churn proxy from `CreatorMembershipEvent` replay.
 */
import {
  CreatorMembershipEventType,
  type PrismaClient
} from "@prisma/client";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../patreon/relay-access-tiers.js";

export type TierStickinessRow = {
  tier_id: string;
  title: string;
  amount_cents: number | null;
  /** Members still "paid" in ledger replay with this tier in their current set. */
  member_count: number;
  /** Median whole days on this tier in the current stint (`null` if no members). */
  median_tenure_days: number | null;
  /**
   * Cancels in the window whose ledger payload listed this tier in `prior_tiers`,
   * divided by `max(1, member_count + cancel_events_in_window)`.
   */
  churn_proxy: number;
  cancel_events_in_window: number;
};

export type TierStickinessReport = {
  as_of: string;
  window_days: number;
  tiers: TierStickinessRow[];
  estimated_from_sync: boolean;
  note: string;
};

function readStringArray(payload: unknown, key: string): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const v = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((x): x is string => typeof x === "string");
}

function medianSorted(nums: number[]): number | null {
  if (nums.length === 0) {
    return null;
  }
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

type RawEv = {
  eventType: CreatorMembershipEventType;
  occurredAt: Date;
  tierId: string | null;
  payload: unknown;
};

/** Replay membership ledger into current paid flag, tier keys, and last-enter time per tier (current stint). */
export function replayMemberTierLedger(
  events: RawEv[],
  asOfMs: number
): {
  paid: boolean;
  tierIds: Set<string>;
  lastEnteredAt: Map<string, number>;
} {
  const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  let paid = false;
  let tierIds = new Set<string>();
  const lastEnteredAt = new Map<string, number>();

  for (const e of sorted) {
    const atMs = e.occurredAt.getTime();
    if (atMs > asOfMs) {
      break;
    }
    const prevTiers = tierIds;

    if (
      e.eventType === CreatorMembershipEventType.join ||
      e.eventType === CreatorMembershipEventType.rejoin
    ) {
      paid = true;
      tierIds = e.tierId?.trim() ? new Set([e.tierId.trim()]) : new Set();
      for (const t of tierIds) {
        if (!prevTiers.has(t)) {
          lastEnteredAt.set(t, atMs);
        }
      }
      continue;
    }

    if (
      e.eventType === CreatorMembershipEventType.upgrade ||
      e.eventType === CreatorMembershipEventType.downgrade
    ) {
      paid = true;
      const to = readStringArray(e.payload, "to_tiers");
      tierIds = new Set(to.map((x) => x.trim()).filter(Boolean));
      for (const t of tierIds) {
        if (!prevTiers.has(t)) {
          lastEnteredAt.set(t, atMs);
        }
      }
      continue;
    }

    if (e.eventType === CreatorMembershipEventType.cancel) {
      paid = false;
      tierIds = new Set();
      continue;
    }
  }

  return { paid, tierIds, lastEnteredAt };
}

function isRealPaidTierRow(tier: {
  relayTierId: string;
  title: string;
  amountCents: number | null;
}): boolean {
  const pseudo = new Set([RELAY_TIER_PUBLIC, RELAY_TIER_ALL_PATRONS]);
  const title = tier.title.trim().toLowerCase();
  if (pseudo.has(tier.relayTierId)) {
    return false;
  }
  if (title === "public" || title === "free" || title === "all patrons") {
    return false;
  }
  return (tier.amountCents ?? 0) > 0;
}

/**
 * @returns `null` if creator tenant is missing.
 */
export async function getCreatorTierStickiness(
  prisma: PrismaClient,
  relayCreatorId: string,
  windowDays: number,
  options?: { asOf?: Date }
): Promise<TierStickinessReport | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId },
    select: { id: true }
  });
  if (!tenant) {
    return null;
  }

  const days = Math.min(Math.max(Math.floor(windowDays), 1), 366);
  const asOf = options?.asOf ?? new Date();
  const asOfMs = asOf.getTime();
  const windowStartMs = asOfMs - days * 86_400_000;

  const [tierRows, ledgerRows, ledgerAny] = await Promise.all([
    prisma.tier.findMany({
      where: { creatorId: relayCreatorId },
      select: {
        relayTierId: true,
        title: true,
        amountCents: true
      },
      orderBy: [{ amountCents: "asc" }, { title: "asc" }]
    }),
    prisma.creatorMembershipEvent.findMany({
      where: { creatorId: relayCreatorId },
      select: {
        patreonMemberId: true,
        eventType: true,
        occurredAt: true,
        tierId: true,
        payload: true
      },
      orderBy: [{ patreonMemberId: "asc" }, { occurredAt: "asc" }]
    }),
    prisma.creatorMembershipEvent.count({ where: { creatorId: relayCreatorId } })
  ]);

  const paidTierRows = tierRows.filter(isRealPaidTierRow);
  const titleByTier = new Map(
    paidTierRows.map((t) => [t.relayTierId, { title: t.title, amount: t.amountCents }])
  );

  const byMember = new Map<string, RawEv[]>();
  for (const r of ledgerRows) {
    const list = byMember.get(r.patreonMemberId) ?? [];
    list.push({
      eventType: r.eventType,
      occurredAt: r.occurredAt,
      tierId: r.tierId,
      payload: r.payload
    });
    byMember.set(r.patreonMemberId, list);
  }

  const cancelCounts = new Map<string, number>();
  for (const r of ledgerRows) {
    if (r.eventType !== CreatorMembershipEventType.cancel) {
      continue;
    }
    const tMs = r.occurredAt.getTime();
    if (tMs < windowStartMs || tMs > asOfMs) {
      continue;
    }
    for (const tid of readStringArray(r.payload, "prior_tiers")) {
      const k = tid.trim();
      if (!k) {
        continue;
      }
      cancelCounts.set(k, (cancelCounts.get(k) ?? 0) + 1);
    }
  }

  const tenureByTier = new Map<string, number[]>();
  const countByTier = new Map<string, number>();

  for (const [, evs] of byMember) {
    const { paid, tierIds, lastEnteredAt } = replayMemberTierLedger(evs, asOfMs);
    if (!paid) {
      continue;
    }
    for (const t of tierIds) {
      countByTier.set(t, (countByTier.get(t) ?? 0) + 1);
      const entered = lastEnteredAt.get(t);
      if (entered != null) {
        const daysOn = (asOfMs - entered) / 86_400_000;
        const bucket = tenureByTier.get(t) ?? [];
        bucket.push(daysOn);
        tenureByTier.set(t, bucket);
      }
    }
  }

  const baseIds = new Set<string>(paidTierRows.map((t) => t.relayTierId));
  for (const k of countByTier.keys()) {
    baseIds.add(k);
  }
  for (const k of cancelCounts.keys()) {
    baseIds.add(k);
  }

  const tiers: TierStickinessRow[] = [];
  for (const tid of baseIds) {
    const meta = titleByTier.get(tid);
    const member_count = countByTier.get(tid) ?? 0;
    const cancel_events_in_window = cancelCounts.get(tid) ?? 0;
    const churn_proxy =
      cancel_events_in_window /
      Math.max(1, member_count + cancel_events_in_window);
    const med = medianSorted(tenureByTier.get(tid) ?? []);

    tiers.push({
      tier_id: tid,
      title: meta?.title ?? tid,
      amount_cents: meta?.amount ?? null,
      member_count,
      median_tenure_days: med != null ? Math.round(med * 10) / 10 : null,
      churn_proxy: Math.round(churn_proxy * 1000) / 1000,
      cancel_events_in_window
    });
  }

  tiers.sort((a, b) => {
    const ac = a.amount_cents ?? 0;
    const bc = b.amount_cents ?? 0;
    if (ac !== bc) {
      return ac - bc;
    }
    return a.title.localeCompare(b.title);
  });

  return {
    as_of: asOf.toISOString(),
    window_days: days,
    tiers,
    estimated_from_sync: ledgerAny > 0,
    note:
      "Estimated from Patreon member sync timestamps in the Relay ledger. Join rows only store a primary tier; upgrade/downgrade rows carry full tier lists. Median tenure is for the current tier stint. Churn proxy uses cancel events in the window whose prior tier list included each tier."
  };
}
