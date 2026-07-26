/**
 * Goal Cycle paid-support attribution service (VS4-T02).
 * Deterministic reconcile only — estimated lift is VS4-T03.
 */

import type { PrismaClient } from "@prisma/client";
import { GoalCycleNotFoundError } from "../goal-cycle/goal-cycle-service.js";
import { findGoalCycleForCreator } from "../goal-cycle/goal-cycle-store.js";
import {
  findCampaignBinding,
  listCampaignKeysForCycle,
  listSupportOutcomesForCycle,
  upsertDeterministicSupportOutcome,
  type CampaignBinding
} from "./goal-cycle-attribution-store.js";

export const GOAL_CYCLE_SUPPORT_EVENT_KINDS = [
  "membership_join",
  "membership_upgrade",
  "purchase",
  "tip"
] as const;
export type GoalCycleSupportEventKind = (typeof GOAL_CYCLE_SUPPORT_EVENT_KINDS)[number];

const IGNORED_FUNNEL_KINDS = new Set([
  "click",
  "view",
  "impression",
  "reach",
  "landing_page_visit",
  "free_follow",
  "gallery_view",
  "profile_view"
]);

export type RecordCampaignContextInput = {
  creatorId: string;
  cycleId: string;
  campaignKey: string;
  slotId?: string | null;
  planId?: string | null;
  variantId?: string | null;
  taskId?: string | null;
  offerId?: string | null;
  tierDefaultId?: string | null;
};

export type RecordCampaignContextResult = {
  campaign_key: string;
  cycle_id: string;
  updated: string[];
};

export type ReconcileSupportEventInput = {
  creatorId: string;
  eventKind: string;
  occurredAt: Date | string;
  source: string;
  sourceEventId: string;
  campaignKey?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  confidence?: "high" | "medium" | "low" | "unknown";
  coverage?: "complete" | "partial" | "unavailable";
  evidenceRefs?: string[];
  reverse?: boolean;
  now?: Date;
};

export type ReconcileSupportEventResult =
  | {
      status: "recorded" | "updated";
      outcome_id: string;
      cycle_id: string;
      campaign_key: string;
      attribution: "deterministic";
      event_kind: GoalCycleSupportEventKind;
      reversal_state: string;
    }
  | {
      status: "skipped";
      reason:
        | "ignored_funnel_event"
        | "unsupported_event_kind"
        | "missing_campaign_key"
        | "campaign_unmapped"
        | "creator_mismatch"
        | "outside_attribution_window"
        | "invalid_source_event_id";
    };

/**
 * Creator-period calendar month for `periodKey` (YYYY-MM).
 * Events outside this range do not attach to the cycle (VS4 verification invariant).
 */
export function periodKeyAttributionWindow(periodKey: string): {
  start: Date;
  endExclusive: Date;
} | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    endExclusive: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  };
}

function isSupportEventKind(value: string): value is GoalCycleSupportEventKind {
  return (GOAL_CYCLE_SUPPORT_EVENT_KINDS as readonly string[]).includes(value);
}

