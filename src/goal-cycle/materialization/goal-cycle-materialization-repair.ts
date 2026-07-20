/**
 * Goal Cycle materialization repair / diagnosis (VS7-T03).
 * Detects partial graphs and never duplicates posts/tasks.
 */

import type { PrismaClient } from "@prisma/client";
import {
  GoalCycleContractError,
  type GoalCycleMaterializationReceipt,
  type GoalCycleMaterializationSlotReceipt
} from "../contracts.js";
import { findGoalCycleForCreator } from "../goal-cycle-store.js";
import {
  findAnyMaterializationReceiptForCycle,
  findMaterializationReceipt,
  insertMaterializationReceipt
} from "./goal-cycle-materialization-store.js";

export type MaterializationSlotObservation = {
  slot_key: string;
  status: string;
  post_id: string | null;
  plan_id: string | null;
  variant_ids: string[];
  task_ids: string[];
  issues: string[];
};

export type MaterializationRepairStatus =
  | "healthy"
  | "complete_unreceipted"
  | "partial"
  | "empty"
  | "conflict";

export type MaterializationRepairReport = {
  cycle_id: string;
  status: MaterializationRepairStatus;
  receipt: GoalCycleMaterializationReceipt | null;
  slots_observed: MaterializationSlotObservation[];
  can_safely_retry_approve: boolean;
  message: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((s) => s.trim().length > 0);
}

/**
 * Diagnose materialization graph for a cycle. Read-only except when
 * `repair: true` and the graph is complete but missing a receipt — then
 * persist a receipt reconstructed from existing slot links (no new posts).
 */
