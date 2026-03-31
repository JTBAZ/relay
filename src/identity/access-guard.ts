import type { ClonePostEntry, CloneSiteModel } from "../clone/types.js";
import { canAccessPost } from "../clone/tier-rules.js";
import type { SessionToken } from "./types.js";

export type AccessCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function checkPostAccess(
  post: ClonePostEntry,
  session: SessionToken | null,
  siteCreatorId: string
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

  const granted = canAccessPost(post.access, session.tier_ids);
  if (!granted) {
    return {
      allowed: false,
      reason: "Insufficient tier access."
    };
  }

  return { allowed: true };
}

export function filterAccessiblePosts(
  site: CloneSiteModel,
  session: SessionToken | null
): ClonePostEntry[] {
  return site.posts.filter((post) => {
    const result = checkPostAccess(post, session, site.creator_id);
    return result.allowed;
  });
}
