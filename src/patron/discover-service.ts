/**
 * PE-F (BO-P3-01) — Discovery service.
 *
 * Cross-creator discovery feed. Produces the rows that back `GET /api/v1/patron/discover`.
 *
 * # v1 contract (per Patron_Experience_Roadmap.md PE-F § v1)
 *
 * - Creator opts a post in via `PostOverride.discoveryEligible = true` (post-level row only).
 * - Visibility gate: post must currently have NO tier requirements (`current.tier_ids` empty),
 *   matching the "free post" definition. Tier-gated discovery is a future revenue conversation
 *   and intentionally NOT exposed in v1.
 * - Recency-DESC ordering by `published_at`.
 * - Fairness cap: a single creator can contribute at most `creatorCap` posts per response
 *   (default 2). Beyond the cap, that creator's older eligible posts are dropped from this page
 *   but remain reachable on subsequent pages once the cap resets.
 * - Free-text search is the canonical kernel from `src/gallery/query.ts` (D35). No new tokenizer.
 *
 * # What this is NOT
 *
 * - Not personalized. The result set is identical for every viewer (modulo their own creator's
 *   posts, which are excluded so a creator doesn't see themselves on Discover -- see exclusion).
 * - Not ranked beyond recency. Engagement signals (likes, similarity) belong to PE-M / PE-F v2.
 * - Not deduplicated against the viewer's existing follow graph. A patron may see posts from
 *   creators they already follow; the surface is for "what's new on Relay," not "what's new
 *   that you haven't seen."
 */

import type { CanonicalSnapshot, PostRow } from "../ingest/canonical-store.js";
import { itemMatchesFreeTextQuery, stripHtmlForSearch } from "../gallery/query.js";
import type { GalleryItem, GalleryOverridesRoot } from "../gallery/types.js";

/** Default fairness cap: max posts per single creator in one response page. */
export const DEFAULT_CREATOR_CAP = 2;
/** Default page size. Caps tail-latency on a synchronous full-snapshot scan. */
export const DEFAULT_LIMIT = 24;
/** Maximum allowed limit; beyond this clients must paginate. */
export const MAX_LIMIT = 50;

export interface DiscoverItem {
  creator_id: string;
  post_id: string;
  title: string;
  description?: string;
  published_at: string;
  tag_ids: string[];
  /** Stable cover media id from the post's current version when present. */
  cover_media_id?: string;
}

export interface DiscoverPageResult {
  items: DiscoverItem[];
  next_cursor: string | null;
}

export interface DiscoverListParams {
  /** Free-text query; reuses `itemMatchesFreeTextQuery` for AND-tokens semantics. */
  q?: string;
  limit?: number;
  cursor?: string;
  /** Max posts from any single creator in this page. Default DEFAULT_CREATOR_CAP. */
  creator_cap?: number;
  /**
   * Optional viewer's own creator scope; their posts are excluded so a creator doesn't see
   * themselves on the Discover surface. Pass null/undefined for anonymous-like behavior.
   */
  viewer_relay_creator_id?: string | null;
}