export async function diagnoseOrRepairMaterialization(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    cycleId: string;
    approvalKey?: string | null;
    /** When true and graph is complete_unreceipted, write a receipt from observed IDs. */
    repair?: boolean;
  }
): Promise<MaterializationRepairReport> {
  const creatorId = args.creatorId.trim();
  const cycleId = args.cycleId.trim();
  const approvalKey = args.approvalKey?.trim() || null;

  const row = await findGoalCycleForCreator(prisma, creatorId, cycleId);
  if (!row) {
    throw new GoalCycleContractError("GOAL_CYCLE_NOT_FOUND", "Goal Cycle not found.", [
      { field: "cycle_id", issue: "not_found" }
    ]);
  }

  if (approvalKey) {
    const byKey = await findMaterializationReceipt(prisma, cycleId, approvalKey);
    if (byKey) {
      return {
        cycle_id: cycleId,
        status: "healthy",
        receipt: byKey,
        slots_observed: [],
        can_safely_retry_approve: true,
        message: "Receipt already exists for this approval_key."
      };
    }
  }

  const anyReceipt = await findAnyMaterializationReceiptForCycle(prisma, cycleId);
  if (anyReceipt) {
    return {
      cycle_id: cycleId,
      status: "healthy",
      receipt: anyReceipt,
      slots_observed: [],
      can_safely_retry_approve: true,
      message: "Cycle already has a materialization receipt."
    };
  }

  const slotRows = await prisma.creatorGoalCycleSlot.findMany({
    where: { cycleId },
    orderBy: { rank: "asc" }
  });

  const silence =
    row.goalKind === "break" && row.breakMode === "complete_silence";

  if (slotRows.length === 0) {
    if (silence || row.state === "review" || row.state === "approved") {
      return {
        cycle_id: cycleId,
        status: "empty",
        receipt: null,
        slots_observed: [],
        can_safely_retry_approve: true,
        message: "No downstream objects found; approve may proceed."
      };
    }
    if (row.state === "materializing" || row.state === "active") {
      return {
        cycle_id: cycleId,
        status: "conflict",
        receipt: null,
        slots_observed: [],
        can_safely_retry_approve: false,
        message:
          "Cycle is past approval without slots or receipt — do not invent objects; inspect manually."
      };
    }
    return {
      cycle_id: cycleId,
      status: "empty",
      receipt: null,
      slots_observed: [],
      can_safely_retry_approve: true,
      message: "No materialization artifacts present."
    };
  }

  const observations: MaterializationSlotObservation[] = [];
  let completeCount = 0;
  let partialCount = 0;

  for (const slot of slotRows) {
    const issues: string[] = [];
    const postId = slot.downstreamPostId;
    const planId = slot.downstreamPlanId;
    const variantIds = asStringArray(slot.downstreamVariantIds);
    const taskIds = asStringArray(slot.downstreamTaskIds);

    if (!postId) issues.push("missing_post");
    if (!planId) issues.push("missing_plan");
    if (variantIds.length === 0) issues.push("missing_variants");
    if (taskIds.length === 0) issues.push("missing_tasks");

    if (postId) {
      const post = await prisma.post.findFirst({
        where: { id: postId, creatorId }
      });
      if (!post) issues.push("post_row_missing");
    }
    if (planId) {
      const plan = await prisma.postDistributionPlan.findFirst({
        where: { id: planId, creatorId }
      });
      if (!plan) issues.push("plan_row_missing");
    }
    for (const vid of variantIds) {
      const v = await prisma.postDistributionVariant.findFirst({
        where: { id: vid, creatorId }
      });
      if (!v) issues.push(`variant_missing:${vid}`);
    }
    for (const tid of taskIds) {
      const t = await prisma.postbotTask.findFirst({
        where: { id: tid, creatorId }
      });
      if (!t) issues.push(`task_missing:${tid}`);
    }

    const obs: MaterializationSlotObservation = {
      slot_key: slot.slotKey,
      status: slot.status,
      post_id: postId,
      plan_id: planId,
      variant_ids: variantIds,
      task_ids: taskIds,
      issues
    };
    observations.push(obs);
    if (issues.length === 0) completeCount += 1;
    else if (postId || planId || variantIds.length || taskIds.length) partialCount += 1;
  }

  if (partialCount > 0 || (completeCount > 0 && completeCount < slotRows.length)) {
    return {
      cycle_id: cycleId,
      status: "partial",
      receipt: null,
      slots_observed: observations,
      can_safely_retry_approve: false,
      message:
        "Partial materialization graph detected. Do not re-approve (would risk duplicates). Repair manually or finish missing links."
    };
  }

  if (completeCount === slotRows.length && completeCount > 0) {
    const slotReceipts: GoalCycleMaterializationSlotReceipt[] = observations.map((o) => ({
      slot_id: o.slot_key,
      post_id: o.post_id,
      distribution_plan_id: o.plan_id,
      variant_ids: o.variant_ids,
      task_ids: o.task_ids,
      rail_event_ids: [...o.task_ids],
      mode: "new_post" as const
    }));

    const key = approvalKey ?? `repair_${cycleId}`;
    const now = new Date();
    const receipt: GoalCycleMaterializationReceipt = {
      cycle_id: cycleId,
      approval_key: key,
      status: "materialized",
      materialized_at: (row.materializedAt ?? now).toISOString(),
      slots: slotReceipts
    };

    if (args.repair) {
      await prisma.$transaction(async (tx) => {
        const existing = await findMaterializationReceipt(tx, cycleId, key);
        if (existing) return;
        await insertMaterializationReceipt(tx, {
          cycleId,
          approvalKey: key,
          receipt,
          materializedAt: row.materializedAt ?? now
        });
        if (row.state === "materializing") {
          await tx.creatorGoalCycle.update({
            where: { id: cycleId },
            data: {
              state: "active",
              phase: "active",
              materializedAt: row.materializedAt ?? now,
              version: { increment: 1 }
            }
          });
        }
      });
      return {
        cycle_id: cycleId,
        status: "healthy",
        receipt,
        slots_observed: observations,
        can_safely_retry_approve: true,
        message: "Reconstructed receipt from complete existing graph (no new posts created)."
      };
    }

    return {
      cycle_id: cycleId,
      status: "complete_unreceipted",
      receipt,
      slots_observed: observations,
      can_safely_retry_approve: false,
      message:
        "Graph looks complete but receipt is missing. POST repair with approval_key to persist receipt without duplicating."
    };
  }

  return {
    cycle_id: cycleId,
    status: "empty",
    receipt: null,
    slots_observed: observations,
    can_safely_retry_approve: true,
    message: "Slots exist without downstream links; approve may proceed."
  };
}
