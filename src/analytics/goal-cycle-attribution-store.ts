/**
 * Goal Cycle paid-support attribution persistence (VS4-T01/T02).
 * Opaque campaign keys only — no patron identity.
 */

import type { GoalCycleSupportOutcome, Prisma, PrismaClient } from "@prisma/client";

export type AttributionDb = PrismaClient | Prisma.TransactionClient;

export type CampaignBinding = {
  creatorId: string;
  cycleId: string;
  slotId: string | null;
  campaignKey: string;
};

export async function findCampaignBinding(
  db: AttributionDb,
  creatorId: string,
  campaignKey: string
): Promise<CampaignBinding | null> {
  const key = campaignKey.trim();
  if (!key) return null;
  const cid = creatorId.trim();

  const slot = await db.creatorGoalCycleSlot.findFirst({
    where: { goalCycleCampaignKey: key, cycle: { creatorId: cid } },
    select: { id: true, cycleId: true }
  });
  if (slot) {
    return { creatorId: cid, cycleId: slot.cycleId, slotId: slot.id, campaignKey: key };
  }

  const plan = await db.postDistributionPlan.findFirst({
    where: { creatorId: cid, goalCycleCampaignKey: key },
    select: { id: true }
  });
  if (plan) {
    const linkedSlot = await db.creatorGoalCycleSlot.findFirst({
      where: { goalCycleCampaignKey: key, cycle: { creatorId: cid } },
      select: { id: true, cycleId: true }
    });
    if (linkedSlot) {
      return {
        creatorId: cid,
        cycleId: linkedSlot.cycleId,
        slotId: linkedSlot.id,
        campaignKey: key
      };
    }
  }

  const offer = await db.postMarketingOffer.findFirst({
    where: { creatorId: cid, goalCycleCampaignKey: key },
    select: { id: true }
  });
  const tierDefault = offer
    ? null
    : await db.creatorTierPromotionDefault.findFirst({
        where: { creatorId: cid, goalCycleCampaignKey: key },
        select: { id: true }
      });
  if (offer || tierDefault) {
    const linkedSlot = await db.creatorGoalCycleSlot.findFirst({
      where: { goalCycleCampaignKey: key, cycle: { creatorId: cid } },
      select: { id: true, cycleId: true }
    });
    if (linkedSlot) {
      return {
        creatorId: cid,
        cycleId: linkedSlot.cycleId,
        slotId: linkedSlot.id,
        campaignKey: key
      };
    }
  }

  return null;
}

export async function listCampaignKeysForCycle(
  db: AttributionDb,
  creatorId: string,
  cycleId: string
): Promise<string[]> {
  const slots = await db.creatorGoalCycleSlot.findMany({
    where: { cycleId, cycle: { creatorId } },
    select: { goalCycleCampaignKey: true }
  });
  return [
    ...new Set(
      slots
        .map((s) => s.goalCycleCampaignKey?.trim())
        .filter((k): k is string => Boolean(k))
    )
  ];
}

export async function findSupportOutcomeByDedupe(
  db: AttributionDb,
  creatorId: string,
  dedupeKey: string
): Promise<GoalCycleSupportOutcome | null> {
  return db.goalCycleSupportOutcome.findUnique({
    where: { creatorId_dedupeKey: { creatorId, dedupeKey } }
  });
}

export async function upsertDeterministicSupportOutcome(
  db: AttributionDb,
  data: {
    creatorId: string;
    cycleId: string;
    slotId: string | null;
    campaignKey: string;
    eventKind: string;
    occurredAt: Date;
    amountMinor: number | null;
    currency: string | null;
    confidence: string;
    source: string;
    coverage: string;
    freshnessSeconds: number | null;
    evidenceRefs: string[];
    dedupeKey: string;
    reversalState?: "none" | "reversed";
    reversedAt?: Date | null;
  }
): Promise<{ row: GoalCycleSupportOutcome; created: boolean }> {
  const existing = await findSupportOutcomeByDedupe(db, data.creatorId, data.dedupeKey);
  if (existing) {
    const row = await db.goalCycleSupportOutcome.update({
      where: { id: existing.id },
      data: {
        occurredAt: data.occurredAt,
        amountMinor: data.amountMinor,
        currency: data.currency,
        confidence: data.confidence,
        coverage: data.coverage,
        freshnessSeconds: data.freshnessSeconds,
        evidenceRefsJson: data.evidenceRefs as Prisma.InputJsonValue,
        reversalState: data.reversalState ?? existing.reversalState,
        reversedAt:
          data.reversalState === "reversed"
            ? (data.reversedAt ?? new Date())
            : data.reversalState === "none"
              ? null
              : existing.reversedAt,
        attribution: "deterministic"
      }
    });
    return { row, created: false };
  }

  const row = await db.goalCycleSupportOutcome.create({
    data: {
      creatorId: data.creatorId,
      cycleId: data.cycleId,
      slotId: data.slotId,
      campaignKey: data.campaignKey,
      eventKind: data.eventKind,
      occurredAt: data.occurredAt,
      amountMinor: data.amountMinor,
      currency: data.currency,
      attribution: "deterministic",
      confidence: data.confidence,
      source: data.source,
      coverage: data.coverage,
      freshnessSeconds: data.freshnessSeconds,
      evidenceRefsJson: data.evidenceRefs as Prisma.InputJsonValue,
      dedupeKey: data.dedupeKey,
      reversalState: data.reversalState ?? "none",
      reversedAt: data.reversalState === "reversed" ? (data.reversedAt ?? new Date()) : null
    }
  });
  return { row, created: true };
}

export async function listSupportOutcomesForCycle(
  db: AttributionDb,
  creatorId: string,
  cycleId: string
): Promise<GoalCycleSupportOutcome[]> {
  return db.goalCycleSupportOutcome.findMany({
    where: { creatorId, cycleId },
    orderBy: { occurredAt: "asc" }
  });
}
