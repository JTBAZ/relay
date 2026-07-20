/**
 * @fileoverview Post-level distribution plans, variants, attempts, and library summaries.
 */

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { syncGoalCycleDestinationCompletion } from "../goal-cycle/execution/goal-cycle-execution-service.js";
import { PostSource, PostUpstreamStatus, MediaUpstreamStatus } from "@prisma/client";
import { mergePostPresentation } from "../gallery/effective-presentation.js";
import { stripHtmlForSearch } from "../gallery/query.js";
import {
  buildXPostTextWithTags,
  formatVariantsForDestinations,
  normalizeDeviantArtTag,
  type CanonicalPostCopy,
  type FormattedPlatformVariant
} from "./platform-formatters.js";
import {
  isDistributionDestination,
  normalizeDistributionDestinations,
  type DistributionDestination
} from "./platform-destinations.js";
import {
  applyPostingAssistantToVariants,
  type PostingAssistantContext
} from "./posting-assistant-service.js";
import {
  mapPostbotTaskRow,
  persistPostbotTasksForPlan,
  type PostbotTaskWire
} from "./postbot-task-service.js";
import { isPostingAssistantAllowedForCreator } from "../creator/creator-feature-flags-service.js";
import { getCreatorStudioBrief } from "../creator/studio-brief-service.js";
import { mergeAssistantContextWithStudioBrief } from "../creator/studio-mounted-context.js";
import { upsertPlatformInstanceFromAttempt } from "../analytics/platform-instance-service.js";
import { normalizeCompleteDistributionIdentity } from "../analytics/platform-instance-link-service.js";
import {
  buildPlanMediaAssistantFields,
  contentVariantRoleFromPlatformFields,
  destinationsUsingPreviewRouting,
  mergeVariantPlatformFieldsWithMedia,
  normalizeMediaRoutingByDestination,
  resolveMediaVersionForDestination
} from "./media-binding.js";

const COACH_REVIEW_ASSISTANT_MODE = "coach_review";

/** Drop coach checkpoint-only keys when upgrading a stub plan in place. */
function finalizeAssistantPlanFromCheckpoint(
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
  const merged = { ...restPrior, ...finalizedPlan };
  delete merged.coach_checkpoint_version;
  delete merged.coach_phase;
  delete merged.platform_review_index;
  delete merged.coach_destinations;
  delete merged.proposal;
  delete merged.fact_pack;
  return merged;
}

export type { PostbotTaskWire } from "./postbot-task-service.js";
export { updatePostbotTaskStatus, updatePostbotTaskRemindMe } from "./postbot-task-service.js";

export type DistributionVariantWire = {
  variant_id: string;
  plan_id: string;
  post_id: string;
  destination: DistributionDestination;
  status: string;
  assistant_enabled: boolean;
  title: string | null;
  body_text: string | null;
  post_text: string | null;
  tags: string[];
  locale: string | null;
  scheduled_for: string | null;
  remind_me: boolean;
  reminder_sent_at: string | null;
  platform_fields: Record<string, unknown>;
  advice: Record<string, unknown>;
  approved_at: string | null;
  latest_attempt: DistributionAttemptWire | null;
  postbot_tasks: PostbotTaskWire[];
};

export type DistributionAttemptWire = {
  attempt_id: string;
  variant_id: string;
  post_id: string;
  destination: DistributionDestination;
  status: string;
  extension_tab_id: number | null;
  fill_result: Record<string, unknown>;
  external_url: string | null;
  external_id: string | null;
  error_code: string | null;
  error_detail: string | null;
  started_at: string;
  completed_at: string | null;
};

export type DistributionPlanWire = {
  plan_id: string;
  post_id: string;
  creator_id: string;
  status: string;
  assistant_mode: string;
  assistant_context: Record<string, unknown>;
  assistant_plan: Record<string, unknown>;
  variants: DistributionVariantWire[];
  created_at: string;
  updated_at: string;
};

