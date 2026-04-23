/**
 * PE-E (D27) — mirror Comment.tagIds into TagSuggestion(source='patron_comment').
 *
 * Contract (see docs/architecture/SEARCH_AND_TAGS_SHARED_KERNEL.md §3.1, §4.3):
 *
 * 1. We DO NOT store one TagSuggestion row per comment+tag. The store is keyed on
 *    (creatorId, mediaId, tagId, source) and `confidence` is a derived aggregate:
 *    the count of DISTINCT patron contributors whose visible, non-revoked comments still
 *    carry that tag for that target. Per-comment provenance lives on `Comment`.
 *
 * 2. `mediaId = ""` represents a post-level contribution (matches PostOverride convention).
 *    Both column shapes coexist in the same TagSuggestion table.
 *
 * 3. Owner revocation flips `Comment.tagsRevokedByOwner` for THAT comment + tag, recomputes
 *    confidence, and -- only when the last contributor goes to zero -- appends the tag to
 *    PostOverride.removeTagIds via the gallery overrides store. That keeps creator overrides
 *    the single choke point for `effectiveTags()` (no separate read-path).
 */

import type { PrismaClient } from "@prisma/client";

import type {
  GalleryOverridesStore
} from "./comment-types.js";

/** Convenience marker matching PostOverride convention for "post-level". */
export const POST_LEVEL_MEDIA_ID = "";

interface CommentForTagging {
  id: string;
  relayCreatorId: string;
  postId: string;
  mediaId: string | null;
  patronUserId: string;
  tagIds: string[];
  tagsRevokedByOwner: string[];
}

/**
 * Recompute the distinct-contributor count for a single (creator, post, media, tag) cell.
 * Returns the count -- callers decide whether to update TagSuggestion / PostOverride.
 */
export async function countDistinctTagContributors(
  prisma: PrismaClient,
  args: { creatorId: string; postId: string; mediaId: string; tagId: string }
): Promise<number> {
  const where = {
    relayCreatorId: args.creatorId,
    postId: args.postId,
    deletedAt: null,
    modState: "visible" as const,
    tagIds: { has: args.tagId },
    NOT: { tagsRevokedByOwner: { has: args.tagId } },
    ...(args.mediaId === POST_LEVEL_MEDIA_ID
      ? { mediaId: null }
      : { mediaId: args.mediaId })
  };
  const rows = await prisma.comment.findMany({
    where,
    select: { patronUserId: true }
  });
  const distinct = new Set(rows.map((r) => r.patronUserId));
  return distinct.size;
}

/**
 * Upsert a TagSuggestion row for one (creator, media, tag) cell with the freshly counted
 * confidence. When count = 0 we mark the row as `rejectedAt = now` (and the caller is
 * responsible for adding the tag to PostOverride.removeTagIds so `effectiveTags()` strips it).
 */
async function syncTagSuggestionRow(
  prisma: PrismaClient,
  creatorId: string,
  mediaId: string,
  tagId: string,
  count: number
): Promise<void> {
  const existing = await prisma.tagSuggestion.findFirst({
    where: { creatorId, mediaId, tagId, source: "patron_comment" }
  });
  const confidence = Math.min(1, count / 3);
  if (!existing) {
    if (count === 0) return;
    await prisma.tagSuggestion.create({
      data: {
        creatorId,
        mediaId,
        tagId,
        source: "patron_comment",
        confidence
      }
    });
    return;
  }
  if (count === 0) {
    if (existing.rejectedAt) return;
    await prisma.tagSuggestion.update({
      where: { id: existing.id },
      data: { rejectedAt: new Date(), confidence: 0 }
    });
    return;
  }
  await prisma.tagSuggestion.update({
    where: { id: existing.id },
    data: { confidence, rejectedAt: null }
  });
}

/**
 * After a comment is created or its tagIds change, refresh suggestions for every tag that
 * comment carries. Idempotent.
 */
export async function mirrorTagsForComment(
  prisma: PrismaClient,
  comment: CommentForTagging
): Promise<void> {
  const tagsToSync = comment.tagIds.filter((t) => !comment.tagsRevokedByOwner.includes(t));
  const mediaId = comment.mediaId ?? POST_LEVEL_MEDIA_ID;
  for (const tagId of tagsToSync) {
    const count = await countDistinctTagContributors(prisma, {
      creatorId: comment.relayCreatorId,
      postId: comment.postId,
      mediaId,
      tagId
    });
    await syncTagSuggestionRow(prisma, comment.relayCreatorId, mediaId, tagId, count);
  }
}

/**
 * Owner revocation of one (commentId, tagId). Idempotent.
 *
 * Ordering matters:
 *   1. Add tag to Comment.tagsRevokedByOwner first so the next contributor count excludes it.
 *   2. Recompute distinct-contributor count for (creator, post, media, tag).
 *   3. If count drops to zero, push the tag onto PostOverride.removeTagIds so `effectiveTags`
 *      strips it from the post / media. If the post-level comment is being revoked we use the
 *      post-level path; if it's a media-anchored comment we use the per-media bulk path.
 */
export async function revokeCommentTag(
  prisma: PrismaClient,
  overrides: GalleryOverridesStore,
  commentId: string,
  tagId: string
): Promise<{ stillBacked: boolean }> {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) {
    throw new Error(`Comment ${commentId} not found`);
  }
  if (!comment.tagIds.includes(tagId)) {
    throw new Error(`Comment ${commentId} does not carry tag ${tagId}`);
  }
  if (!comment.tagsRevokedByOwner.includes(tagId)) {
    await prisma.comment.update({
      where: { id: commentId },
      data: { tagsRevokedByOwner: { push: tagId } }
    });
  }
  const mediaId = comment.mediaId ?? POST_LEVEL_MEDIA_ID;
  const remaining = await countDistinctTagContributors(prisma, {
    creatorId: comment.relayCreatorId,
    postId: comment.postId,
    mediaId,
    tagId
  });
  await syncTagSuggestionRow(prisma, comment.relayCreatorId, mediaId, tagId, remaining);
  if (remaining === 0) {
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
  }
  return { stillBacked: remaining > 0 };
}

/** Inverse of revokeCommentTag — rare path; used by ModerationActionKind.comment_tag_unrevoke. */
export async function unrevokeCommentTag(
  prisma: PrismaClient,
  overrides: GalleryOverridesStore,
  commentId: string,
  tagId: string
): Promise<void> {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) {
    throw new Error(`Comment ${commentId} not found`);
  }
  if (comment.tagsRevokedByOwner.includes(tagId)) {
    await prisma.comment.update({
      where: { id: commentId },
      data: {
        tagsRevokedByOwner: { set: comment.tagsRevokedByOwner.filter((t) => t !== tagId) }
      }
    });
  }
  const mediaId = comment.mediaId ?? POST_LEVEL_MEDIA_ID;
  const count = await countDistinctTagContributors(prisma, {
    creatorId: comment.relayCreatorId,
    postId: comment.postId,
    mediaId,
    tagId
  });
  await syncTagSuggestionRow(prisma, comment.relayCreatorId, mediaId, tagId, count);
  // NOTE: we deliberately do NOT auto-pop the tag from PostOverride.removeTagIds — that's a
  // creator decision and goes through the existing studio overrides API.
}