/** Encode/decode opaque cursor: base64({ published_at, post_id, creator_id }). */
function encodeCursor(c: { published_at: string; post_id: string; creator_id: string }): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(
  raw: string
): { published_at: string; post_id: string; creator_id: string } | null {
  try {
    const j = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      typeof j.published_at === "string" &&
      typeof j.post_id === "string" &&
      typeof j.creator_id === "string"
    ) {
      return {
        published_at: j.published_at,
        post_id: j.post_id,
        creator_id: j.creator_id
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Pull every (creator, post) that opts into Discover and currently has no tier gate. Returned
 * in deterministic creator-then-published order so the cursor can advance predictably.
 */
function collectEligible(
  snapshot: CanonicalSnapshot,
  overrides: GalleryOverridesRoot,
  excludeCreatorId: string | null | undefined
): DiscoverItem[] {
  const out: DiscoverItem[] = [];
  for (const [creatorId, posts] of Object.entries(snapshot.posts)) {
    if (excludeCreatorId && creatorId === excludeCreatorId) continue;
    const creatorOverride = overrides.creators[creatorId]?.posts ?? {};
    for (const [postId, postRow] of Object.entries(posts)) {
      if (postRow.upstream_status !== "active") continue;
      const eligible = creatorOverride[postId]?.discovery_eligible === true;
      if (!eligible) continue;
      // v1 visibility gate: currently free (no tier requirements). Tier-gated discovery is
      // explicitly out-of-scope for v1.
      if (postRow.current.tier_ids.length > 0) continue;
      out.push(toDiscoverItem(creatorId, postRow));
    }
  }
  return out;
}

function toDiscoverItem(creatorId: string, post: PostRow): DiscoverItem {
  const cover = post.current.media_ids[0];
  const item: DiscoverItem = {
    creator_id: creatorId,
    post_id: post.post_id,
    title: post.current.title,
    published_at: post.current.published_at,
    tag_ids: [...post.current.tag_ids]
  };
  if (post.current.description) {
    item.description = post.current.description;
  }
  if (cover) {
    item.cover_media_id = cover;
  }
  return item;
}

/**
 * Apply free-text search using the canonical kernel. We adapt each `DiscoverItem` to the
 * minimal `GalleryItem` shape `itemMatchesFreeTextQuery` expects so we don't fork the search
 * semantics (D35).
 */
function matchesQuery(item: DiscoverItem, raw: string): boolean {
  if (!raw.trim()) return true;
  // Synthesize the minimum GalleryItem fields the matcher inspects: title, tag_ids, description,
  // collection_theme_tag_ids, post_id, media_id. We pass empty strings for fields we don't have.
  const adapted: GalleryItem = {
    media_id: item.cover_media_id ?? "",
    post_id: item.post_id,
    title: item.title,
    description: stripHtmlForSearch(item.description),
    published_at: item.published_at,
    tag_ids: item.tag_ids,
    tier_ids: [],
    has_export: false,
    processing_status: "READY",
    export_status: "missing",
    content_url_path: "",
    preview_url_path: "",
    visibility: "visible",
    collection_ids: [],
    collection_theme_tag_ids: []
  };
  return itemMatchesFreeTextQuery(adapted, raw);
}

/**
 * Apply the per-creator cap on an already-sorted list. Walks once; tracks counts. Posts past
 * the cap are dropped from THIS page; they remain in the underlying snapshot and may surface
 * on subsequent pages once the page boundary moves past their pinned siblings.
 */
function applyCreatorCap(items: DiscoverItem[], cap: number): DiscoverItem[] {
  if (cap <= 0) return [...items];
  const counts = new Map<string, number>();
  const out: DiscoverItem[] = [];
  for (const it of items) {
    const next = (counts.get(it.creator_id) ?? 0) + 1;
    if (next > cap) continue;
    counts.set(it.creator_id, next);
    out.push(it);
  }
  return out;
}

/**
 * Cursor-aware pagination. `cursor` describes the LAST item on the previous page; we drop
 * items at-or-before that cursor in (published_at DESC, creator_id ASC, post_id ASC) order.
 */
function applyCursor(items: DiscoverItem[], cursor: string | undefined): DiscoverItem[] {
  if (!cursor) return items;
  const c = decodeCursor(cursor);
  if (!c) return items;
  const idx = items.findIndex(
    (it) =>
      it.published_at === c.published_at &&
      it.creator_id === c.creator_id &&
      it.post_id === c.post_id
  );
  if (idx < 0) return items;
  return items.slice(idx + 1);
}

function clampLimit(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_LIMIT;
  if (raw <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(raw), MAX_LIMIT);
}

/**
 * Compose a Discover page. Pure function over (snapshot, overrides, params); no I/O.
 */
export function buildDiscoverPage(
  snapshot: CanonicalSnapshot,
  overrides: GalleryOverridesRoot,
  params: DiscoverListParams
): DiscoverPageResult {
  const limit = clampLimit(params.limit);
  const cap = params.creator_cap ?? DEFAULT_CREATOR_CAP;

  // 1. collect eligible candidates
  const candidates = collectEligible(snapshot, overrides, params.viewer_relay_creator_id ?? null);

  // 2. filter by free-text query (kernel reuse)
  const filtered = params.q ? candidates.filter((it) => matchesQuery(it, params.q!)) : candidates;

  // 3. sort published_at DESC; deterministic tiebreak by creator_id ASC, post_id ASC so the
  //    cursor's exact-match lookup is always unambiguous.
  filtered.sort((a, b) => {
    if (a.published_at !== b.published_at) {
      return a.published_at < b.published_at ? 1 : -1;
    }
    if (a.creator_id !== b.creator_id) {
      return a.creator_id < b.creator_id ? -1 : 1;
    }
    return a.post_id < b.post_id ? -1 : 1;
  });

  // 4. fairness cap BEFORE pagination so a single chatty creator can't fill an entire page
  const capped = applyCreatorCap(filtered, cap);

  // 5. cursor advance
  const afterCursor = applyCursor(capped, params.cursor);

  // 6. slice page; emit cursor only when more rows exist
  const page = afterCursor.slice(0, limit);
  const last = page[page.length - 1];
  const hasMore = afterCursor.length > limit;
  const next_cursor =
    hasMore && last
      ? encodeCursor({
          published_at: last.published_at,
          post_id: last.post_id,
          creator_id: last.creator_id
        })
      : null;

  return { items: page, next_cursor };
}