export type DistributionSummaryWire = {
  post_id: string;
  destinations: Array<{
    destination: DistributionDestination;
    variant_status: string | null;
    attempt_status: string | null;
    attempt_id: string | null;
    external_url: string | null;
    external_id: string | null;
  }>;
};

export class PostDistributionValidationError extends Error {
  public override readonly name = "PostDistributionValidationError";
  public constructor(
    message: string,
    public readonly details: Array<{ field: string; issue: string }>
  ) {
    super(message);
  }
}

export class PostDistributionNotFoundError extends Error {
  public override readonly name = "PostDistributionNotFoundError";
}

function mapAttempt(row: {
  id: string;
  variantId: string;
  postId: string;
  destination: string;
  status: string;
  extensionTabId: number | null;
  fillResult: unknown;
  externalUrl: string | null;
  externalId: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  startedAt: Date;
  completedAt: Date | null;
}): DistributionAttemptWire {
  return {
    attempt_id: row.id,
    variant_id: row.variantId,
    post_id: row.postId,
    destination: row.destination as DistributionDestination,
    status: row.status,
    extension_tab_id: row.extensionTabId,
    fill_result:
      row.fillResult && typeof row.fillResult === "object" && !Array.isArray(row.fillResult)
        ? (row.fillResult as Record<string, unknown>)
        : {},
    external_url: row.externalUrl,
    external_id: row.externalId,
    error_code: row.errorCode,
    error_detail: row.errorDetail,
    started_at: row.startedAt.toISOString(),
    completed_at: row.completedAt?.toISOString() ?? null
  };
}

function mapVariant(
  row: {
    id: string;
    planId: string;
    postId: string;
    destination: string;
    status: string;
    assistantEnabled: boolean;
    title: string | null;
    bodyText: string | null;
    postText: string | null;
    tags: string[];
    locale: string | null;
    scheduledFor: Date | null;
    remindMe: boolean;
    reminderSentAt: Date | null;
    platformFields: unknown;
    advice: unknown;
    approvedAt: Date | null;
    attempts?: Array<Parameters<typeof mapAttempt>[0]>;
    postbotTasks?: Array<Parameters<typeof mapPostbotTaskRow>[0]>;
  }
): DistributionVariantWire {
  const latest = row.attempts?.[0] ?? null;
  return {
    variant_id: row.id,
    plan_id: row.planId,
    post_id: row.postId,
    destination: row.destination as DistributionDestination,
    status: row.status,
    assistant_enabled: row.assistantEnabled,
    title: row.title,
    body_text: row.bodyText,
    post_text: row.postText,
    tags: row.tags ?? [],
    locale: row.locale,
    scheduled_for: row.scheduledFor?.toISOString() ?? null,
    remind_me: row.remindMe,
    reminder_sent_at: row.reminderSentAt?.toISOString() ?? null,
    platform_fields:
      row.platformFields && typeof row.platformFields === "object" && !Array.isArray(row.platformFields)
        ? (row.platformFields as Record<string, unknown>)
        : {},
    advice:
      row.advice && typeof row.advice === "object" && !Array.isArray(row.advice)
        ? (row.advice as Record<string, unknown>)
        : {},
    approved_at: row.approvedAt?.toISOString() ?? null,
    latest_attempt: latest ? mapAttempt(latest) : null,
    postbot_tasks: (row.postbotTasks ?? []).map(mapPostbotTaskRow)
  };
}

