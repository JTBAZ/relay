import { randomUUID } from "node:crypto";
import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { AnalyticsSnapshot } from "./types.js";

export function generateSnapshot(
  creatorId: string,
  canonical: CanonicalSnapshot
): AnalyticsSnapshot {
  const posts = canonical.posts[creatorId] ?? {};
  const media = canonical.media[creatorId] ?? {};
  const tiers = canonical.tiers[creatorId] ?? {};

  const activePosts = Object.values(posts).filter(
    (p) => p.upstream_status === "active"
  );
  const activeMedia = Object.values(media).filter(
    (m) => m.upstream_status === "active"
  );

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const recentPosts = activePosts.filter(
    (p) => new Date(p.current.published_at).getTime() >= thirtyDaysAgo
  );

  const tagCounts: Record<string, number> = {};
  for (const p of activePosts) {
    for (const tag of p.current.tag_ids) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag_id, count]) => ({ tag_id, count }));

  const tierCounts: Record<string, number> = {};
  for (const p of activePosts) {
    for (const tid of p.current.tier_ids) {
      tierCounts[tid] = (tierCounts[tid] ?? 0) + 1;
    }
  }
  const tierContentCounts = Object.entries(tierCounts).map(
    ([tier_id, postsCount]) => ({ tier_id, posts: postsCount })
  );

  return {
    snapshot_id: `snap_${randomUUID()}`,
    creator_id: creatorId,
    generated_at: new Date().toISOString(),
    total_posts: activePosts.length,
    total_media: activeMedia.length,
    active_tiers: Object.keys(tiers).length,
    posting_cadence_30d: recentPosts.length,
    top_tags: topTags,
    tier_content_counts: tierContentCounts,
    estimated: false
  };
}
