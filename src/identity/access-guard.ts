/**
 * @fileoverview Clone-site post access checks against an opaque `SessionToken` and tier catalog.
 * @description Enforces `creator_id` alignment and pledge ordering when canonical tiers are provided.
 * @see ../clone/tier-rules.js
 * @see ./types.js
 */

import type { ClonePostEntry, CloneSiteModel } from "../clone/types.js";
import { canAccessPost } from "../clone/tier-rules.js";
import type { TierRow } from "../ingest/canonical-store.js";
import type { SessionToken } from "./types.js";

export type AccessCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * @description Enforces post `access` vs session tiers; rejects cross-tenant sessions.
 * @param {import("../clone/types.js").ClonePostEntry} post
 * @param {import("./types.js").SessionToken | null} session
 * @param {string} siteCreatorId
 * @param {Record<string, import("../ingest/canonical-store.js").TierRow>} [tierCatalog]
 * @returns {AccessCheckResult}
 */
export function checkPostAccess(
  post: ClonePostEntry,
  session: SessionToken | null,
  siteCreatorId: string,
  /** When set (canonical ingest), enforces pledge ordering (“tier or higher”). */
  tierCatalog?: Record<string, TierRow>
): AccessCheckResult {
  if (post.access.level === "public") {
    return { allowed: true };
  }

  if (!session) {
    return { allowed: false, reason: "Authentication required." };
  }

  if (session.creator_id !== siteCreatorId) {
    return { allowed: false, reason: "Cross-tenant access denied." };
  }

  const granted = canAccessPost(post.access, session.tier_ids, tierCatalog);
  if (!granted) {
    return {
      allowed: false,
      reason: "Insufficient tier access."
    };
  }

  return { allowed: true };
}

/**
 * @description Filters clone posts to those passing {@link checkPostAccess} without tier catalog.
 * @param {import("../clone/types.js").CloneSiteModel} site
 * @param {import("./types.js").SessionToken | null} session
 * @returns {import("../clone/types.js").ClonePostEntry[]}
 */
export function filterAccessiblePosts(
  site: CloneSiteModel,
  session: SessionToken | null
): ClonePostEntry[] {
  return site.posts.filter((post) => {
    const result = checkPostAccess(post, session, site.creator_id);
    return result.allowed;
  });
}