function mapPlan(row: {
  id: string;
  postId: string;
  creatorId: string;
  status: string;
  assistantMode: string;
  assistantContext: unknown;
  assistantPlan: unknown;
  createdAt: Date;
  updatedAt: Date;
  variants: Array<Parameters<typeof mapVariant>[0]>;
}): DistributionPlanWire {
  return {
    plan_id: row.id,
    post_id: row.postId,
    creator_id: row.creatorId,
    status: row.status,
    assistant_mode: row.assistantMode,
    assistant_context:
      row.assistantContext && typeof row.assistantContext === "object" && !Array.isArray(row.assistantContext)
        ? (row.assistantContext as Record<string, unknown>)
        : {},
    assistant_plan:
      row.assistantPlan && typeof row.assistantPlan === "object" && !Array.isArray(row.assistantPlan)
        ? (row.assistantPlan as Record<string, unknown>)
        : {},
    variants: row.variants.map(mapVariant),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

/** Load Relay post title/body/tags for distribution formatting (also used by Coach propose). */
export async function loadCanonicalCopy(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<CanonicalPostCopy> {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      creatorId,
      source: PostSource.RELAY,
      upstreamStatus: PostUpstreamStatus.active
    },
    include: {
      versions: { orderBy: { versionSeq: "desc" }, take: 1 },
      presentation: {
        select: { relayTitle: true, relayDescription: true, mediaOrder: true }
      }
    }
  });
  if (!post?.versions[0]) {
    throw new PostDistributionNotFoundError("Relay post not found.");
  }
  const version = post.versions[0];
  const merged = mergePostPresentation(
    {
      title: version.title,
      description: version.description ?? undefined,
      media_ids: version.mediaIds
    },
    post.presentation
      ? {
          relay_title: post.presentation.relayTitle,
          relay_description: post.presentation.relayDescription,
          media_order: post.presentation.mediaOrder
        }
      : null
  );
  const bodyText = stripHtmlForSearch(merged.description ?? "");
  const tagLabels = version.tagIds.map((id) => id.replace(/^tag_/, "").replace(/_/g, " "));
  return {
    title: merged.title.trim(),
    bodyText,
    tagLabels
  };
}

export type CreateDistributionPlanInput = {
  destinations: string[];
  assistant_by_destination?: Record<string, boolean>;
  assistant_context?: PostingAssistantContext;
  source_draft_id?: string | null;
  needs_preview?: boolean;
  media_routing_by_destination?: Record<string, string>;
  preview_media_id?: string | null;
};

async function assertPreviewMediaForPlan(
  prisma: PrismaClient,
  creatorId: string,
  previewMediaId: string
): Promise<void> {
  const id = previewMediaId.trim();
  const row = await prisma.mediaAsset.findFirst({
    where: {
      id,
      creatorId,
      upstreamStatus: MediaUpstreamStatus.active
    },
    select: {
      id: true,
      currentStorageKey: true,
      currentUpstreamUrl: true
    }
  });
  if (!row) {
    throw new PostDistributionValidationError("preview_media_id is not available for this creator.", [
      { field: "preview_media_id", issue: "not_found" }
    ]);
  }
  if (!row.currentStorageKey?.trim() && !row.currentUpstreamUrl?.trim()) {
    throw new PostDistributionValidationError("preview_media_id is not export-ready.", [
      { field: "preview_media_id", issue: "not_export_ready" }
    ]);
  }
}

function applyMediaRoutingToFormattedVariants(
  variants: FormattedPlatformVariant[],
  destinations: DistributionDestination[],
  input: CreateDistributionPlanInput
): {
  variants: FormattedPlatformVariant[];
  mediaRouting: ReturnType<typeof normalizeMediaRoutingByDestination>;
  previewMediaId: string | null;
} {
  const mediaRouting = normalizeMediaRoutingByDestination(
    input.media_routing_by_destination,
    destinations
  );
  const previewMediaId = input.preview_media_id?.trim() || null;
  const variantsWithMedia = variants.map((variant) => ({
    ...variant,
    platformFields: mergeVariantPlatformFieldsWithMedia(
      variant.platformFields,
      variant.destination,
      resolveMediaVersionForDestination(variant.destination, mediaRouting)
    )
  }));
  return { variants: variantsWithMedia, mediaRouting, previewMediaId };
}

