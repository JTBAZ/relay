/**
 * Autopost WI-2 / WI-4 — hybrid draft workspace (creator-only) before Relay publish.
 *
 * Multi-draft: creators may hold several active drafts (soft-cap).
 * `nudged` rows are reserved for goal-driven slots and may have empty media_ids.
 */
import {
  MediaIngestOrigin,
  MediaProcessingStatus,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createRelayPostTransaction, RelayCreatePostError } from "../relay/create-relay-post.js";
import {
  collectMediaCaptions,
  generateAutopostDraftCopy
} from "./autopost-draft-ai.js";
import {
  requireCreatorStyleProfile,
  type CreatorStyleProfileWire
} from "./style-profile-service.js";
import { loadStudioMountedContext } from "../creator/studio-mounted-context.js";

export const AUTOPOST_ACTIVE_STATUSES = ["nudged", "drafting", "previewing"] as const;
export type AutopostDraftStatus = (typeof AUTOPOST_ACTIVE_STATUSES)[number] | "published" | "discarded";

export const AUTOPOST_COMPOSER_STEPS = [
  "pick-media",
  "draft-post",
  "variation-planning",
  "variant-review",
  "cross-post",
  "complete"
] as const;
export type AutopostComposerStep = (typeof AUTOPOST_COMPOSER_STEPS)[number];

export const AUTOPOST_ACTIVE_DRAFT_SOFT_CAP = 20;

export type PlannedPostFormat = "text" | "image" | "video" | "mixed";

export type AutopostDraftWorkspace = {
  selected_destinations?: string[];
  /** Planned format from Schedule Create Event dialogue (no schema migration). */
  planned_format?: PlannedPostFormat;
  /** Distribution-rule source Relay/Patreon post (read-only bootstrap). */
  source_post_id?: string;
  automation_rule_id?: string;
  transform_mode?: "preview" | string;
  /** Automations-owned correlation (additive; legacy drafts omit these). */
  automation_id?: string;
  automation_run_id?: string;
  distribution_rule_run_id?: string;
  preview_template_id?: string | null;
  tags?: string[];
  tier_ids?: string[];
  is_public?: boolean;
  campaign_id?: string | null;
  needs_preview?: boolean | null;
};

const PLANNED_POST_FORMATS = new Set<string>(["text", "image", "video", "mixed"]);

export function isPlannedPostFormat(value: unknown): value is PlannedPostFormat {
  return typeof value === "string" && PLANNED_POST_FORMATS.has(value);
}

export type AutopostDraftWire = {
  draft_id: string;
  creator_id: string;
  status: string;
  media_ids: string[];
  title: string | null;
  body_text: string | null;
  style_profile_id: string | null;
  intent: string | null;
  performance_goal_id: string | null;
  composer_step: string;
  workspace: AutopostDraftWorkspace;
  enhancements: Record<string, unknown>;
  distribution_log: Record<string, unknown>;
  published_post_id: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Read-only source post snapshot for distribution-rule preview drafts.
   * Media ids are informational only — never reserved onto this draft.
   */
  source_preview?: {
    post_id: string;
    title: string | null;
    body_text: string | null;
    media_ids: string[];
    published_at: string | null;
  } | null;
};

export type AutopostDraftSaveInput = {
  media_ids: string[];
  title?: string | null;
  body_text?: string | null;
  generate?: boolean;
  intent?: string | null;
  performance_goal_id?: string | null;
  /** Default: nudged when media empty, else previewing. */
  status?: "nudged" | "drafting" | "previewing";
  composer_step?: string;
  workspace?: AutopostDraftWorkspace;
};

export type AutopostDraftPatchInput = {
  title?: string | null;
  body_text?: string | null;
  regenerate?: boolean;
  status?: string;
  intent?: string | null;
  performance_goal_id?: string | null;
  composer_step?: string;
  workspace?: AutopostDraftWorkspace;
  media_ids?: string[];
};

export type AutopostDraftPublishInput = {
  campaign_id?: string | null;
  is_public: boolean;
  required_tier_id?: string | null;
  tier_ids?: string[];
  tag_ids?: string[];
  title?: string | null;
  description?: string | null;
};

export type AutopostDistributionDestination = "patreon" | "x" | "bluesky" | "deviantart" | "relay";

export type ListAutopostDraftsOptions = {
  /** `active` (default) | `published` | `all` (active + published) */
  status?: "active" | "published" | "all";
  limit?: number;
};