function buildDedupeKey(source: string, sourceEventId: string): string {
  return `${source.trim()}:${sourceEventId.trim()}`.slice(0, 256);
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Propagate an opaque campaign key onto Goal Cycle + tracked Relay surfaces.
 * Does not grant content access.
 */
export async function recordCampaignContext(
  prisma: PrismaClient,
  input: RecordCampaignContextInput
): Promise<RecordCampaignContextResult> {
  const creatorId = input.creatorId.trim();
  const cycleId = input.cycleId.trim();
  const campaignKey = input.campaignKey.trim();
  if (!campaignKey) {
    throw new Error("campaign_key_required");
  }

  const cycle = await findGoalCycleForCreator(prisma, creatorId, cycleId);
  if (!cycle) {
    throw new Error("goal_cycle_not_found");
  }

  const updated: string[] = [];

  if (input.slotId?.trim()) {
    const slot = await prisma.creatorGoalCycleSlot.findFirst({
      where: { id: input.slotId.trim(), cycleId }
    });
    if (!slot) throw new Error("slot_not_found");
    await prisma.creatorGoalCycleSlot.update({
      where: { id: slot.id },
      data: { goalCycleCampaignKey: campaignKey }
    });
    updated.push("slot");
  } else {
    // Default: stamp the first planned slot if none specified and one exists without a key.
    const openSlot = await prisma.creatorGoalCycleSlot.findFirst({
      where: { cycleId, goalCycleCampaignKey: null },
      orderBy: { rank: "asc" }
    });
    if (openSlot) {
      await prisma.creatorGoalCycleSlot.update({
        where: { id: openSlot.id },
        data: { goalCycleCampaignKey: campaignKey }
      });
      updated.push("slot");
    }
  }

  if (input.planId?.trim()) {
    const plan = await prisma.postDistributionPlan.findFirst({
      where: { id: input.planId.trim(), creatorId }
    });
    if (!plan) throw new Error("plan_not_found");
    await prisma.postDistributionPlan.update({
      where: { id: plan.id },
      data: { goalCycleCampaignKey: campaignKey }
    });
    updated.push("plan");
  }

  if (input.variantId?.trim()) {
    const variant = await prisma.postDistributionVariant.findFirst({
      where: { id: input.variantId.trim(), creatorId }
    });
    if (!variant) throw new Error("variant_not_found");
    await prisma.postDistributionVariant.update({
      where: { id: variant.id },
      data: { goalCycleCampaignKey: campaignKey }
    });
    updated.push("variant");
  }

  if (input.taskId?.trim()) {
    const task = await prisma.postbotTask.findFirst({
      where: { id: input.taskId.trim(), creatorId }
    });
    if (!task) throw new Error("task_not_found");
    await prisma.postbotTask.update({
      where: { id: task.id },
      data: { goalCycleCampaignKey: campaignKey }
    });
    updated.push("task");
  }

  if (input.offerId?.trim()) {
    const offer = await prisma.postMarketingOffer.findFirst({
      where: { id: input.offerId.trim(), creatorId }
    });
    if (!offer) throw new Error("offer_not_found");
    await prisma.postMarketingOffer.update({
      where: { id: offer.id },
      data: { goalCycleCampaignKey: campaignKey }
    });
    updated.push("offer");
  }

  if (input.tierDefaultId?.trim()) {
    const tierDefault = await prisma.creatorTierPromotionDefault.findFirst({
      where: { id: input.tierDefaultId.trim(), creatorId }
    });
    if (!tierDefault) throw new Error("tier_default_not_found");
    await prisma.creatorTierPromotionDefault.update({
      where: { id: tierDefault.id },
      data: { goalCycleCampaignKey: campaignKey }
    });
    updated.push("tier_default");
  }

  return { campaign_key: campaignKey, cycle_id: cycleId, updated };
}

/**
 * Map one approved paid-support event into a deterministic Goal Cycle outcome.
 * Clicks/views are ignored. Reruns are idempotent on (creatorId, source:sourceEventId).
 */
export async function reconcileSupportEvent(
  prisma: PrismaClient,
  input: ReconcileSupportEventInput
): Promise<ReconcileSupportEventResult> {
  const creatorId = input.creatorId.trim();
  const kind = input.eventKind.trim().toLowerCase();
  const source = input.source.trim();
  const sourceEventId = input.sourceEventId.trim();

  if (!sourceEventId) {
    return { status: "skipped", reason: "invalid_source_event_id" };
  }
  if (IGNORED_FUNNEL_KINDS.has(kind)) {
    return { status: "skipped", reason: "ignored_funnel_event" };
  }
  if (!isSupportEventKind(kind)) {
    return { status: "skipped", reason: "unsupported_event_kind" };
  }

  const campaignKey = input.campaignKey?.trim() || null;
  if (!campaignKey) {
    return { status: "skipped", reason: "missing_campaign_key" };
  }

  const binding = await findCampaignBinding(prisma, creatorId, campaignKey);
  if (!binding) {
    return { status: "skipped", reason: "campaign_unmapped" };
  }
  if (binding.creatorId !== creatorId) {
    return { status: "skipped", reason: "creator_mismatch" };
  }

  const cycle = await findGoalCycleForCreator(prisma, creatorId, binding.cycleId);
  if (!cycle) {
    return { status: "skipped", reason: "campaign_unmapped" };
  }
  const now = input.now ?? new Date();
  const occurredAt = asDate(input.occurredAt);
  const window = periodKeyAttributionWindow(cycle.periodKey);
  if (
    window &&
    (occurredAt.getTime() < window.start.getTime() ||
      occurredAt.getTime() >= window.endExclusive.getTime())
  ) {
    return { status: "skipped", reason: "outside_attribution_window" };
  }

  const freshnessSeconds = Math.max(0, Math.floor((now.getTime() - occurredAt.getTime()) / 1000));
  const dedupeKey = buildDedupeKey(source, sourceEventId);

  const { row, created } = await upsertDeterministicSupportOutcome(prisma, {
    creatorId,
    cycleId: binding.cycleId,
    slotId: binding.slotId,
    campaignKey: binding.campaignKey,
    eventKind: kind,
    occurredAt,
    amountMinor: input.amountMinor ?? null,
    currency: input.currency?.trim() || null,
    confidence: input.confidence ?? "high",
    source,
    coverage: input.coverage ?? "complete",
    freshnessSeconds,
    evidenceRefs: (input.evidenceRefs ?? []).map(String).slice(0, 16),
    dedupeKey,
    reversalState: input.reverse ? "reversed" : "none",
    reversedAt: input.reverse ? now : null
  });

  return {
    status: created ? "recorded" : "updated",
    outcome_id: row.id,
    cycle_id: row.cycleId,
    campaign_key: row.campaignKey,
    attribution: "deterministic",
    event_kind: kind,
    reversal_state: row.reversalState
  };
}

function payloadCampaignKey(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = (payload as Record<string, unknown>).goal_cycle_campaign_key;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

/**
 * Reconcile approved membership/revenue/tip sources that already carry a campaign key.
 * Does not read click tables. Safe to rerun.
 */
export async function reconcileApprovedSourcesForCycle(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string,
  options: { now?: Date } = {}
): Promise<{
  scanned: number;
  recorded: number;
  updated: number;
  skipped: number;
  ignored_clicks: number;
}> {
  const cid = creatorId.trim();
  const cycle = await findGoalCycleForCreator(prisma, cid, cycleId.trim());
  if (!cycle) throw new GoalCycleNotFoundError();

  const keys = new Set(await listCampaignKeysForCycle(prisma, cid, cycle.id));
  const now = options.now ?? new Date();
  let scanned = 0;
  let recorded = 0;
  let updated = 0;
  let skipped = 0;
  let ignored_clicks = 0;

  const apply = async (input: ReconcileSupportEventInput) => {
    scanned += 1;
    const result = await reconcileSupportEvent(prisma, { ...input, now });
    if (result.status === "recorded") recorded += 1;
    else if (result.status === "updated") updated += 1;
    else if (result.status === "skipped" && result.reason === "ignored_funnel_event")
      ignored_clicks += 1;
    else skipped += 1;
  };

  // Membership joins/upgrades with campaign key in opaque payload.
  const membership = await prisma.creatorMembershipEvent.findMany({
    where: {
      creatorId: cid,
      eventType: { in: ["join", "upgrade"] }
    },
    orderBy: { occurredAt: "asc" },
    take: 500
  });
  for (const row of membership) {
    const campaignKey = payloadCampaignKey(row.payload);
    if (!campaignKey || !keys.has(campaignKey)) {
      scanned += 1;
      skipped += 1;
      continue;
    }
    await apply({
      creatorId: cid,
      eventKind: row.eventType === "upgrade" ? "membership_upgrade" : "membership_join",
      occurredAt: row.occurredAt,
      source: `membership_${row.source}`,
      sourceEventId: row.id,
      campaignKey,
      amountMinor: row.amountCents,
      currency: row.amountCents != null ? "USD" : null,
      evidenceRefs: [`membership_event:${row.id}`]
    });
  }

  // Tip reveals attached to offers/placements that carry the campaign key.
  const offers = await prisma.postMarketingOffer.findMany({
    where: { creatorId: cid, goalCycleCampaignKey: { in: [...keys] } },
    select: { id: true, goalCycleCampaignKey: true }
  });
  const offerKeyById = new Map(
    offers
      .filter((o) => o.goalCycleCampaignKey)
      .map((o) => [o.id, o.goalCycleCampaignKey!] as const)
  );
  if (offerKeyById.size > 0) {
    const reveals = await prisma.tipReveal.findMany({
      where: {
        creatorId: cid,
        offerId: { in: [...offerKeyById.keys()] }
      },
      orderBy: { revealedAt: "asc" },
      take: 500
    });
    for (const reveal of reveals) {
      const campaignKey = reveal.offerId ? offerKeyById.get(reveal.offerId) : null;
      if (!campaignKey) {
        scanned += 1;
        skipped += 1;
        continue;
      }
      await apply({
        creatorId: cid,
        eventKind: "tip",
        occurredAt: reveal.revealedAt,
        source: "tip_reveal",
        sourceEventId: reveal.id,
        campaignKey,
        amountMinor: reveal.tipsSpent,
        currency: "TIP",
        evidenceRefs: [`tip_reveal:${reveal.id}`]
      });
    }
  }

  // Platform checkout/subscription completions with campaign key in payload.
  const revenue = await prisma.platformRevenueEvent.findMany({
    where: {
      creatorId: cid,
      eventKind: {
        in: ["checkout_completed", "subscription_created", "subscription_upgraded"]
      }
    },
    orderBy: { occurredAt: "asc" },
    take: 500
  });
  for (const row of revenue) {
    const campaignKey = payloadCampaignKey(row.payload);
    if (!campaignKey || !keys.has(campaignKey)) {
      scanned += 1;
      skipped += 1;
      continue;
    }
    const eventKind: GoalCycleSupportEventKind =
      row.eventKind === "subscription_upgraded" ? "membership_upgrade" : "purchase";
    await apply({
      creatorId: cid,
      eventKind,
      occurredAt: row.occurredAt,
      source: `platform_revenue_${row.sourceLabel}`,
      sourceEventId: row.id,
      campaignKey,
      amountMinor: row.amountCents,
      currency: row.currency,
      evidenceRefs: [`platform_revenue:${row.id}`]
    });
  }

  // Explicitly never reconcile click logs (counted only for ignored metric).
  const clickCount = await prisma.marketingOfferClickEvent.count({
    where: { creatorId: cid }
  });
  ignored_clicks += clickCount;

  return { scanned, recorded, updated, skipped, ignored_clicks };
}

export async function listDeterministicOutcomesForCycle(
  prisma: PrismaClient,
  creatorId: string,
  cycleId: string
) {
  const rows = await listSupportOutcomesForCycle(prisma, creatorId.trim(), cycleId.trim());
  return rows
    .filter((r) => r.attribution === "deterministic")
    .map((r) => ({
      outcome_id: r.id,
      cycle_id: r.cycleId,
      slot_id: r.slotId,
      campaign_key: r.campaignKey,
      event_kind: r.eventKind,
      occurred_at: r.occurredAt.toISOString(),
      amount_minor: r.amountMinor,
      currency: r.currency,
      attribution: r.attribution,
      confidence: r.confidence,
      source: r.source,
      coverage: r.coverage,
      freshness_seconds: r.freshnessSeconds,
      evidence_refs: Array.isArray(r.evidenceRefsJson)
        ? (r.evidenceRefsJson as unknown[]).map(String)
        : [],
      dedupe_key: r.dedupeKey,
      reversal_state: r.reversalState
    }));
}

export type { CampaignBinding };