export async function createPostDistributionPlan(
  prisma: PrismaClient,
  creatorId: string,
  postId: string,
  input: CreateDistributionPlanInput
): Promise<DistributionPlanWire> {
  const destinations = normalizeDistributionDestinations(input.destinations ?? []);
  if (destinations.length === 0) {
    throw new PostDistributionValidationError("Select at least one destination.", [
      { field: "destinations", issue: "required" }
    ]);
  }

  const canonical = await loadCanonicalCopy(prisma, creatorId, postId);

  const assistantEnabledSet = new Set<DistributionDestination>();
  const wantsAssistant = destinations.some((dest) => input.assistant_by_destination?.[dest]);
  const assistantAllowed = wantsAssistant
    ? await isPostingAssistantAllowedForCreator(prisma, creatorId)
    : false;
  for (const dest of destinations) {
    if (input.assistant_by_destination?.[dest]) {
      if (!assistantAllowed) {
        throw new PostDistributionValidationError("Posting Assistant is not available on your plan.", [
          { field: "assistant_by_destination", issue: "tier_not_allowed" }
        ]);
      }
      assistantEnabledSet.add(dest);
    }
  }

  let formatted = formatVariantsForDestinations(destinations, canonical);
  let assistantMode = "none";
  let assistantPlan: Record<string, unknown> = {};
  // Merge durable Insights studio brief under request context (request wins).
  // Does not rebuild Coach fact_pack — brief is creator-scoped persistence only.
  let assistantContext = (input.assistant_context ?? {}) as PostingAssistantContext;
  try {
    const brief = await getCreatorStudioBrief(prisma, creatorId);
    assistantContext = mergeAssistantContextWithStudioBrief(assistantContext, brief);
  } catch {
    // Brief load failure must not block plan create.
  }

  if (assistantEnabledSet.size > 0) {
    const assistant = await applyPostingAssistantToVariants(
      prisma,
      creatorId,
      formatted,
      assistantContext,
      assistantEnabledSet
    );
    formatted = assistant.variants;
    assistantMode = assistant.assistantMode;
    assistantPlan = assistant.assistantPlan;
  }

  const mediaPrepared = applyMediaRoutingToFormattedVariants(formatted, destinations, input);
  formatted = mediaPrepared.variants;
  const previewDestinations = destinationsUsingPreviewRouting(destinations, mediaPrepared.mediaRouting);
  if (previewDestinations.length > 0) {
    if (!mediaPrepared.previewMediaId) {
      throw new PostDistributionValidationError(
        "preview_media_id is required when any destination uses preview routing.",
        [{ field: "preview_media_id", issue: "required" }]
      );
    }
    await assertPreviewMediaForPlan(prisma, creatorId, mediaPrepared.previewMediaId);
  }

  assistantPlan = {
    ...assistantPlan,
    ...buildPlanMediaAssistantFields({
      needsPreview: input.needs_preview,
      previewMediaId: mediaPrepared.previewMediaId,
      mediaRoutingByDestination: mediaPrepared.mediaRouting
    })
  };

  const existing = await prisma.postDistributionPlan.findFirst({
    where: { postId, creatorId, status: "active" },
    include: { _count: { select: { variants: true } } }
  });

  const acceptedCopy = assistantContext.accepted_copy_by_destination;
  const hasAcceptedCopy =
    acceptedCopy != null &&
    typeof acceptedCopy === "object" &&
    Object.keys(acceptedCopy).length > 0;

  const reuseCoachStub =
    Boolean(existing) &&
    existing!.assistantMode === COACH_REVIEW_ASSISTANT_MODE &&
    existing!._count.variants === 0 &&
    hasAcceptedCopy;

  if (existing && !reuseCoachStub) {
    await prisma.postDistributionPlan.update({
      where: { id: existing.id },
      data: { status: "archived" }
    });
  }

  const plan = await prisma.$transaction(async (tx) => {
    let planId: string;
    if (reuseCoachStub && existing) {
      const priorPlan =
        existing.assistantPlan &&
        typeof existing.assistantPlan === "object" &&
        !Array.isArray(existing.assistantPlan)
          ? (existing.assistantPlan as Record<string, unknown>)
          : {};
      const cleanedPlan = finalizeAssistantPlanFromCheckpoint(priorPlan, assistantPlan);
      await tx.postDistributionPlan.update({
        where: { id: existing.id },
        data: {
          sourceDraftId: input.source_draft_id?.trim() || null,
          status: "active",
          assistantMode,
          assistantContext: assistantContext as object,
          assistantPlan: cleanedPlan as object
        }
      });
      planId = existing.id;
    } else {
      const created = await tx.postDistributionPlan.create({
        data: {
          creatorId,
          postId,
          sourceDraftId: input.source_draft_id?.trim() || null,
          status: "active",
          assistantMode,
          assistantContext: assistantContext as object,
          assistantPlan: assistantPlan as object
        }
      });
      planId = created.id;
    }

    const createdVariants: Array<{
      id: string;
      destination: string;
      assistantEnabled: boolean;
      advice: unknown;
    }> = [];

    for (const variant of formatted) {
      const row = await tx.postDistributionVariant.create({
        data: {
          planId,
          postId,
          creatorId,
          destination: variant.destination,
          status: "draft",
          assistantEnabled: assistantEnabledSet.has(variant.destination),
          title: variant.title,
          bodyText: variant.bodyText,
          postText: variant.postText,
          tags: variant.tags,
          platformFields: variant.platformFields as object,
          advice: variant.advice as object
        }
      });
      createdVariants.push(row);
    }

    if (assistantEnabledSet.size > 0) {
      await persistPostbotTasksForPlan(tx, {
        creatorId,
        postId,
        planId,
        variants: createdVariants,
        assistantContext
      });
    }

    return tx.postDistributionPlan.findUniqueOrThrow({
      where: { id: planId },
      include: {
        variants: {
          include: {
            attempts: { orderBy: { createdAt: "desc" }, take: 1 },
            postbotTasks: { orderBy: { createdAt: "asc" } }
          }
        }
      }
    });
  });

  return mapPlan(plan);
}