export class AutopostDraftValidationError extends Error {
  public override readonly name = "AutopostDraftValidationError";
  public constructor(
    message: string,
    public readonly details: Array<{ field: string; issue: string }>
  ) {
    super(message);
  }
}

/** @deprecated Multi-draft no longer throws this; kept for API type compatibility. */
export class AutopostDraftConflictError extends Error {
  public override readonly name = "AutopostDraftConflictError";
  public constructor(
    message: string,
    public readonly active_draft_id: string
  ) {
    super(message);
  }
}

export class AutopostDraftDiscardWarningError extends Error {
  public override readonly name = "AutopostDraftDiscardWarningError";
  public constructor(
    message: string,
    public readonly distribution_log: Record<string, unknown>
  ) {
    super(message);
  }
}

const STAGING_ORIGINS: MediaIngestOrigin[] = [
  MediaIngestOrigin.DISCORD,
  MediaIngestOrigin.RELAY_UPLOAD
];

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapWorkspace(value: unknown): AutopostDraftWorkspace {
  const raw = asRecord(value);
  const workspace: AutopostDraftWorkspace = {};
  if (Array.isArray(raw.selected_destinations)) {
    workspace.selected_destinations = raw.selected_destinations.map(String);
  }
  if (isPlannedPostFormat(raw.planned_format)) {
    workspace.planned_format = raw.planned_format;
  }
  if (typeof raw.source_post_id === "string" && raw.source_post_id.trim()) {
    workspace.source_post_id = raw.source_post_id.trim();
  }
  if (typeof raw.automation_rule_id === "string" && raw.automation_rule_id.trim()) {
    workspace.automation_rule_id = raw.automation_rule_id.trim();
  }
  if (typeof raw.transform_mode === "string" && raw.transform_mode.trim()) {
    workspace.transform_mode = raw.transform_mode.trim();
  }
  if (typeof raw.automation_id === "string" && raw.automation_id.trim()) {
    workspace.automation_id = raw.automation_id.trim();
  }
  if (typeof raw.automation_run_id === "string" && raw.automation_run_id.trim()) {
    workspace.automation_run_id = raw.automation_run_id.trim();
  }
  if (typeof raw.distribution_rule_run_id === "string" && raw.distribution_rule_run_id.trim()) {
    workspace.distribution_rule_run_id = raw.distribution_rule_run_id.trim();
  }
  if (raw.preview_template_id === null) {
    workspace.preview_template_id = null;
  } else if (typeof raw.preview_template_id === "string" && raw.preview_template_id.trim()) {
    workspace.preview_template_id = raw.preview_template_id.trim();
  }
  if (Array.isArray(raw.tags)) {
    workspace.tags = raw.tags.map(String);
  }
  if (Array.isArray(raw.tier_ids)) {
    workspace.tier_ids = raw.tier_ids.map(String);
  }
  if (typeof raw.is_public === "boolean") {
    workspace.is_public = raw.is_public;
  }
  if (raw.campaign_id === null || typeof raw.campaign_id === "string") {
    workspace.campaign_id = raw.campaign_id as string | null;
  }
  if (raw.needs_preview === null || typeof raw.needs_preview === "boolean") {
    workspace.needs_preview = raw.needs_preview as boolean | null;
  }
  return workspace;
}

function mergeWorkspace(
  existing: unknown,
  patch: AutopostDraftWorkspace | undefined
): AutopostDraftWorkspace {
  if (!patch) return mapWorkspace(existing);
  return { ...mapWorkspace(existing), ...patch };
}

function normalizeComposerStep(raw: string | undefined | null, fallback = "pick-media"): string {
  const step = (raw ?? fallback).trim();
  if (!(AUTOPOST_COMPOSER_STEPS as readonly string[]).includes(step)) {
    throw new AutopostDraftValidationError("Invalid composer_step.", [
      { field: "composer_step", issue: "invalid" }
    ]);
  }
  return step;
}

