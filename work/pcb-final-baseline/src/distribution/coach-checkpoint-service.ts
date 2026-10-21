/**
 * @fileoverview Coach Attack Review checkpoint — stub PostDistributionPlan
 * (`assistantMode: "coach_review"`, zero variants) so propose + accepted copy
 * survive refresh until finalize upgrades the same plan_id.
 */

import type { PrismaClient } from "@prisma/client";
import type { CoachProposeResult } from "./coach-propose-service.js";
import type { PostingAssistantContext } from "./posting-assistant-service.js";
import {
  getPostDistributionPlan,
  loadCanonicalCopy,
  PostDistributionValidationError,
  type DistributionPlanWire
} from "./post-distribution-service.js";

export const COACH_REVIEW_ASSISTANT_MODE = "coach_review";

export type CoachCheckpointPhase = "findings" | "platformReview" | "gathering";

export type SaveCoachReviewCheckpointInput = {
  proposal: CoachProposeResult;
  assistant_context?: PostingAssistantContext;
  coach_destinations: string[];
  /** Persisted phase after propose — never leave as gathering. */
  coach_phase?: Exclude<CoachCheckpointPhase, "gathering">;
  platform_review_index?: number;
};

export type PatchCoachReviewProgressInput = {
  coach_phase?: CoachCheckpointPhase;
  platform_review_index?: number;
  accepted_copy_by_destination?: PostingAssistantContext["accepted_copy_by_destination"];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function findActivePlanRow(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
) {
  return prisma.postDistributionPlan.findFirst({
    where: { postId, creatorId, status: "active" },
    include: {
      _count: { select: { variants: true } }
    }
  });
}

/** Throw if an active routed plan would be clobbered by Coach propose. */
export async function assertCoachProposeAllowed(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<void> {
  const existing = await findActivePlanRow(prisma, creatorId, postId);
  if (!existing) return;
  if (
    existing.assistantMode !== COACH_REVIEW_ASSISTANT_MODE &&
    existing._count.variants > 0
  ) {
    throw new PostDistributionValidationError(
      "A routed distribution plan already exists. Archive it or finish Send before running Coach again.",
      [{ field: "plan_already_routed", issue: "active_variants" }]
    );
  }
}

export async function saveCoachReviewCheckpoint(
  prisma: PrismaClient,
  creatorId: string,
  postId: string,
  input: SaveCoachReviewCheckpointInput
): Promise<DistributionPlanWire> {
  await loadCanonicalCopy(prisma, creatorId, postId);
  await assertCoachProposeAllowed(prisma, creatorId, postId);

  const coachPhase = input.coach_phase ?? "findings";
  const platformReviewIndex = Math.max(0, input.platform_review_index ?? 0);
  const coachDestinations = input.coach_destinations.map(String).filter(Boolean);

  const assistantContext: Record<string, unknown> = {
    ...(input.assistant_context ?? {})
  };

  const assistantPlan: Record<string, unknown> = {
    coach_checkpoint_version: 1,
    coach_phase: coachPhase,
    platform_review_index: platformReviewIndex,
    coach_destinations: coachDestinations,
    proposal: {
      path_id: input.proposal.path_id,
      findings: input.proposal.findings,
      by_destination: input.proposal.by_destination,
      ai_used: input.proposal.ai_used,
      facts: input.proposal.facts,
      fact_pack: input.proposal.fact_pack
    }
  };

  const existing = await findActivePlanRow(prisma, creatorId, postId);

  if (existing && existing.assistantMode === COACH_REVIEW_ASSISTANT_MODE) {
    const prevContext = asRecord(existing.assistantContext);
    await prisma.postDistributionPlan.update({
      where: { id: existing.id },
      data: {
        assistantMode: COACH_REVIEW_ASSISTANT_MODE,
        assistantContext: {
          ...prevContext,
          ...assistantContext,
          // Preserve in-progress accepted copy unless caller replaces context wholesale without it
          accepted_copy_by_destination:
            assistantContext.accepted_copy_by_destination ??
            prevContext.accepted_copy_by_destination
        } as object,
        assistantPlan: assistantPlan as object
      }
    });
  } else {
    if (existing) {
      // Empty non-coach stub — archive before creating coach_review
      await prisma.postDistributionPlan.update({
        where: { id: existing.id },
        data: { status: "archived" }
      });
    }
    await prisma.postDistributionPlan.create({
      data: {
        creatorId,
        postId,
        status: "active",
        assistantMode: COACH_REVIEW_ASSISTANT_MODE,
        assistantContext: assistantContext as object,
        assistantPlan: assistantPlan as object
      }
    });
  }

  const plan = await getPostDistributionPlan(prisma, creatorId, postId);
  if (!plan) {
    throw new PostDistributionValidationError("Failed to load Coach checkpoint plan.", [
      { field: "plan", issue: "missing_after_save" }
    ]);
  }
  return plan;
}

export async function patchCoachReviewProgress(
  prisma: PrismaClient,
  creatorId: string,
  postId: string,
  input: PatchCoachReviewProgressInput
): Promise<DistributionPlanWire> {
  const existing = await findActivePlanRow(prisma, creatorId, postId);
  if (!existing || existing.assistantMode !== COACH_REVIEW_ASSISTANT_MODE) {
    throw new PostDistributionValidationError("No active Coach review checkpoint.", [
      { field: "assistant_mode", issue: "not_coach_review" }
    ]);
  }

  const prevContext = asRecord(existing.assistantContext);
  const prevPlan = asRecord(existing.assistantPlan);

  const nextContext = { ...prevContext };
  if (input.accepted_copy_by_destination !== undefined) {
    const prevAccepted = asRecord(prevContext.accepted_copy_by_destination);
    nextContext.accepted_copy_by_destination = {
      ...prevAccepted,
      ...input.accepted_copy_by_destination
    };
  }

  const nextPlan = { ...prevPlan };
  if (input.coach_phase !== undefined) {
    // Never persist gathering after propose has completed
    nextPlan.coach_phase =
      input.coach_phase === "gathering" ? "findings" : input.coach_phase;
  }
  if (input.platform_review_index !== undefined) {
    nextPlan.platform_review_index = Math.max(0, input.platform_review_index);
  }

  await prisma.postDistributionPlan.update({
    where: { id: existing.id },
    data: {
      assistantContext: nextContext as object,
      assistantPlan: nextPlan as object
    }
  });

  const plan = await getPostDistributionPlan(prisma, creatorId, postId);
  if (!plan) {
    throw new PostDistributionValidationError("Failed to load Coach checkpoint plan.", [
      { field: "plan", issue: "missing_after_patch" }
    ]);
  }
  return plan;
}

export async function clearCoachReviewCheckpoint(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<{ archived: boolean; plan_id: string | null }> {
  const existing = await findActivePlanRow(prisma, creatorId, postId);
  if (!existing || existing.assistantMode !== COACH_REVIEW_ASSISTANT_MODE) {
    return { archived: false, plan_id: null };
  }
  await prisma.postDistributionPlan.update({
    where: { id: existing.id },
    data: { status: "archived" }
  });
  return { archived: true, plan_id: existing.id };
}

/** Strip coach checkpoint-only keys; keep facts/media fields for finalized plan. */
export function finalizeAssistantPlanFromCheckpoint(
  priorPlan: Record<string, unknown>,
  finalizedPlan: Record<string, unknown>
): Record<string, unknown> {
  const {
    coach_checkpoint_version: _v,
    coach_phase: _phase,
    platform_review_index: _idx,
    coach_destinations: _dests,
    proposal: _proposal,
    ...restPrior
  } = priorPlan;

  const merged = {
    ...restPrior,
    ...finalizedPlan
  };
  delete merged.coach_checkpoint_version;
  delete merged.coach_phase;
  delete merged.platform_review_index;
  delete merged.coach_destinations;
  delete merged.proposal;
  delete merged.fact_pack;
  return merged;
}