export async function getPostDistributionPlan(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<DistributionPlanWire | null> {
  const plan = await prisma.postDistributionPlan.findFirst({
    where: { postId, creatorId, status: "active" },
    include: {
      variants: {
        include: {
          attempts: { orderBy: { createdAt: "desc" }, take: 1 },
          postbotTasks: { orderBy: { createdAt: "asc" } }
        }
      }
    }
  });
  return plan ? mapPlan(plan) : null;
}

export type PatchDistributionVariantInput = {
  title?: string | null;
  body_text?: string | null;
  post_text?: string | null;
  tags?: string[];
  locale?: string | null;
  scheduled_for?: string | null;
  remind_me?: boolean;
  platform_fields?: Record<string, unknown>;
};

export async function patchDistributionVariant(
  prisma: PrismaClient,
  creatorId: string,
  variantId: string,
  input: PatchDistributionVariantInput
): Promise<DistributionVariantWire> {
  const row = await prisma.postDistributionVariant.findFirst({
    where: { id: variantId, creatorId },
    include: {
      attempts: { orderBy: { createdAt: "desc" }, take: 1 },
      postbotTasks: { orderBy: { createdAt: "asc" } }
    }
  });
  if (!row) {
    throw new PostDistributionNotFoundError("Variant not found.");
  }
  if (row.status === "posted") {
    throw new PostDistributionValidationError("Posted variants cannot be edited.", [
      { field: "variant_id", issue: "locked" }
    ]);
  }

  const nextBodyText =
    input.body_text !== undefined ? input.body_text?.trim() || null : row.bodyText;
  const nextTags =
    input.tags !== undefined
      ? row.destination === "deviantart"
        ? Array.from(
            new Set(input.tags.map(normalizeDeviantArtTag).filter(Boolean))
          )
        : input.tags.map((t) => t.trim()).filter(Boolean)
      : row.tags;
  const nextPostText =
    row.destination === "x" && (input.body_text !== undefined || input.tags !== undefined)
      ? buildXPostTextWithTags("", nextBodyText ?? row.postText ?? "", nextTags)
      : input.post_text !== undefined
        ? input.post_text?.trim() || null
        : row.postText;

  const updated = await prisma.postDistributionVariant.update({
    where: { id: variantId },
    data: {
      ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
      ...(input.body_text !== undefined ? { bodyText: nextBodyText } : {}),
      ...(input.post_text !== undefined || row.destination === "x" ? { postText: nextPostText } : {}),
      ...(input.tags !== undefined ? { tags: nextTags } : {}),
      ...(input.locale !== undefined ? { locale: input.locale?.trim() || null } : {}),
      ...(input.scheduled_for !== undefined
        ? {
            scheduledFor: input.scheduled_for ? new Date(input.scheduled_for) : null,
            // Re-arming: a new/changed schedule should be eligible for a fresh reminder ping.
            reminderSentAt: null
          }
        : {}),
      ...(input.remind_me !== undefined ? { remindMe: input.remind_me } : {}),
      ...(input.platform_fields !== undefined ? { platformFields: input.platform_fields as object } : {})
    },
    include: {
      attempts: { orderBy: { createdAt: "desc" }, take: 1 },
      postbotTasks: { orderBy: { createdAt: "asc" } }
    }
  });
  return mapVariant(updated);
}

export async function approveDistributionVariant(
  prisma: PrismaClient,
  creatorId: string,
  variantId: string
): Promise<DistributionVariantWire> {
  const row = await prisma.postDistributionVariant.findFirst({
    where: { id: variantId, creatorId }
  });
  if (!row) {
    throw new PostDistributionNotFoundError("Variant not found.");
  }
  const updated = await prisma.postDistributionVariant.update({
    where: { id: variantId },
    data: { status: "approved", approvedAt: new Date() },
    include: {
      attempts: { orderBy: { createdAt: "desc" }, take: 1 },
      postbotTasks: { orderBy: { createdAt: "asc" } }
    }
  });
  return mapVariant(updated);
}

export async function startDistributionHandoff(
  prisma: PrismaClient,
  creatorId: string,
  variantId: string,
  opts?: { extension_installation_id?: string | null; extension_tab_id?: number | null }
): Promise<DistributionAttemptWire> {
  const variant = await prisma.postDistributionVariant.findFirst({
    where: { id: variantId, creatorId }
  });
  if (!variant) {
    throw new PostDistributionNotFoundError("Variant not found.");
  }
  if (variant.status !== "approved" && variant.status !== "handed_off" && variant.status !== "draft") {
    throw new PostDistributionValidationError("Variant is not ready for handoff.", [
      { field: "variant_id", issue: "invalid_status" }
    ]);
  }

  const attempt = await prisma.$transaction(async (tx) => {
    if (variant.status === "draft") {
      await tx.postDistributionVariant.update({
        where: { id: variantId },
        data: { status: "approved", approvedAt: new Date() }
      });
    }
    await tx.postDistributionVariant.update({
      where: { id: variantId },
      data: { status: "handed_off" }
    });
    return tx.postDistributionAttempt.create({
      data: {
        id: `pda_${randomUUID()}`,
        variantId,
        postId: variant.postId,
        creatorId,
        destination: variant.destination,
        status: "started",
        extensionInstallationId: opts?.extension_installation_id?.trim() || null,
        extensionTabId: opts?.extension_tab_id ?? null
      }
    });
  });

  return mapAttempt(attempt);
}

export type FillResultInput = {
  status: "fill_succeeded" | "fill_partial" | "fill_failed";
  fill_result?: Record<string, unknown>;
  extension_tab_id?: number | null;
  error_code?: string | null;
  error_detail?: string | null;
};

export async function recordDistributionFillResult(
  prisma: PrismaClient,
  creatorId: string,
  attemptId: string,
  input: FillResultInput
): Promise<DistributionAttemptWire> {
  const attempt = await prisma.postDistributionAttempt.findFirst({
    where: { id: attemptId, creatorId }
  });
  if (!attempt) {
    throw new PostDistributionNotFoundError("Attempt not found.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.postDistributionAttempt.update({
      where: { id: attemptId },
      data: {
        status: input.status,
        fillResult: (input.fill_result ?? {}) as object,
        extensionTabId: input.extension_tab_id ?? attempt.extensionTabId,
        errorCode: input.error_code?.trim() || null,
        errorDetail: input.error_detail?.trim() || null
      }
    });
    if (input.status === "fill_failed") {
      await tx.postDistributionVariant.update({
        where: { id: attempt.variantId },
        data: { status: "fill_failed" }
      });
    }
    return row;
  });

  return mapAttempt(updated);
}

