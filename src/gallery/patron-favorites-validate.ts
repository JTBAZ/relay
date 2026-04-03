import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { PatronFavoriteTargetKind } from "./types.js";

export type ValidateFavoriteTargetResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND"; message: string };

/**
 * Ensure favorite target exists in canonical for this creator (active post/media).
 */
export function validatePatronFavoriteTarget(
  snapshot: CanonicalSnapshot,
  creatorId: string,
  targetKind: PatronFavoriteTargetKind,
  targetId: string
): ValidateFavoriteTargetResult {
  if (targetKind === "post") {
    const post = snapshot.posts[creatorId]?.[targetId];
    if (!post || post.upstream_status !== "active") {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "Post not found for this creator."
      };
    }
    return { ok: true };
  }
  const media = snapshot.media[creatorId]?.[targetId];
  if (!media || media.upstream_status !== "active") {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Media not found for this creator."
    };
  }
  return { ok: true };
}
