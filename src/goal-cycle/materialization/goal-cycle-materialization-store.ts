/**
 * Goal Cycle materialization receipt persistence (VS7-T02).
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { GoalCycleMaterializationReceipt } from "../contracts.js";

export type MaterializationTx = Prisma.TransactionClient;

export async function findMaterializationReceipt(
  prisma: PrismaClient | MaterializationTx,
  cycleId: string,
  approvalKey: string
): Promise<GoalCycleMaterializationReceipt | null> {
  const row = await prisma.creatorGoalCycleMaterializationReceipt.findUnique({
    where: {
      cycleId_approvalKey: { cycleId, approvalKey }
    }
  });
  if (!row) return null;
  return row.receiptJson as GoalCycleMaterializationReceipt;
}

export async function findAnyMaterializationReceiptForCycle(
  prisma: PrismaClient | MaterializationTx,
  cycleId: string
): Promise<GoalCycleMaterializationReceipt | null> {
  const row = await prisma.creatorGoalCycleMaterializationReceipt.findFirst({
    where: { cycleId },
    orderBy: { materializedAt: "desc" }
  });
  if (!row) return null;
  return row.receiptJson as GoalCycleMaterializationReceipt;
}

export async function insertMaterializationReceipt(
  tx: MaterializationTx,
  args: {
    cycleId: string;
    approvalKey: string;
    receipt: GoalCycleMaterializationReceipt;
    materializedAt: Date;
  }
): Promise<GoalCycleMaterializationReceipt> {
  await tx.creatorGoalCycleMaterializationReceipt.create({
    data: {
      cycleId: args.cycleId,
      approvalKey: args.approvalKey,
      receiptJson: args.receipt as unknown as Prisma.InputJsonValue,
      materializedAt: args.materializedAt
    }
  });
  return args.receipt;
}

export async function upsertGoalCycleSlotMaterialized(
  tx: MaterializationTx,
  args: {
    cycleId: string;
    slotKey: string;
    rank: number;
    intent: string;
    format: string;
    title: string;
    draftBody: string;
    destinationIds: string[];
    scheduledLocal: string | null;
    scheduledUtc: Date | null;
    mediaState: string;
    postId: string | null;
    planId: string | null;
    variantIds: string[];
    taskIds: string[];
    campaignKey: string | null;
  }
): Promise<void> {
  await tx.creatorGoalCycleSlot.upsert({
    where: {
      cycleId_slotKey: { cycleId: args.cycleId, slotKey: args.slotKey }
    },
    create: {
      cycleId: args.cycleId,
      slotKey: args.slotKey,
      rank: args.rank,
      intent: args.intent,
      format: args.format,
      title: args.title,
      draftBody: args.draftBody,
      destinationIdsJson: args.destinationIds,
      scheduledLocal: args.scheduledLocal,
      scheduledUtc: args.scheduledUtc,
      mediaState: args.mediaState,
      downstreamPostId: args.postId,
      downstreamPlanId: args.planId,
      downstreamVariantIds: args.variantIds,
      downstreamTaskIds: args.taskIds,
      status: "materialized",
      goalCycleCampaignKey: args.campaignKey
    },
    update: {
      rank: args.rank,
      intent: args.intent,
      format: args.format,
      title: args.title,
      draftBody: args.draftBody,
      destinationIdsJson: args.destinationIds,
      scheduledLocal: args.scheduledLocal,
      scheduledUtc: args.scheduledUtc,
      mediaState: args.mediaState,
      downstreamPostId: args.postId,
      downstreamPlanId: args.planId,
      downstreamVariantIds: args.variantIds,
      downstreamTaskIds: args.taskIds,
      status: "materialized",
      goalCycleCampaignKey: args.campaignKey
    }
  });
}
