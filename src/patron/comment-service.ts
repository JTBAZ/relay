/**
 * @fileoverview Patron experience module comment-service.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
/**
 * PE-E (BO-P2-03) — comment lifecycle service.
 *
 * Responsibilities:
 *   - create / patch / soft-delete comments under a post or coordinate-pinned to a media asset
 *   - enforce the 15-minute edit window (D26) — past that, body+tag edits are rejected
 *   - clamp anchorX / anchorY to [0, 100] and require both when mediaId is set
 *   - threading via parentCommentId (cascade-delete handled at the FK level)
 *   - run auto-mod (`evaluateCommentAutoMod`) and decide initial `modState`
 *   - mirror tagIds into TagSuggestion via `mirrorTagsForComment`
 *   - listing path applies viewer-aware tier-gate + AccountBlock future-only semantics
 *
 * What this module does NOT do (kept in their own services for clean reuse):
 *   - reactions: src/patron/comment-reaction-service.ts
 *   - reports / moderation actions / blocks: see the corresponding service files
 *   - HTTP wiring: src/server.ts
 */

import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { validateMediaIdsBelongToPost } from "../gallery/post-presentation-mutate.js";
import { evaluateCommentAutoMod } from "./comment-auto-mod.js";
import {
  POST_LEVEL_MEDIA_ID,
  countDistinctTagContributors,
  mirrorTagsForComment
} from "./comment-tag-service.js";
import { emitCommentCreatedEvent } from "./notification-event-emit.js";
import type {
  CommentRecord,
  CreateCommentInput,
  GalleryOverridesStore,
  ListCommentsOptions,
  PatchCommentInput
} from "./comment-types.js";

/** D26 - 15-minute edit window enforced at the service layer. */
export const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

const MAX_TAG_IDS = 12;
const MAX_TAG_LEN = 64;

export class CommentValidationError extends Error {
  public constructor(public readonly field: string, public readonly issue: string) {
    super(`Invalid ${field}: ${issue}`);
    this.name = "CommentValidationError";
  }
}

export class CommentNotFoundError extends Error {
  public constructor(public readonly commentId: string) {
    super(`Comment ${commentId} not found`);
    this.name = "CommentNotFoundError";
  }
}

export class CommentEditWindowClosedError extends Error {
  public constructor(public readonly commentId: string) {
    super(`Comment ${commentId} is past the 15-minute edit window`);
    this.name = "CommentEditWindowClosedError";
  }
}

export class CommentForbiddenError extends Error {
  public constructor(public readonly reason: string) {
    super(reason);
    this.name = "CommentForbiddenError";
  }
}

function clampAnchor(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new CommentValidationError(field, "must be a finite number");
  }
  if (value < 0 || value > 100) {
    throw new CommentValidationError(field, "must be between 0 and 100");
  }
  return Math.round(value * 100) / 100;
}

