/**
 * @fileoverview Curator perks / "Your support this month" payload (MB-14).
 * @see docs/FAN_PREMIUM_BUILD_PLAN.md
 */

import { ArtistLedgerEntryKind, TipEntryKind, type PrismaClient } from "@prisma/client";
import { isFanPremiumEnabled } from "../billing/fan-plan-config.js";
import { getActiveFanSubscription } from "../billing/subscription-sync.js";
import { isActiveCuratorForAccount } from "./curator-status.js";

export type CuratorSupportSummaryWire = {
  plan: "free" | "supporter" | "curator";
  is_curator: boolean;
  period_start: string;
  tips_spent: number;
  artists_supported: number;
  cents_routed_to_artists: number;
  /** Copy-only hook for future Boosts — no schema / mechanics. */
  boosts_coming_copy: string | null;
};

export type GetCuratorSupportSummaryOptions = {
  now?: Date;
  env?: NodeJS.ProcessEnv;
};

const BOOSTS_COMING_COPY = "Boosts are coming for Curators";

function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function boostsComingCopyEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.RELAY_CURATOR_BOOSTS_COMING_COPY?.trim().toLowerCase();
  if (raw === "0" || raw === "off" || raw === "false") return false;
  return true;
}

/**
 * Ledger-truth summary for the signed-in fan's patronage this UTC month.
 * Returns null when fan premium is off (caller should 404).
 */
export async function getCuratorSupportSummary(
  prisma: PrismaClient,
  accountId: string,
  options: GetCuratorSupportSummaryOptions = {}
): Promise<CuratorSupportSummaryWire | null> {
  const env = options.env ?? process.env;
  if (!isFanPremiumEnabled(env)) return null;

  const now = options.now ?? new Date();
  const periodStart = utcMonthStart(now);
  const fanSub = await getActiveFanSubscription(prisma, accountId);
  const plan = (fanSub?.fanPlan ?? "free") as CuratorSupportSummaryWire["plan"];
  const isCurator = await isActiveCuratorForAccount(prisma, accountId, env);

  const spendAgg = await prisma.tipLedgerEntry.aggregate({
    where: {
      accountId,
      entryKind: TipEntryKind.spend,
      createdAt: { gte: periodStart }
    },
    _sum: { tips: true }
  });
  const tipsSpent = Math.abs(spendAgg._sum.tips ?? 0);

  const artists = await prisma.tipReveal.findMany({
    where: {
      patronAccountId: accountId,
      revealedAt: { gte: periodStart }
    },
    select: { creatorId: true },
    distinct: ["creatorId"]
  });

  const reveals = await prisma.tipReveal.findMany({
    where: {
      patronAccountId: accountId,
      revealedAt: { gte: periodStart }
    },
    select: { id: true }
  });
  const revealIds = reveals.map((r) => r.id);
  let centsRouted = 0;
  if (revealIds.length > 0) {
    const earned = await prisma.artistLedgerEntry.aggregate({
      where: {
        entryKind: ArtistLedgerEntryKind.tip_earned,
        revealId: { in: revealIds }
      },
      _sum: { amountCents: true }
    });
    centsRouted = earned._sum.amountCents ?? 0;
  }

  return {
    plan,
    is_curator: isCurator,
    period_start: periodStart.toISOString(),
    tips_spent: tipsSpent,
    artists_supported: artists.length,
    cents_routed_to_artists: centsRouted,
    boosts_coming_copy:
      isCurator && boostsComingCopyEnabled(env) ? BOOSTS_COMING_COPY : null
  };
}
