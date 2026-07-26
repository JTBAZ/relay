/**
 * Read-only Patreon → site.json transition sync (EH-063).
 * Never writes upstream; injectable fetch for CI.
 */

import type { AccessLevel, ClonePostEntry } from "../contracts";
import {
  loadSiteBundleFromKit,
  recountTotalMedia,
  saveSiteBundle,
  sanitizeBodyPlain,
  slugifyTitle
} from "../cms/posts";
import {
  isProtectedSyncPost,
  loadPatreonSyncState,
  savePatreonSyncState,
  type PatreonSyncStateDocument,
  type SyncConflictItem,
  type SyncPostTracking
} from "./sync-state";

export type UpstreamPatreonPost = {
  upstream_id: string;
  upstream_revision: string;
  title: string;
  published_at: string;
  access_level: AccessLevel;
  tier_ids: string[];
  body_plain?: string | null;
  slug?: string;
};

export type FetchUpstreamPosts = (args: {
  siteId: string;
  campaignId: string;
}) => Promise<UpstreamPatreonPost[]>;

export type RunPatreonSyncInput = {
  siteId: string;
  campaignId: string;
  /** Required for live mode; tests inject fixtures. */
  fetchPosts: FetchUpstreamPosts;
  kitDir?: string;
};

export type RunPatreonSyncResult = {
  ok: boolean;
  production_safe: false;
  created: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  conflict_queue: SyncConflictItem[];
  error: string | null;
  last_sync_at: string;
};

function postIdForUpstream(upstreamId: string): string {
  const safe = upstreamId.replace(/[^\p{L}\p{N}_.-]+/gu, "_").slice(0, 48);
  return `patreon_${safe || "post"}`;
}

function findByUpstream(
  state: PatreonSyncStateDocument,
  upstreamId: string
): { postId: string; tracking: SyncPostTracking } | null {
  for (const [postId, tracking] of Object.entries(state.posts)) {
    if (tracking.upstream_id === upstreamId) {
      return { postId, tracking };
    }
  }
  return null;
}