function normaliseTagIds(raw: string[] | undefined): string[] {
  if (!raw) return [];
  if (raw.length > MAX_TAG_IDS) {
    throw new CommentValidationError("tag_ids", `at most ${MAX_TAG_IDS} tags per comment`);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const v = String(t).trim().toLowerCase();
    if (!v) continue;
    if (v.length > MAX_TAG_LEN) {
      throw new CommentValidationError("tag_ids", `tag exceeds ${MAX_TAG_LEN} chars`);
    }
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function toRecord(row: Awaited<ReturnType<PrismaClient["comment"]["findFirstOrThrow"]>>): CommentRecord {
  return {
    id: row.id,
    relayCreatorId: row.relayCreatorId,
    postId: row.postId,
    mediaId: row.mediaId,
    anchorX: row.anchorX === null ? null : Number(row.anchorX),
    anchorY: row.anchorY === null ? null : Number(row.anchorY),
    patronUserId: row.patronUserId,
    body: row.body,
    parentCommentId: row.parentCommentId,
    tagIds: row.tagIds,
    tagsRevokedByOwner: row.tagsRevokedByOwner,
    creatorPinnedAt: row.creatorPinnedAt,
    requiredTierId: row.requiredTierId,
    visibility: row.visibility,
    autoModFlagsJson: row.autoModFlagsJson,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    modState: row.modState
  };
}

/**
 * Create a comment. Returns the created record AND the auto-mod flags so route handlers can
 * surface them to the author ("your comment is awaiting review because…").
 */
export async function createComment(
  prisma: PrismaClient,
  overrides: GalleryOverridesStore,
  input: CreateCommentInput
): Promise<{ record: CommentRecord; autoModFlags: ReturnType<typeof evaluateCommentAutoMod>["flags"] }> {
  const body = String(input.body ?? "").trim();
  if (!body) {
    throw new CommentValidationError("body", "must be non-empty");
  }
  const mediaId = input.mediaId ? String(input.mediaId) : null;
  let anchorX: number | null = null;
  let anchorY: number | null = null;
  if (mediaId !== null) {
    if (input.anchorX === undefined || input.anchorX === null) {
      throw new CommentValidationError("anchor_x", "required when media_id is set");
    }
    if (input.anchorY === undefined || input.anchorY === null) {
      throw new CommentValidationError("anchor_y", "required when media_id is set");
    }
    anchorX = clampAnchor(Number(input.anchorX), "anchor_x");
    anchorY = clampAnchor(Number(input.anchorY), "anchor_y");
  }
  const tagIds = normaliseTagIds(input.tagIds);
  if (input.parentCommentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parentCommentId },
      select: { id: true, relayCreatorId: true, postId: true, deletedAt: true }
    });
    if (!parent || parent.deletedAt) {
      throw new CommentValidationError("parent_comment_id", "parent not found");
    }
    if (parent.relayCreatorId !== input.relayCreatorId || parent.postId !== input.postId) {
      throw new CommentValidationError("parent_comment_id", "parent in different scope");
    }
  }
  if (mediaId !== null) {
    const attached = await validateMediaIdsBelongToPost(
      prisma,
      input.relayCreatorId,
      input.postId,
      [mediaId]
    );
    if (!attached.ok) {
      throw new CommentValidationError("media_id", attached.message);
    }
  }
  const autoMod = evaluateCommentAutoMod(body);
  const created = await prisma.comment.create({
    data: {
      relayCreatorId: input.relayCreatorId,
      postId: input.postId,
      mediaId,
      anchorX: anchorX === null ? null : new Prisma.Decimal(anchorX),
      anchorY: anchorY === null ? null : new Prisma.Decimal(anchorY),
      patronUserId: input.patronUserId,
      body,
      parentCommentId: input.parentCommentId ?? null,
      tagIds,
      requiredTierId: input.requiredTierId ?? null,
      visibility: input.visibility ?? "everyone",
      autoModFlagsJson: autoMod.flags as unknown as Prisma.InputJsonValue,
      modState: autoMod.initialModState
    }
  });
  if (created.modState === "visible" && tagIds.length > 0) {
    await mirrorTagsForComment(prisma, {
      id: created.id,
      relayCreatorId: created.relayCreatorId,
      postId: created.postId,
      mediaId: created.mediaId,
      patronUserId: created.patronUserId,
      tagIds: created.tagIds,
      tagsRevokedByOwner: created.tagsRevokedByOwner
    });
  }
  // PE-G — emit OutboxEvent so the notification worker fans-out to recipients (parent author
  // for replies). Hidden / removed comments are still emitted so moderation queue UX can
  // surface them; the mapper decides who (if anyone) gets a Notification row.
  await emitCommentCreatedEvent(prisma, {
    commentId: created.id,
    relayCreatorId: created.relayCreatorId,
    postId: created.postId,
    parentCommentId: created.parentCommentId,
    authorMembershipId: created.patronUserId
  });
  // overrides param accepted for symmetry with revoke path; mirror only writes TagSuggestion.
  void overrides;
  return { record: toRecord(created), autoModFlags: autoMod.flags };
}

