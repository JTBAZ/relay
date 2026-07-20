/**
 * @fileoverview Tip beta go/no-go funnel rollup (MB-8).
 * @see docs/TIP_BETA_BUILD_PLAN.md
 */

import { TipEntryKind, type PrismaClient } from "@prisma/client";

export type TipBetaFunnelPeriod = {
  /** UTC month key `YYYY-MM`. */
  period_key: string;
  period_start: Date;
  period_end: Date;
};

export type TipBetaFunnelRollup = {
  period_key: string;
  active_fans: number;
  converters: number;
  /** converters / active_fans; 0 when no active fans. */
  conversion_rate: number;
  reveals: number;
  reveals_per_converter: number;
  /** Offer CTA clicks / reveal_interaction engagements (0 when no engagements). */
  offer_ctr: number;
  reveal_interactions: number;
  offer_clicks: number;
  /** Phase 3 gate: conversion_rate >= 0.15 */
  go_no_go_pass: boolean;
};

export function parseTipBetaPeriodKey(
  periodKey: string,
  now: Date = new Date()
): TipBetaFunnelPeriod {
  const raw = periodKey.trim() || tipBetaPeriodKeyUtc(now);
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) {
    throw new Error(`Invalid period_key "${raw}" — expected YYYY-MM`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid period_key month in "${raw}"`);
  }
  const period_start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const period_end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { period_key: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`, period_start, period_end };
}

export function tipBetaPeriodKeyUtc(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`;
}

/**
 * Monthly Tip beta funnel for the Phase 3 go/no-go gate.
 * Active fan = Account with ≥1 Session activity in the month (createdAt or lastUsedAt).
 * Converter = active fan with ≥1 TipLedgerEntry spend in the month.
 */
export async function computeTipBetaFunnel(
  prisma: PrismaClient,
  args?: { periodKey?: string; now?: Date }
): Promise<TipBetaFunnelRollup> {
  const period = parseTipBetaPeriodKey(
    args?.periodKey?.trim() || tipBetaPeriodKeyUtc(args?.now),
    args?.now
  );
  const { period_start, period_end, period_key } = period;

  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { createdAt: { gte: period_start, lt: period_end } },
        { lastUsedAt: { gte: period_start, lt: period_end } }
      ]
    },
    select: {
      tenantMembership: { select: { accountId: true } }
    }
  });
  const activeFanIds = new Set(
    sessions
      .map((s) => s.tenantMembership.accountId)
      .filter((id): id is string => Boolean(id?.trim()))
  );

  const spendRows = await prisma.tipLedgerEntry.findMany({
    where: {
      entryKind: TipEntryKind.spend,
      createdAt: { gte: period_start, lt: period_end }
    },
    select: { accountId: true },
    distinct: ["accountId"]
  });
  const spenderIds = new Set(spendRows.map((r) => r.accountId));
  let converters = 0;
  for (const id of activeFanIds) {
    if (spenderIds.has(id)) converters += 1;
  }

  const active_fans = activeFanIds.size;
  const conversion_rate = active_fans === 0 ? 0 : converters / active_fans;

  const reveals = await prisma.tipReveal.count({
    where: { revealedAt: { gte: period_start, lt: period_end } }
  });
  const reveals_per_converter = converters === 0 ? 0 : reveals / converters;

  const reveal_interactions = await prisma.relayEngagementEvent.count({
    where: {
      eventType: "reveal_interaction",
      occurredAt: { gte: period_start, lt: period_end }
    }
  });
  const offer_clicks = await prisma.marketingOfferClickEvent.count({
    where: { occurredAt: { gte: period_start, lt: period_end } }
  });
  const offer_ctr =
    reveal_interactions === 0 ? 0 : offer_clicks / reveal_interactions;

  return {
    period_key,
    active_fans,
    converters,
    conversion_rate,
    reveals,
    reveals_per_converter,
    offer_ctr,
    reveal_interactions,
    offer_clicks,
    go_no_go_pass: conversion_rate >= 0.15
  };
}

export type CreatorTipBetaStats = {
  period_key: string;
  reveals: number;
  offer_clicks: number;
  /** offer_clicks / reveals when reveals > 0. */
  offer_ctr: number;
};

/** Artist-facing Tip beta readout for Studio analytics. */
export async function computeCreatorTipBetaStats(
  prisma: PrismaClient,
  args: { creatorId: string; periodKey?: string; now?: Date }
): Promise<CreatorTipBetaStats> {
  const period = parseTipBetaPeriodKey(
    args.periodKey?.trim() || tipBetaPeriodKeyUtc(args.now),
    args.now
  );
  const creatorId = args.creatorId.trim();
  const reveals = await prisma.tipReveal.count({
    where: {
      creatorId,
      revealedAt: { gte: period.period_start, lt: period.period_end }
    }
  });
  const offer_clicks = await prisma.marketingOfferClickEvent.count({
    where: {
      creatorId,
      occurredAt: { gte: period.period_start, lt: period.period_end }
    }
  });
  return {
    period_key: period.period_key,
    reveals,
    offer_clicks,
    offer_ctr: reveals === 0 ? 0 : offer_clicks / reveals
  };
}
