import { evaluateTierRules, resolvePostAccessLevel } from "../clone/tier-rules.js";
import type { ClonePostEntry } from "../clone/types.js";
import { checkPostAccess } from "../identity/access-guard.js";
import type { SessionToken } from "../identity/types.js";
import type { CanonicalSnapshot } from "../ingest/canonical-store.js";

/**
 * MIG-41 — Permission surface for "Account + post" with tier ordering (see `canAccessPost` + tier catalog).
 *
 * - **allow** — session (or public post) can load full export / detail.
 * - **deny** — anonymous on non-public, wrong creator, or missing post.
 * - **locked_preview** — patron session on a tier-gated post they don't hold (blur / teaser UX).
 *
 * Callers that know the session belongs to the content owner (via `Account.primaryRelayCreatorId`)
 * should pass `isContentOwner: true` to bypass the patron tier check — the creator must always
 * see their own Library unblurred.
 */
export type PostPermissionOutcome =
  | { outcome: "allow" }
  | { outcome: "deny"; reason: string }
  | { outcome: "locked_preview"; reason: string };

export function evaluatePostPermission(args: {
  snapshot: CanonicalSnapshot;
  creatorId: string;
  postId: string;
  session: SessionToken | null;
  /**
   * Set to `true` when the caller has verified (via DB) that the session belongs to the
   * content owner (Account.primaryRelayCreatorId === creatorId). Bypasses the patron tier
   * check so the creator always sees their own Library at full resolution.
   */
  isContentOwner?: boolean;
}): PostPermissionOutcome | null {
  const { snapshot, creatorId, postId, session, isContentOwner } = args;
  const row = snapshot.posts[creatorId]?.[postId];
  if (!row || row.upstream_status === "deleted") {
    return null;
  }

  // Content owner: always allow regardless of tier configuration. The creator's
  // own Library must show full-resolution unblurred content.
  if (isContentOwner && session) {
    return { outcome: "allow" };
  }

  const tierMap = snapshot.tiers[creatorId] ?? {};
  const tierRules = evaluateTierRules(tierMap);
  const access = resolvePostAccessLevel(row.current.tier_ids, tierRules);
  const clonePost: ClonePostEntry = {
    post_id: postId,
    slug: "",
    title: row.current.title,
    published_at: row.current.published_at,
    tag_ids: [...row.current.tag_ids],
    access,
    media: []
  };

  const check = checkPostAccess(clonePost, session, creatorId, tierMap);
  if (check.allowed) {
    return { outcome: "allow" };
  }

  if (!session) {
    return { outcome: "deny", reason: check.reason };
  }
  if (session.creator_id !== creatorId) {
    return { outcome: "deny", reason: check.reason };
  }
  return { outcome: "locked_preview", reason: check.reason };
}