/**
 * Edit a comment. Author-only; rejects past `COMMENT_EDIT_WINDOW_MS`. Body / tagIds may be
 * patched; coordinate / parent / tier never change after create.
 */
export async function patchComment(
  prisma: PrismaClient,
  overrides: GalleryOverridesStore,
  args: { commentId: string; actorUserId: string; patch: PatchCommentInput }
): Promise<CommentRecord> {
  const existing = await prisma.comment.findUnique({ where: { id: args.commentId } });
  if (!existing || existing.deletedAt) {
    throw new CommentNotFoundError(args.commentId);
  }
  if (existing.patronUserId !== args.actorUserId) {
    throw new CommentForbiddenError("only the author may edit a comment");
  }
  if (Date.now() - existing.createdAt.getTime() > COMMENT_EDIT_WINDOW_MS) {
    throw new CommentEditWindowClosedError(args.commentId);
  }
  const data: Prisma.CommentUpdateInput = { editedAt: new Date() };
  if (args.patch.body !== undefined) {
    const body = String(args.patch.body).trim();
    if (!body) {
      throw new CommentValidationError("body", "must be non-empty");
    }
    const autoMod = evaluateCommentAutoMod(body);
    data.body = body;
    data.autoModFlagsJson = autoMod.flags as unknown as Prisma.InputJsonValue;
    data.modState = autoMod.initialModState;
  }
  let tagsChanged = false;
  if (args.patch.tagIds !== undefined) {
    data.tagIds = { set: normaliseTagIds(args.patch.tagIds) };
    tagsChanged = true;
  }
  const updated = await prisma.comment.update({ where: { id: args.commentId }, data });
  if (tagsChanged && updated.modState === "visible") {
    await mirrorTagsForComment(prisma, {
      id: updated.id,
      relayCreatorId: updated.relayCreatorId,
      postId: updated.postId,
      mediaId: updated.mediaId,
      patronUserId: updated.patronUserId,
      tagIds: updated.tagIds,
      tagsRevokedByOwner: updated.tagsRevokedByOwner
    });
    // Tags removed in the patch may now have zero contributors; recompute & possibly revoke.
    const removed = existing.tagIds.filter((t) => !updated.tagIds.includes(t));
    for (const tagId of removed) {
      await reconcileTagOnContributorChange(prisma, overrides, updated, tagId);
    }
  }
  return toRecord(updated);
}

/**
 * Soft-delete a comment. Allowed for the author (always) and for the creator (route layer
 * checks); cascades to replies via the FK ON DELETE CASCADE only on hard-delete -- soft
 * delete leaves children visible (matches typical comment UX).
 */
export async function softDeleteComment(
  prisma: PrismaClient,
  overrides: GalleryOverridesStore,
  args: { commentId: string; actorUserId: string; isCreator: boolean }
): Promise<CommentRecord> {
  const existing = await prisma.comment.findUnique({ where: { id: args.commentId } });
  if (!existing || existing.deletedAt) {
    throw new CommentNotFoundError(args.commentId);
  }
  if (!args.isCreator && existing.patronUserId !== args.actorUserId) {
    throw new CommentForbiddenError("only the author or the creator may delete a comment");
  }
  const updated = await prisma.comment.update({
    where: { id: args.commentId },
    data: { deletedAt: new Date(), modState: args.isCreator ? "removed" : "visible" }
  });
  for (const tagId of updated.tagIds) {
    await reconcileTagOnContributorChange(prisma, overrides, updated, tagId);
  }
  return toRecord(updated);
}

