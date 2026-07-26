/**
 * @fileoverview Pure builder from canonical ingest + export availability into a `CloneSiteModel`.
 * @description Applies tier rules and slugify for static site synthesis.
 * @see ../ingest/canonical-store.js
 * @see ../export/types.js CreatorExportIndex
 * @see ./tier-rules.js
 */

import { randomUUID } from "node:crypto";
import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { CreatorExportIndex } from "../export/types.js";
import { evaluateTierRules, resolvePostAccessLevel } from "./tier-rules.js";
import { slugify } from "./slug.js";
import type { CloneMediaRef, ClonePostEntry, CloneSiteModel } from "./types.js";

/**
 * @description Materializes posts, media refs, tier rules, and counters for one creator.
 * @param creatorId Creator scope.
 * @param canonical Full canonical snapshot.
 * @param exportIndex Media ids with successful exports.
 * @param baseUrl Public base URL for link generation (trailing slashes trimmed in output).
 * @returns New `CloneSiteModel` with fresh `site_id`.
 */
export function generateCloneSiteModel(
  creatorId: string,
  canonical: CanonicalSnapshot,
  exportIndex: CreatorExportIndex,
  baseUrl: string
): CloneSiteModel {
  const tiers = canonical.tiers[creatorId] ?? {};
  const posts = canonical.posts[creatorId] ?? {};
  const mediaMap = canonical.media[creatorId] ?? {};

  const tierRules = evaluateTierRules(tiers);

  const clonePosts: ClonePostEntry[] = [];
  let totalMedia = 0;

  const sortedPosts = Object.values(posts)
    .filter((p) => p.upstream_status === "active")
    .sort(
      (a, b) =>
        new Date(b.current.published_at).getTime() -
        new Date(a.current.published_at).getTime()
    );

  for (const post of sortedPosts) {
    const slug = slugify(post.current.title, post.post_id);
    const access = resolvePostAccessLevel(post.current.tier_ids, tierRules);

    const mediaRefs: CloneMediaRef[] = [];
    for (const mediaId of post.current.media_ids) {
      const m = mediaMap[mediaId];
      if (!m || m.upstream_status === "deleted") continue;
      const hasExport = Boolean(exportIndex.media[mediaId]);
      mediaRefs.push({
        media_id: mediaId,
        mime_type: m.current.mime_type,
        has_export: hasExport,
        content_path: `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`
      });
      totalMedia += 1;
    }

    clonePosts.push({
      post_id: post.post_id,
      slug,
      title: post.current.title,
      published_at: post.current.published_at,
      tag_ids: [...post.current.tag_ids],
      access,
      media: mediaRefs
    });
  }

  return {
    site_id: `site_${randomUUID()}`,
    creator_id: creatorId,
    generated_at: new Date().toISOString(),
    base_url: baseUrl.replace(/\/+$/, ""),
    tiers: tierRules,
    posts: clonePosts,
    total_media: totalMedia
  };
}
