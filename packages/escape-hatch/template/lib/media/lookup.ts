/**
 * Resolve media metadata from the site bundle (EH-033).
 * Structural site shape — avoids importing fill-time `lib/contracts.ts`.
 */

import { buildEscapeHatchMediaObjectKey } from "./keys";
import type { MediaLookup } from "./types";

export type MediaSiteBundle = {
  creator_id: string;
  site_id: string;
  posts: ReadonlyArray<{
    post_id: string;
    access: {
      level: "public" | "member_only" | "tier_gated";
      tier_ids: readonly string[];
      match_mode?: "exact" | "tier_or_higher";
    };
    media: ReadonlyArray<{
      media_id: string;
      content_path: string;
    }>;
  }>;
};

export function lookupMediaInSite(
  site: MediaSiteBundle,
  mediaId: string
): MediaLookup | null {
  if (!mediaId || typeof mediaId !== "string") return null;
  for (const post of site.posts) {
    for (const m of post.media) {
      if (m.media_id !== mediaId) continue;
      const siteId = site.site_id ?? site.creator_id;
      return {
        mediaId: m.media_id,
        siteId,
        creatorId: site.creator_id,
        postId: post.post_id,
        accessLevel: post.access.level,
        tierIds: post.access.tier_ids,
        matchMode: post.access.match_mode,
        contentPath: m.content_path,
        objectKey: buildEscapeHatchMediaObjectKey(
          site.creator_id,
          siteId,
          m.media_id
        )
      };
    }
  }
  return null;
}