export type CompleteDistributionInput = {
  external_url?: string | null;
  external_id?: string | null;
  status?: "posted" | "abandoned" | "failed";
};

export async function completeDistributionAttempt(
  prisma: PrismaClient,
  creatorId: string,
  attemptId: string,
  input: CompleteDistributionInput
): Promise<DistributionAttemptWire> {
  const attempt = await prisma.postDistributionAttempt.findFirst({
    where: { id: attemptId, creatorId },
    include: {
      variant: {
        select: { platformFields: true }
      }
    }
  });
  if (!attempt) {
    throw new PostDistributionNotFoundError("Attempt not found.");
  }

  const variantPlatformFields =
    attempt.variant?.platformFields &&
    typeof attempt.variant.platformFields === "object" &&
    !Array.isArray(attempt.variant.platformFields)
      ? (attempt.variant.platformFields as Record<string, unknown>)
      : {};
  const contentVariantRole = contentVariantRoleFromPlatformFields(variantPlatformFields);

  const finalStatus = input.status ?? "posted";
  const normalizedIdentity = normalizeCompleteDistributionIdentity(
    attempt.destination,
    input.external_url,
    input.external_id
  );
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.postDistributionAttempt.update({
      where: { id: attemptId },
      data: {
        status: finalStatus,
        externalUrl: normalizedIdentity.external_url,
        externalId: normalizedIdentity.external_id,
        completedAt: new Date()
      }
    });
    if (finalStatus === "posted") {
      await tx.postDistributionVariant.update({
        where: { id: attempt.variantId },
        data: { status: "posted" }
      });
      await upsertPlatformInstanceFromAttempt(tx, {
        attemptId: row.id,
        creatorId: row.creatorId,
        postId: row.postId,
        destination: row.destination,
        externalUrl: row.externalUrl,
        externalId: row.externalId,
        linkedAt: row.completedAt ?? new Date(),
        contentVariantRole
      });
    }
    return row;
  });

  // VS8-T04 — sync PostBot task + Goal Cycle slot/plan (idempotent; partial-safe).
  await syncGoalCycleDestinationCompletion(prisma, {
    creatorId,
    attemptId,
    finalStatus
  });

  return mapAttempt(updated);
}

