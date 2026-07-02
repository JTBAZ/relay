/**
 * Autopost WI-2 / WI-4 — hybrid draft workspace (creator-only) before Relay publish.
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

export const AUTOPOST_ACTIVE_STATUSES = ["nudged", "drafting", "previewing"] as const;
export type AutopostDraftStatus = (typeof AUTOPOST_ACTIVE_STATUSES)[number] | "published" | "discarded";

export type AutopostDraftWire = {
  draft_id: string;
  creator_id: string;
  status: string;
  media_ids: string[];
  title: string | null;
  body_text: string | null;
  style_profile_id: string | null;
  enhancements: Record<string, unknown>;
  distribution_log: Record<string, unknown>;
  published_post_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AutopostDraftSaveInput = {
  media_ids: string[];
  title?: string | null;
  body_text?: string | null;
  generate?: boolean;
};

export type AutopostDraftPatchInput = {
  title?: string | null;
  body_text?: string | null;
  regenerate?: boolean;
  status?: string;
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

export class AutopostDraftValidationError extends Error {
  public override readonly name = "AutopostDraftValidationError";
  public constructor(
    message: string,
    public readonly details: Array<{ field: string; issue: string }>
  ) {
    super(message);
  }
}

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

function mapDraft(row: {
  id: string;
  creatorId: string;
  status: string;
  mediaIds: string[];
  title: string | null;
  bodyText: string | null;
  styleProfileId: string | null;
  enhancements: unknown;
  distributionLog: unknown;
  publishedPostId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AutopostDraftWire {
  return {
    draft_id: row.id,
    creator_id: row.creatorId,
    status: row.status,
    media_ids: row.mediaIds,
    title: row.title,
    body_text: row.bodyText,
    style_profile_id: row.styleProfileId,
    enhancements:
      row.enhancements && typeof row.enhancements === "object" && !Array.isArray(row.enhancements)
        ? (row.enhancements as Record<string, unknown>)
        : {},
    distribution_log:
      row.distributionLog &&
      typeof row.distributionLog === "object" &&
      !Array.isArray(row.distributionLog)
        ? (row.distributionLog as Record<string, unknown>)
        : {},
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

async function loadStagingMedia(
  prisma: PrismaClient,
  creatorId: string,
  mediaIds: string[]
) {
  if (mediaIds.length === 0) {
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
      autopostDraftId: null
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
  await tx.mediaAsset.updateMany({
    where: {
      id: { in: mediaIds },
      creatorId,
      primaryPostId: null,
      autopostDraftId: null
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
  return row ? mapDraft(row) : null;
}

export async function saveAutopostDraft(
  prisma: PrismaClient,
  creatorId: string,
  input: AutopostDraftSaveInput
): Promise<AutopostDraftWire> {
  const shouldGenerate = input.generate !== false;
  const styleProfile = shouldGenerate
    ? await requireCreatorStyleProfile(prisma, creatorId)
    : null;
  const mediaIds = normalizeMediaIds(input.media_ids);
  await loadStagingMedia(prisma, creatorId, mediaIds);

  const existing = await findActiveDraft(prisma, creatorId);
  if (existing) {
    throw new AutopostDraftConflictError(
      "An active Autopost draft already exists. Update or discard it first.",
      existing.id
    );
  }

  const mediaRows = await prisma.mediaAsset.findMany({
    where: { id: { in: mediaIds }, creatorId },
    select: { discordCaptureJson: true }
  });

  let title = input.title ?? null;
  let bodyText = input.body_text ?? null;
  let status: string = "previewing";

  if (shouldGenerate) {
    const ai = await generateAutopostDraftCopy({
      styleProfile: styleProfile!,
      mediaCaptions: collectMediaCaptions(mediaRows),
      titleHint: title
    });
    if (!ai.ok) {
      throw new AutopostDraftValidationError(ai.error, [{ field: "generate", issue: "ai_failed" }]);
    }
    if (!title?.trim() && ai.title) title = ai.title;
    if (bodyText == null || (input.generate === true && !input.body_text)) {
      bodyText = ai.body_text;
    }
  }

  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.autopostDraft.create({
      data: {
        creatorId,
        status,
        mediaIds,
        title: title?.trim() ? title.trim() : null,
        bodyText: bodyText?.trim() ? bodyText : null,
        styleProfileId: styleProfile?.profile_id ?? null
      }
    });
    await reserveMediaForDraft(tx, created.id, creatorId, mediaIds);
    return created;
  });

  return mapDraft(draft);
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

  if (input.regenerate) {
    const styleProfile = await requireCreatorStyleProfile(prisma, creatorId);
    const mediaRows = await prisma.mediaAsset.findMany({
      where: { id: { in: row.mediaIds }, creatorId },
      select: { discordCaptureJson: true }
    });
    const ai = await generateAutopostDraftCopy({
      styleProfile,
      mediaCaptions: collectMediaCaptions(mediaRows),
      titleHint: title
    });
    if (!ai.ok) {
      throw new AutopostDraftValidationError(ai.error, [{ field: "regenerate", issue: "ai_failed" }]);
    }
    if (ai.title) title = ai.title;
    bodyText = ai.body_text;
    status = "previewing";
  }

  const updated = await prisma.autopostDraft.update({
    where: { id: draftId },
    data: {
      title: title?.trim() ? title.trim() : null,
      bodyText: bodyText?.trim() ? bodyText : null,
      status
    }
  });
  return mapDraft(updated);
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
        publishedPostId: createdPostId
      }
    });
  });

  return { draft: mapDraft(updated), post_id: createdPostId };
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

  const log = mapDraft(row).distribution_log;
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
  return mapDraft(updated);
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

  const log =
    row.distributionLog &&
    typeof row.distributionLog === "object" &&
    !Array.isArray(row.distributionLog)
      ? ({ ...(row.distributionLog as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  log[destination] = new Date().toISOString();

  const updated = await prisma.autopostDraft.update({
    where: { id: draftId },
    data: { distributionLog: log as Prisma.InputJsonValue }
  });
  return mapDraft(updated);
}

export type { CreatorStyleProfileWire };
