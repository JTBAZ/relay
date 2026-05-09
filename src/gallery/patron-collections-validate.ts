/**
 * @fileoverview Validates patron saved-collection entries against canonical post/media linkage.
 * @see ./patron-collections-store.js Persistence layer
 * @see src/jsdoc-core-entities.ts Artist/Gallery mapping notes
 */

import type { CanonicalSnapshot } from "../ingest/canonical-store.js";

/**
 * @description Outcome for {@link validatePatronCollectionEntry}.
 */
export type ValidateCollectionEntryResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "MEDIA_POST_MISMATCH"; message: string };

/**
 * @description Post and media must exist for creator; media must belong to the post in canonical.
 * @param snapshot Canonical snapshot.
 * @param creatorId Creator partition.
 * @param postId Post id.
 * @param mediaId Media id.
 * @returns Ok or structured failure.
 * @security-audit-required Routes must ensure patron may write snips for this creator before trusting ids.
 */
export function validatePatronCollectionEntry(
  snapshot: CanonicalSnapshot,
  creatorId: string,
  postId: string,
  mediaId: string
): ValidateCollectionEntryResult {
  const post = snapshot.posts[creatorId]?.[postId];
  if (!post || post.upstream_status !== "active") {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Post not found for this creator."
    };
  }
  const media = snapshot.media[creatorId]?.[mediaId];
  if (!media || media.upstream_status !== "active") {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Media not found for this creator."
    };
  }
  const onPost = post.current.media_ids.includes(mediaId);
  const onMedia = media.post_ids.includes(postId);
  if (!onPost && !onMedia) {
    return {
      ok: false,
      code: "MEDIA_POST_MISMATCH",
      message: "This asset does not belong to the given post."
    };
  }
  return { ok: true };
}