function pushConflict(
  queue: SyncConflictItem[],
  item: Omit<SyncConflictItem, "conflict_id" | "created_at">
): void {
  const exists = queue.some(
    (c) =>
      c.post_id === item.post_id &&
      c.kind === item.kind &&
      c.upstream_revision === item.upstream_revision
  );
  if (exists) return;
  queue.push({
    ...item,
    conflict_id: `conflict_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    created_at: new Date().toISOString()
  });
}

function toClonePost(
  upstream: UpstreamPatreonPost,
  postId: string,
  prev: ClonePostEntry | null
): ClonePostEntry {
  const slugBase =
    upstream.slug?.trim() ||
    slugifyTitle(upstream.title) ||
    `patreon-${upstream.upstream_id}`;
  return {
    post_id: postId,
    slug: slugBase.toLowerCase().slice(0, 64),
    title: upstream.title.trim().slice(0, 200) || "Untitled",
    published_at: upstream.published_at,
    tag_ids: prev?.tag_ids ?? [],
    access: {
      level: upstream.access_level,
      tier_ids: [...upstream.tier_ids],
      ...(upstream.access_level === "tier_gated"
        ? { match_mode: "tier_or_higher" as const }
        : {})
    },
    media: prev?.media ?? [],
    status: prev?.status ?? "published",
    feature_order: prev?.feature_order ?? null,
    public_cover_media_id: prev?.public_cover_media_id ?? null,
    body_plain:
      upstream.body_plain !== undefined
        ? sanitizeBodyPlain(upstream.body_plain)
        : (prev?.body_plain ?? null)
  };
}

/**
 * Apply upstream posts into site.json with local-edit protection.
 * Read-only w.r.t. Patreon — fetchPosts is the only I/O to Patreon.
 */
export async function runPatreonTransitionSync(
  input: RunPatreonSyncInput
): Promise<RunPatreonSyncResult> {
  const kitDir = input.kitDir ?? process.cwd();
  const now = new Date().toISOString();
  const state = loadPatreonSyncState(input.siteId, kitDir);
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const conflicts = [...state.conflict_queue];

  let upstreamList: UpstreamPatreonPost[];
  try {
    upstreamList = await input.fetchPosts({
      siteId: input.siteId,
      campaignId: input.campaignId
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    state.last_sync_at = now;
    state.last_status = "failed";
    state.last_error = message;
    savePatreonSyncState(state, kitDir);
    return {
      ok: false,
      production_safe: false,
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicts: conflicts.length,
      conflict_queue: conflicts,
      error: message,
      last_sync_at: now
    };
  }

  let site = loadSiteBundleFromKit(kitDir);
  const posts = [...site.posts];
  const usedSlugs = new Set(posts.map((p) => p.slug));

  for (const upstream of upstreamList) {
    if (!upstream.upstream_id?.trim() || !upstream.upstream_revision?.trim()) {
      continue;
    }
    const matched = findByUpstream(state, upstream.upstream_id);
    const postId = matched?.postId ?? postIdForUpstream(upstream.upstream_id);
    const idx = posts.findIndex((p) => p.post_id === postId);
    const prev = idx >= 0 ? posts[idx]! : null;
    const tracking =
      matched?.tracking ??
      state.posts[postId] ??
      ({
        origin: "imported",
        locally_edited: false,
        upstream_id: upstream.upstream_id,
        upstream_revision: null
      } satisfies SyncPostTracking);

    if (
      isProtectedSyncPost(tracking) &&
      tracking.upstream_revision &&
      tracking.upstream_revision !== upstream.upstream_revision
    ) {
      pushConflict(conflicts, {
        kind:
          tracking.origin === "native"
            ? "native_post"
            : tracking.locally_edited
              ? "local_edit"
              : "upstream_revision",
        post_id: postId,
        summary: `Protected local post ${postId} (origin=${tracking.origin}, locally_edited=${tracking.locally_edited}); upstream revision ${upstream.upstream_revision} not applied.`,
        upstream_revision: upstream.upstream_revision
      });
      unchanged += 1;
      continue;
    }

    if (
      isProtectedSyncPost(tracking) &&
      !tracking.upstream_revision &&
      tracking.origin === "native"
    ) {
      pushConflict(conflicts, {
        kind: "native_post",
        post_id: postId,
        summary: `Native post ${postId} is protected from Patreon sync.`,
        upstream_revision: upstream.upstream_revision
      });
      unchanged += 1;
      continue;
    }

    if (
      tracking.upstream_revision === upstream.upstream_revision &&
      prev &&
      !tracking.locally_edited
    ) {
      unchanged += 1;
      continue;
    }

    let nextPost = toClonePost(upstream, postId, prev);
    if (usedSlugs.has(nextPost.slug) && (!prev || prev.slug !== nextPost.slug)) {
      nextPost = {
        ...nextPost,
        slug: `${nextPost.slug}-${upstream.upstream_id}`.slice(0, 64)
      };
    }
    usedSlugs.add(nextPost.slug);

    if (idx >= 0) {
      posts[idx] = nextPost;
      updated += 1;
    } else {
      posts.push(nextPost);
      created += 1;
    }

    state.posts[postId] = {
      origin: "imported",
      locally_edited: false,
      upstream_id: upstream.upstream_id,
      upstream_revision: upstream.upstream_revision
    };
  }

  site = {
    ...site,
    posts,
    total_media: recountTotalMedia(posts),
    generated_at: now
  };
  saveSiteBundle(site, kitDir);

  state.conflict_queue = conflicts;
  state.last_sync_at = now;
  state.last_status = conflicts.length > 0 ? "degraded" : "ok";
  state.last_error = null;
  savePatreonSyncState(state, kitDir);

  return {
    ok: true,
    production_safe: false,
    created,
    updated,
    unchanged,
    conflicts: conflicts.length,
    conflict_queue: conflicts,
    error: null,
    last_sync_at: now
  };
}

/**
 * Map a minimal Patreon API-like JSON:API page into UpstreamPatreonPost[].
 * Used by tests and optional live adapter.
 */
export function mapPatreonPostsPage(doc: unknown): UpstreamPatreonPost[] {
  if (!doc || typeof doc !== "object") return [];
  const data = (doc as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const out: UpstreamPatreonPost[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { id?: unknown }).id;
    const attrs = (row as { attributes?: Record<string, unknown> }).attributes;
    if (typeof id !== "string" || !attrs) continue;
    const title =
      typeof attrs.title === "string" ? attrs.title : `Post ${id}`;
    const published =
      typeof attrs.published_at === "string"
        ? attrs.published_at
        : new Date().toISOString();
    const rev =
      typeof attrs.edited_at === "string"
        ? attrs.edited_at
        : typeof attrs.published_at === "string"
          ? attrs.published_at
          : published;
    const isPublic = attrs.is_public === true;
    const tierIds = Array.isArray(attrs.tier_ids)
      ? attrs.tier_ids.filter((t): t is string => typeof t === "string")
      : [];
    out.push({
      upstream_id: id,
      upstream_revision: rev,
      title,
      published_at: published,
      access_level: isPublic
        ? "public"
        : tierIds.length > 0
          ? "tier_gated"
          : "member_only",
      tier_ids: tierIds,
      body_plain:
        typeof attrs.teaser_text === "string" ? attrs.teaser_text : null
    });
  }
  return out;
}