export async function getDistributionAttempt(
  prisma: PrismaClient,
  creatorId: string,
  attemptId: string
): Promise<DistributionAttemptWire | null> {
  const attempt = await prisma.postDistributionAttempt.findFirst({
    where: { id: attemptId, creatorId }
  });
  return attempt ? mapAttempt(attempt) : null;
}

export async function getPostDistributionSummary(
  prisma: PrismaClient,
  creatorId: string,
  postId: string
): Promise<DistributionSummaryWire> {
  const variants = await prisma.postDistributionVariant.findMany({
    where: { postId, creatorId },
    include: {
      attempts: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });

  const byDest = new Map<string, (typeof variants)[number]>();
  for (const v of variants) {
    byDest.set(v.destination, v);
  }

  const destinations = (["patreon", "x", "deviantart", "bluesky"] as const).map((destination) => {
    const variant = byDest.get(destination);
    const attempt = variant?.attempts[0];
    return {
      destination,
      variant_status: variant?.status ?? null,
      attempt_status: attempt?.status ?? null,
      attempt_id: attempt?.id ?? null,
      external_url: attempt?.externalUrl ?? null,
      external_id: attempt?.externalId ?? null
    };
  });

  return { post_id: postId, destinations };
}

export async function getDistributionSummariesForPosts(
  prisma: PrismaClient,
  creatorId: string,
  postIds: string[]
): Promise<Map<string, DistributionSummaryWire>> {
  const unique = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, DistributionSummaryWire>();
  if (unique.length === 0) return out;

  const variants = await prisma.postDistributionVariant.findMany({
    where: { creatorId, postId: { in: unique } },
    include: {
      attempts: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });

  const byPost = new Map<string, typeof variants>();
  for (const variant of variants) {
    const list = byPost.get(variant.postId) ?? [];
    list.push(variant);
    byPost.set(variant.postId, list);
  }

  for (const postId of unique) {
    const rows = byPost.get(postId) ?? [];
    const byDest = new Map<string, (typeof rows)[number]>();
    for (const v of rows) {
      byDest.set(v.destination, v);
    }
    const destinations = (["patreon", "x", "deviantart", "bluesky"] as const).map((destination) => {
      const variant = byDest.get(destination);
      const attempt = variant?.attempts[0];
      return {
        destination,
        variant_status: variant?.status ?? null,
        attempt_status: attempt?.status ?? null,
        attempt_id: attempt?.id ?? null,
        external_url: attempt?.externalUrl ?? null,
        external_id: attempt?.externalId ?? null
      };
    });
    if (rows.length > 0) {
      out.set(postId, { post_id: postId, destinations });
    }
  }

  return out;
}

export async function loadVariantForPackage(
  prisma: PrismaClient,
  creatorId: string,
  attemptId: string
): Promise<{
  attempt: DistributionAttemptWire;
  variant: DistributionVariantWire;
  assistant_plan: Record<string, unknown>;
} | null> {
  const attemptRow = await prisma.postDistributionAttempt.findFirst({
    where: { id: attemptId, creatorId },
    include: {
      variant: {
        include: {
          plan: { select: { assistantPlan: true } },
          attempts: { orderBy: { createdAt: "desc" }, take: 1 },
          postbotTasks: { orderBy: { createdAt: "asc" } }
        }
      }
    }
  });
  if (!attemptRow?.variant) return null;
  const assistantPlan =
    attemptRow.variant.plan.assistantPlan &&
    typeof attemptRow.variant.plan.assistantPlan === "object" &&
    !Array.isArray(attemptRow.variant.plan.assistantPlan)
      ? (attemptRow.variant.plan.assistantPlan as Record<string, unknown>)
      : {};
  return {
    attempt: mapAttempt(attemptRow),
    variant: mapVariant(attemptRow.variant),
    assistant_plan: assistantPlan
  };
}

export function variantToContentOverride(variant: DistributionVariantWire): Record<string, unknown> {
  const dest = variant.destination;
  if (dest === "x") {
    return { post_text: variant.post_text ?? "" };
  }
  if (dest === "deviantart") {
    return {
      title: variant.title ?? "",
      body_text: variant.body_text ?? "",
      tags: variant.tags
    };
  }
  if (dest === "patreon") {
    return {
      title: variant.title ?? "",
      body_text: variant.body_text ?? ""
    };
  }
  return { post_text: variant.post_text ?? "" };
}

export async function assertDistributionDestination(value: string): Promise<DistributionDestination> {
  if (!isDistributionDestination(value)) {
    throw new PostDistributionValidationError("Invalid destination.", [
      { field: "destination", issue: "invalid" }
    ]);
  }
  return value;
}

export type { FormattedPlatformVariant };