type DraftRow = {
  id: string;
  creatorId: string;
  status: string;
  mediaIds: string[];
  title: string | null;
  bodyText: string | null;
  styleProfileId: string | null;
  intent: string | null;
  performanceGoalId: string | null;
  composerStep: string;
  workspace: unknown;
  enhancements: unknown;
  distributionLog: unknown;
  publishedPostId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapDraft(row: DraftRow): AutopostDraftWire {
  return {
    draft_id: row.id,
    creator_id: row.creatorId,
    status: row.status,
    media_ids: row.mediaIds,
    title: row.title,
    body_text: row.bodyText,
    style_profile_id: row.styleProfileId,
    intent: row.intent ?? null,
    performance_goal_id: row.performanceGoalId ?? null,
    composer_step: row.composerStep || "pick-media",
    workspace: mapWorkspace(row.workspace),
    enhancements: asRecord(row.enhancements),
    distribution_log: asRecord(row.distributionLog),
    published_post_id: row.publishedPostId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

function normalizeMediaIds(raw: string[]): string[] {
  return [...new Set(raw.map((s) => s.trim()).filter(Boolean))];
}

function hasDistributionEntries(log: Record<string, unknown>): boolean {
  return Object.keys(log).length > 0;
}

async function findActiveDraft(prisma: PrismaClient, creatorId: string) {
  return prisma.autopostDraft.findFirst({
    where: { creatorId, status: { in: [...AUTOPOST_ACTIVE_STATUSES] } },
    orderBy: { updatedAt: "desc" }
  });
}

async function countActiveDrafts(prisma: PrismaClient, creatorId: string): Promise<number> {
  return prisma.autopostDraft.count({
    where: { creatorId, status: { in: [...AUTOPOST_ACTIVE_STATUSES] } }
  });
}

async function assertUnderActiveSoftCap(prisma: PrismaClient, creatorId: string) {
  const count = await countActiveDrafts(prisma, creatorId);
  if (count >= AUTOPOST_ACTIVE_DRAFT_SOFT_CAP) {
    throw new AutopostDraftValidationError(
      `Active draft limit reached (${AUTOPOST_ACTIVE_DRAFT_SOFT_CAP}). Discard or publish a draft first.`,
      [{ field: "active_draft_limit", issue: String(AUTOPOST_ACTIVE_DRAFT_SOFT_CAP) }]
    );
  }
}

async function loadStagingMedia(
  prisma: PrismaClient,
  creatorId: string,
  mediaIds: string[],
  opts?: { allowDraftId?: string; allowEmpty?: boolean }
) {
  if (mediaIds.length === 0) {
    if (opts?.allowEmpty) return [];
    throw new AutopostDraftValidationError("At least one media_id is required.", [
      { field: "media_ids", issue: "required" }
    ]);
  }
  const rows = await prisma.mediaAsset.findMany({
    where: {
      id: { in: mediaIds },
      creatorId,
      ingestOrigin: { in: STAGING_ORIGINS },
      primaryPostId: null,
      processingStatus: MediaProcessingStatus.READY,
      OR: opts?.allowDraftId
        ? [{ autopostDraftId: null }, { autopostDraftId: opts.allowDraftId }]
        : [{ autopostDraftId: null }]
    }
  });
  if (rows.length !== mediaIds.length) {
    throw new AutopostDraftValidationError(
      "One or more media_ids are not available in the staging bin.",
      [{ field: "media_ids", issue: "not_staging_ready" }]
    );
  }
  return rows;
}

async function reserveMediaForDraft(
  tx: Prisma.TransactionClient,
  draftId: string,
  creatorId: string,
  mediaIds: string[]
) {
  await tx.mediaAsset.updateMany({
    where: { creatorId, autopostDraftId: draftId },
    data: { autopostDraftId: null }
  });
  if (mediaIds.length === 0) return;
  await tx.mediaAsset.updateMany({
    where: {
      id: { in: mediaIds },
      creatorId,
      primaryPostId: null,
      OR: [{ autopostDraftId: null }, { autopostDraftId: draftId }]
    },
    data: { autopostDraftId: draftId }
  });
}

async function releaseMediaForDraft(
  tx: Prisma.TransactionClient,
  draftId: string,
  creatorId: string
) {
  await tx.mediaAsset.updateMany({
    where: { creatorId, autopostDraftId: draftId },
    data: { autopostDraftId: null }
  });
}

export async function getActiveAutopostDraft(
  prisma: PrismaClient,
  creatorId: string
): Promise<AutopostDraftWire | null> {
  const row = await findActiveDraft(prisma, creatorId);
  return row ? mapDraft(row as DraftRow) : null;
}

export async function listAutopostDrafts(
  prisma: PrismaClient,
  creatorId: string,
  options?: ListAutopostDraftsOptions
): Promise<AutopostDraftWire[]> {
  const statusFilter = options?.status ?? "active";
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  let statuses: string[];
  if (statusFilter === "published") {
    statuses = ["published"];
  } else if (statusFilter === "all") {
    statuses = [...AUTOPOST_ACTIVE_STATUSES, "published"];
  } else {
    statuses = [...AUTOPOST_ACTIVE_STATUSES];
  }

  const rows = await prisma.autopostDraft.findMany({
    where: { creatorId, status: { in: statuses } },
    orderBy: { updatedAt: "desc" },
    take: limit
  });
  return rows.map((row) => mapDraft(row as DraftRow));
}

export async function getAutopostDraft(
  prisma: PrismaClient,
  creatorId: string,
  draftId: string
): Promise<AutopostDraftWire> {
  const row = await prisma.autopostDraft.findFirst({
    where: { id: draftId.trim(), creatorId }
  });
  if (!row) {
    throw new AutopostDraftValidationError("Autopost draft not found.", [
      { field: "draft_id", issue: "not_found" }
    ]);
  }
  const wire = mapDraft(row as DraftRow);
  const sourcePostId = wire.workspace.source_post_id?.trim();
  if (!sourcePostId) return wire;

  const version = await prisma.postVersion.findFirst({
    where: { postId: sourcePostId, post: { creatorId } },
    orderBy: { versionSeq: "desc" },
    select: {
      title: true,
      description: true,
      mediaIds: true,
      publishedAt: true
    }
  });
  if (!version) {
    return { ...wire, source_preview: null };
  }
  return {
    ...wire,
    source_preview: {
      post_id: sourcePostId,
      title: version.title,
      body_text: version.description,
      media_ids: version.mediaIds ?? [],
      published_at: version.publishedAt?.toISOString() ?? null
    }
  };
}

export async function saveAutopostDraft(
  prisma: PrismaClient,
  creatorId: string,
  input: AutopostDraftSaveInput
): Promise<AutopostDraftWire> {
  const mediaIds = normalizeMediaIds(input.media_ids ?? []);
  const emptyMedia = mediaIds.length === 0;

  let status: string;
  if (input.status) {
    status = input.status;
  } else {
    status = emptyMedia ? "nudged" : "previewing";
  }

  if (emptyMedia && status !== "nudged") {
    throw new AutopostDraftValidationError(
      "Empty media_ids are only allowed for nudged drafts.",
      [{ field: "media_ids", issue: "required" }]
    );
  }
  if (!emptyMedia && status === "nudged") {
    throw new AutopostDraftValidationError(
      "Nudged drafts must have empty media_ids until art is attached.",
      [{ field: "status", issue: "invalid" }]
    );
  }

  await assertUnderActiveSoftCap(prisma, creatorId);

  const shouldGenerate = !emptyMedia && input.generate !== false;
  if (emptyMedia && input.generate === true) {
    throw new AutopostDraftValidationError("Cannot generate copy without media.", [
      { field: "generate", issue: "requires_media" }
    ]);
  }

  const styleProfile = shouldGenerate
    ? await requireCreatorStyleProfile(prisma, creatorId)
    : null;

  if (!emptyMedia) {
    await loadStagingMedia(prisma, creatorId, mediaIds);
  }

  const mediaRows = emptyMedia
    ? []
    : await prisma.mediaAsset.findMany({
        where: { id: { in: mediaIds }, creatorId },
        select: { discordCaptureJson: true }
      });

  let title = input.title ?? null;
  let bodyText = input.body_text ?? null;
  const intent = input.intent?.trim() ? input.intent.trim() : null;

  if (shouldGenerate) {
    const mounted = await loadStudioMountedContext(prisma, creatorId);
    const ai = await generateAutopostDraftCopy({
      styleProfile: styleProfile!,
      mediaCaptions: collectMediaCaptions(mediaRows),
      titleHint: title,
      draft_intent: intent,
      studio_brief: mounted.assistant_context,
      mounted_report: mounted.mounted_report,
      creatorId
    });
    if (!ai.ok) {
      throw new AutopostDraftValidationError(ai.error, [{ field: "generate", issue: "ai_failed" }]);
    }
    if (!title?.trim() && ai.title) title = ai.title;
    if (bodyText == null || (input.generate === true && !input.body_text)) {
      bodyText = ai.body_text;
    }
  }

  const composerStep = normalizeComposerStep(
    input.composer_step,
    emptyMedia ? "pick-media" : "draft-post"
  );
  const workspace = mergeWorkspace({}, input.workspace);
  const performanceGoalId = input.performance_goal_id?.trim()
    ? input.performance_goal_id.trim()
    : null;

  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.autopostDraft.create({
      data: {
        creatorId,
        status,
        mediaIds,
        title: title?.trim() ? title.trim() : null,
        bodyText: bodyText?.trim() ? bodyText : null,
        styleProfileId: styleProfile?.profile_id ?? null,
        intent,
        performanceGoalId,
        composerStep,
        workspace: workspace as Prisma.InputJsonValue
      }
    });
    await reserveMediaForDraft(tx, created.id, creatorId, mediaIds);
    return created;
  });

  return mapDraft(draft as DraftRow);
}

export async function patchAutopostDraft(
  prisma: PrismaClient,
  creatorId: string,
  draftId: string,
  input: AutopostDraftPatchInput
): Promise<AutopostDraftWire> {
  const row = await prisma.autopostDraft.findFirst({
    where: { id: draftId, creatorId, status: { in: [...AUTOPOST_ACTIVE_STATUSES] } }
  });
  if (!row) {
    throw new AutopostDraftValidationError("Active Autopost draft not found.", [
      { field: "draft_id", issue: "not_found" }
    ]);
  }

  let title = input.title !== undefined ? input.title : row.title;
  let bodyText = input.body_text !== undefined ? input.body_text : row.bodyText;
  let status = input.status?.trim() || row.status;
  let mediaIds = row.mediaIds;
  const mediaChanging = input.media_ids !== undefined;

  if (mediaChanging) {
    mediaIds = normalizeMediaIds(input.media_ids ?? []);
    if (mediaIds.length === 0) {
      if (status !== "nudged" && !input.status) {
        status = "nudged";
      }
      if (status !== "nudged") {
        throw new AutopostDraftValidationError(
          "Empty media_ids are only allowed for nudged drafts.",
          [{ field: "media_ids", issue: "required" }]
        );
      }
    } else {
      await loadStagingMedia(prisma, creatorId, mediaIds, { allowDraftId: draftId });
      if (status === "nudged" && !input.status) {
        status = "drafting";
      }
    }
  }

  if (input.composer_step !== undefined) {
    normalizeComposerStep(input.composer_step, row.composerStep);
  }

  if (input.regenerate) {
    if (mediaIds.length === 0) {
      throw new AutopostDraftValidationError("Cannot regenerate copy without media.", [
        { field: "regenerate", issue: "requires_media" }
      ]);
    }
    const styleProfile = await requireCreatorStyleProfile(prisma, creatorId);
    const mediaRows = await prisma.mediaAsset.findMany({
      where: { id: { in: mediaIds }, creatorId },
      select: { discordCaptureJson: true }
    });
    const intentForAi =
      input.intent !== undefined
        ? input.intent?.trim()
          ? input.intent.trim()
          : null
        : row.intent;
    const mounted = await loadStudioMountedContext(prisma, creatorId, {
      postId: row.publishedPostId
    });
    const ai = await generateAutopostDraftCopy({
      styleProfile,
      mediaCaptions: collectMediaCaptions(mediaRows),
      titleHint: title,
      draft_intent: intentForAi,
      studio_brief: mounted.assistant_context,
      mounted_report: mounted.mounted_report,
      creatorId
    });
    if (!ai.ok) {
      throw new AutopostDraftValidationError(ai.error, [{ field: "regenerate", issue: "ai_failed" }]);
    }
    if (ai.title) title = ai.title;
    bodyText = ai.body_text;
    status = "previewing";
  }

  const workspace = mergeWorkspace(row.workspace, input.workspace);
  const intent =
    input.intent !== undefined
      ? input.intent?.trim()
        ? input.intent.trim()
        : null
      : row.intent;
  const performanceGoalId =
    input.performance_goal_id !== undefined
      ? input.performance_goal_id?.trim()
        ? input.performance_goal_id.trim()
        : null
      : row.performanceGoalId;
  const composerStep =
    input.composer_step !== undefined
      ? normalizeComposerStep(input.composer_step, row.composerStep)
      : row.composerStep || "pick-media";

  const updated = await prisma.$transaction(async (tx) => {
    if (mediaChanging) {
      await reserveMediaForDraft(tx, draftId, creatorId, mediaIds);
    }
    return tx.autopostDraft.update({
      where: { id: draftId },
      data: {
        title: title?.trim() ? title.trim() : null,
        bodyText: bodyText?.trim() ? bodyText : null,
        status,
        mediaIds,
        intent,
        performanceGoalId,
        composerStep,
        workspace: workspace as Prisma.InputJsonValue
      }
    });
  });
  return mapDraft(updated as DraftRow);
}

export async function publishAutopostDraft(
  prisma: PrismaClient,
  creatorId: string,
  draftId: string,
  input: AutopostDraftPublishInput
): Promise<{ draft: AutopostDraftWire; post_id: string }> {
  const row = await prisma.autopostDraft.findFirst({
    where: { id: draftId, creatorId, status: { in: [...AUTOPOST_ACTIVE_STATUSES] } }
  });
  if (!row) {
    throw new AutopostDraftValidationError("Active Autopost draft not found.", [
      { field: "draft_id", issue: "not_found" }
    ]);
  }
  if (row.mediaIds.length === 0) {
    throw new AutopostDraftValidationError("Attach media before publishing.", [
      { field: "media_ids", issue: "required" }
    ]);
  }

  const title = (input.title ?? row.title ?? "").trim() || "Untitled";
  const description = input.description ?? row.bodyText ?? null;
  const tierIds = (input.tier_ids ?? []).map((t) => String(t).trim()).filter(Boolean);
  const tagIds = (input.tag_ids ?? []).map((t) => String(t).trim()).filter(Boolean);

  let createdPostId: string;
  try {
    const postId = `relay_p_${randomUUID()}`;
    const out = await createRelayPostTransaction(prisma, postId, {
      creatorId,
      campaignId: input.campaign_id ?? null,
      title,
      description,
      isPublic: input.is_public,
      requiredTierId: input.is_public ? null : (input.required_tier_id?.trim() ?? null),
      tierIds,
      tagIds,
      mediaIds: row.mediaIds,
      publish: true,
      publishedAtInput: null
    });
    createdPostId = out.post.id;
  } catch (err) {
    if (err instanceof RelayCreatePostError) {
      throw new AutopostDraftValidationError(err.message, [{ field: "publish", issue: err.code }]);
    }
    throw err;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.mediaAsset.updateMany({
      where: { creatorId, autopostDraftId: draftId },
      data: { autopostDraftId: null }
    });
    return tx.autopostDraft.update({
      where: { id: draftId },
      data: {
        status: "published",
        title,
        bodyText: description,
        publishedPostId: createdPostId,
        composerStep: "variation-planning"
      }
    });
  });

  return { draft: mapDraft(updated as DraftRow), post_id: createdPostId };
}

