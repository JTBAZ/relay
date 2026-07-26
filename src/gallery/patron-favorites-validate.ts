/**
 * @fileoverview Validates patron favorite targets against canonical posts/media (Relay PE flows).
 * @see ./patron-favorites-store.js Persistence layer
 * @see src/jsdoc-core-entities.ts Artist/Gallery mapping notes
 */

import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { PatronFavoriteTargetKind } from "./types.js";

/**
 * @description Result of {@link validatePatronFavoriteTarget} structural checks.
 */
export type ValidateFavoriteTargetResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND"; message: string };

/**
 * @description Ensures favorite target exists in canonical for this creator (active post/media).
 * @param snapshot Canonical snapshot slice.
 * @param creatorId Creator partition.
 * @param targetKind Post vs media favorite kind.
 * @param targetId Target entity id.
 * @returns Ok or structured failure.
 * @security-audit-required Caller must bind snapshot/creatorId to authorized patron context (membership ids validated upstream).
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
