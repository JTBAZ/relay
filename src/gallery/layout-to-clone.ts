import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { CreatorExportIndex } from "../export/types.js";
import type { ClonePostEntry, CloneMediaRef } from "../clone/types.js";
import { evaluateTierRules, resolvePostAccessLevel } from "../clone/tier-rules.js";
import { slugify } from "../clone/slug.js";
import type { GalleryOverridesRoot, PageLayout, Collection } from "./types.js";

export type ResolvedLayoutPost = ClonePostEntry & {
  section_id: string;
  section_title: string;
  section_sort_order: number;
};

/**
 * Resolves a PageLayout into an ordered list of ClonePostEntry items,
 * respecting section ordering, visibility overrides, and tier-gating.
 * Hidden posts are excluded; tier access is resolved from canonical data.
 */
export function resolveLayoutPosts(
  layout: PageLayout,
  creatorId: string,
  canonical: CanonicalSnapshot,
  exportIndex: CreatorExportIndex,
  overrides: GalleryOverridesRoot,
  collections: Collection[]
): ResolvedLayoutPost[] {
  const posts = canonical.posts[creatorId] ?? {};
  const mediaMap = canonical.media[creatorId] ?? {};
  const tiers = canonical.tiers[creatorId] ?? {};
  const tierRules = evaluateTierRules(tiers);

  const collectionMap = new Map<string, Collection>();
  for (const col of collections) {
    collectionMap.set(col.collection_id, col);
  }

  const hiddenPostIds = new Set<string>();
  const creatorOverrides = overrides.creators[creatorId]?.posts ?? {};
  for (const [postId, ov] of Object.entries(creatorOverrides)) {
    if (ov.visibility === "hidden") {
      hiddenPostIds.add(postId);
    }
  }

  const result: ResolvedLayoutPost[] = [];
  const seenPostIds = new Set<string>();
  const sortedSections = [...layout.sections].sort((a, b) => a.sort_order - b.sort_order);

  for (const section of sortedSections) {
    let postIds: string[] = [];

    if (section.source.type === "collection") {
      const col = collectionMap.get(section.source.collection_id);
      postIds = col?.post_ids ?? [];
    } else if (section.source.type === "manual") {
      postIds = section.source.post_ids;
    } else {
      // Filter source: include all active, non-hidden posts
      postIds = Object.keys(posts).filter(
        (id) => posts[id].upstream_status === "active" && !hiddenPostIds.has(id)
      );
    }

    let count = 0;
    for (const postId of postIds) {
      if (seenPostIds.has(postId)) continue;
      if (hiddenPostIds.has(postId)) continue;

      const post = posts[postId];
      if (!post || post.upstream_status !== "active") continue;

      if (section.max_items && count >= section.max_items) break;

      const slug = slugify(post.current.title, postId);
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
      }

      result.push({
        post_id: postId,
        slug,
        title: post.current.title,
        published_at: post.current.published_at,
        tag_ids: [...post.current.tag_ids],
        access,
        media: mediaRefs,
        section_id: section.section_id,
        section_title: section.title,
        section_sort_order: section.sort_order
      });
      seenPostIds.add(postId);
      count++;
    }
  }

  return result;
}