export async function discardAutopostDraft(
  prisma: PrismaClient,
  creatorId: string,
  draftId: string,
  force = false
): Promise<AutopostDraftWire> {
  const row = await prisma.autopostDraft.findFirst({
    where: { id: draftId, creatorId, status: { in: [...AUTOPOST_ACTIVE_STATUSES] } }
  });
  if (!row) {
    throw new AutopostDraftValidationError("Active Autopost draft not found.", [
      { field: "draft_id", issue: "not_found" }
    ]);
  }

  const log = mapDraft(row as DraftRow).distribution_log;
  if (!force && hasDistributionEntries(log)) {
    throw new AutopostDraftDiscardWarningError(
      "This draft was already cross-posted. Pass force=true to discard anyway.",
      log
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await releaseMediaForDraft(tx, draftId, creatorId);
    return tx.autopostDraft.update({
      where: { id: draftId },
      data: { status: "discarded" }
    });
  });
  return mapDraft(updated as DraftRow);
}

export async function recordAutopostDistribution(
  prisma: PrismaClient,
  creatorId: string,
  draftId: string,
  destination: AutopostDistributionDestination
): Promise<AutopostDraftWire> {
  const row = await prisma.autopostDraft.findFirst({
    where: {
      id: draftId,
      creatorId,
      status: { in: ["previewing", "published", ...AUTOPOST_ACTIVE_STATUSES] }
    }
  });
  if (!row) {
    throw new AutopostDraftValidationError("Autopost draft not found.", [
      { field: "draft_id", issue: "not_found" }
    ]);
  }

  const log = { ...asRecord(row.distributionLog) };
  log[destination] = new Date().toISOString();

  const updated = await prisma.autopostDraft.update({
    where: { id: draftId },
    data: { distributionLog: log as Prisma.InputJsonValue }
  });
  return mapDraft(updated as DraftRow);
}

export type { CreatorStyleProfileWire };