async function reconcileTagOnContributorChange(
  prisma: PrismaClient,
  overrides: GalleryOverridesStore,
  comment: { relayCreatorId: string; postId: string; mediaId: string | null },
  tagId: string
): Promise<void> {
  const mediaId = comment.mediaId ?? POST_LEVEL_MEDIA_ID;
  const remaining = await countDistinctTagContributors(prisma, {
    creatorId: comment.relayCreatorId,
    postId: comment.postId,
    mediaId,
    tagId
  });
  const existingSuggestion = await prisma.tagSuggestion.findFirst({
    where: { creatorId: comment.relayCreatorId, mediaId, tagId, source: "patron_comment" }
  });
  if (!existingSuggestion) return;
  if (remaining === 0) {
    await prisma.tagSuggestion.update({
      where: { id: existingSuggestion.id },
      data: { rejectedAt: new Date(), confidence: 0 }
    });
    if (mediaId === POST_LEVEL_MEDIA_ID) {
      await overrides.mergePostTagDelta(comment.relayCreatorId, comment.postId, {
        add_tag_ids: [],
        remove_tag_ids: [tagId]
      });
    } else {
      await overrides.mergeBulkMediaTagDelta(
        comment.relayCreatorId,
        [{ post_id: comment.postId, media_id: mediaId }],
        { add_tag_ids: [], remove_tag_ids: [tagId] }
      );
    }
  } else {
    await prisma.tagSuggestion.update({
      where: { id: existingSuggestion.id },
      data: { confidence: Math.min(1, remaining / 3), rejectedAt: null }
    });
  }
}

/** Creator-only: pin / unpin a comment to the top of the thread. */
export async function setCreatorPinned(
  prisma: PrismaClient,
  args: { commentId: string; pinned: boolean }
): Promise<CommentRecord> {
  const existing = await prisma.comment.findUnique({ where: { id: args.commentId } });
  if (!existing) throw new CommentNotFoundError(args.commentId);
  const updated = await prisma.comment.update({
    where: { id: args.commentId },
    data: { creatorPinnedAt: args.pinned ? new Date() : null }
  });
  return toRecord(updated);
}

/** Creator-only: hide / unhide a comment (modState toggle). */
export async function setModState(
  prisma: PrismaClient,
  args: { commentId: string; modState: "visible" | "hidden" | "removed" }
): Promise<CommentRecord> {
  const existing = await prisma.comment.findUnique({ where: { id: args.commentId } });
  if (!existing) throw new CommentNotFoundError(args.commentId);
  const updated = await prisma.comment.update({
    where: { id: args.commentId },
    data: { modState: args.modState }
  });
  return toRecord(updated);
}

/**
 * List comments for a post (or for one media asset within the post). Applies:
 *   - soft-delete filter (deletedAt = null)
 *   - mod_state filter (visible only, unless includeModerated)
 *   - tier gate (requiredTierId must be in viewerTierIds)
 *   - AccountBlock future-only filter (D14)
 *
 * Sort: creator-pinned first (newest pin first), then newest createdAt first.
 */
export async function listComments(
  prisma: PrismaClient,
  args: { relayCreatorId: string; postId: string; options?: ListCommentsOptions }
): Promise<CommentRecord[]> {
  const opts = args.options ?? {};
  const where: Prisma.CommentWhereInput = {
    relayCreatorId: args.relayCreatorId,
    postId: args.postId,
    deletedAt: null
  };
  if (!opts.includeModerated) {
    where.modState = "visible";
  }
  if (opts.postLevelOnly) {
    where.mediaId = null;
  } else if (opts.mediaId !== undefined) {
    where.mediaId = opts.mediaId;
  }
  const rows = await prisma.comment.findMany({
    where,
    orderBy: [{ creatorPinnedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
  });
  const tierIds = new Set(opts.viewerTierIds ?? []);
  const blockMap = new Map<string, Date>();
  for (const edge of opts.blockEdges ?? []) {
    blockMap.set(edge.blockedAccountId, edge.createdAt);
  }
  const blockedSet = new Set(opts.blockedAccountIds ?? []);
  const filtered = rows.filter((row) => {
    if (row.requiredTierId && !tierIds.has(row.requiredTierId)) return false;
    const blockedAt = blockMap.get(row.patronUserId);
    if (blockedAt && row.createdAt > blockedAt) return false;
    if (blockedSet.has(row.patronUserId) && !blockMap.has(row.patronUserId)) return false;
    return true;
  });
  return filtered.map(toRecord);
}
