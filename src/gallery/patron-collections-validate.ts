import type { CanonicalSnapshot } from "../ingest/canonical-store.js";

export type ValidateCollectionEntryResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "MEDIA_POST_MISMATCH"; message: string };

/**
 * Post and media must exist for creator; media must belong to the post in canonical.
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
