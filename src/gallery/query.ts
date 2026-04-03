import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { CreatorExportIndex } from "../export/types.js";
import type { MediaRow } from "../ingest/canonical-store.js";
import { patreonPostMediaStableKey } from "../patreon/media-url-normalize.js";
import type {
  Collection,
  GalleryItem,
  GalleryListParams,
  GalleryListResult,
  GalleryOverridesRoot,
  GallerySortMode,
  PostVisibility
} from "./types.js";

/** Post-level tags after gallery override add/remove deltas (matches list rows). */
export function effectiveTags(
  base: string[],
  creatorId: string,
  postId: string,
  overrides: GalleryOverridesRoot
): string[] {
  const delta = overrides.creators[creatorId]?.posts[postId];
  if (!delta) {
    return [...base];
  }
  const next = new Set(base.filter((t) => !delta.remove_tag_ids.includes(t)));
  for (const a of delta.add_tag_ids) {
    next.add(a);
  }
  return [...next];
}

/**
 * Whether this row gets the "cover" chip. Attachment ids (`patreon_media_*`) are never
 * cover even if canonical `role` was wrongly merged to "cover" for all assets.
 */
function isGalleryCoverAsset(mediaRole: string | undefined, mediaId: string): boolean {
  if (/^patreon_media_/i.test(mediaId)) {
    return false;
  }
  if (/^patreon_\d+_cover$/i.test(mediaId)) {
    return true;
  }
  return mediaRole === "cover";
}

function tagIsCoverChip(tag: string): boolean {
  return /^cover$/i.test(tag);
}

/** Tags per row: show the cover chip only on real cover assets (role or id pattern). */
function applyMediaRowTagDelta(
  rowTags: string[],
  creatorId: string,
  postId: string,
  mediaId: string,
  overrides: GalleryOverridesRoot
): string[] {
  if (mediaId.startsWith("post_only_")) {
    return rowTags;
  }
  const mo = overrides.creators[creatorId]?.posts[postId]?.media?.[mediaId];
  if (!mo) {
    return rowTags;
  }
  const add = mo.add_tag_ids ?? [];
  const rem = mo.remove_tag_ids ?? [];
  if (add.length === 0 && rem.length === 0) {
    return rowTags;
  }
  const next = new Set(rowTags.filter((t) => !rem.includes(t)));
  for (const a of add) {
    next.add(a);
  }
  return [...next];
}

function galleryRowTags(
  postLevelTags: string[],
  mediaRole: string | undefined,
  mediaId: string,
  isPostOnlySynthetic: boolean
): string[] {
  if (isPostOnlySynthetic) {
    return [...postLevelTags];
  }
  const tags = [...postLevelTags];
  const rowIsCover = isGalleryCoverAsset(mediaRole, mediaId);
  if (rowIsCover) {
    if (!tags.some(tagIsCoverChip)) {
      tags.push("cover");
    }
    return tags;
  }
  return tags.filter((t) => !tagIsCoverChip(t));
}

function resolveItemVisibility(
  creatorId: string,
  postId: string,
  mediaId: string,
  overrides: GalleryOverridesRoot
): PostVisibility {
  const post = overrides.creators[creatorId]?.posts[postId];
  if (!mediaId.startsWith("post_only_")) {
    const mediaVis = post?.media?.[mediaId]?.visibility;
    if (mediaVis !== undefined) {
      return mediaVis;
    }
  }
  return post?.visibility ?? "visible";
}

/** Cap description scan length for universal `q` search (cost bound). */
const MAX_DESC_SEARCH_CHARS = 16_000;

/**
 * Strip HTML for substring search: tags removed, common entities simplified, whitespace collapsed.
 */
export function stripHtmlForSearch(html: string | undefined): string {
  if (!html?.trim()) {
    return "";
  }
  const noTags = html.replace(/<[^>]*>/g, " ");
  const decoded = noTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    });
  return decoded.replace(/\s+/g, " ").trim();
}

/**
 * Universal Find Assets `q`: whitespace tokens, AND across tokens; each token matches if it appears
 * (case-insensitive substring) in title, any row tag, stripped description (first MAX_DESC_SEARCH_CHARS),
 * any collection theme tag, or post_id / media_id.
 */
export function itemMatchesFreeTextQuery(item: GalleryItem, raw: string): boolean {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  if (tokens.length === 0) {
    return true;
  }

  const titleLower = item.title.toLowerCase();
  const postIdLower = item.post_id.toLowerCase();
  const mediaIdLower = item.media_id.toLowerCase();
  const descHay = stripHtmlForSearch(item.description)
    .slice(0, MAX_DESC_SEARCH_CHARS)
    .toLowerCase();

  for (const token of tokens) {
    const inTitle = titleLower.includes(token);
    const inTag = item.tag_ids.some((t) => t.toLowerCase().includes(token));
    const inDesc = descHay.includes(token);
    const inTheme = item.collection_theme_tag_ids.some((t) => t.toLowerCase().includes(token));
    const inIds = postIdLower.includes(token) || mediaIdLower.includes(token);
    if (!inTitle && !inTag && !inDesc && !inTheme && !inIds) {
      return false;
    }
  }
  return true;
}

export function buildGalleryItems(
  creatorId: string,
  snapshot: CanonicalSnapshot,
  exportIndex: CreatorExportIndex,
  overrides: GalleryOverridesRoot,
  collections: Collection[] = []
): GalleryItem[] {
  const posts = snapshot.posts[creatorId] ?? {};
  const mediaMap = snapshot.media[creatorId] ?? {};
  const items: GalleryItem[] = [];

  // Pre-index: postId -> collection_ids
  const postCollectionMap = new Map<string, string[]>();
  /** postId -> deduped collection theme tags (for universal search). */
  const postThemeTags = new Map<string, Set<string>>();
  for (const col of collections) {
    for (const pid of col.post_ids) {
      const arr = postCollectionMap.get(pid);
      if (arr) arr.push(col.collection_id);
      else postCollectionMap.set(pid, [col.collection_id]);
      const themes = col.theme_tag_ids ?? [];
      if (themes.length > 0) {
        let set = postThemeTags.get(pid);
        if (!set) {
          set = new Set<string>();
          postThemeTags.set(pid, set);
        }
        for (const th of themes) {
          if (th.trim()) set.add(th.trim());
        }
      }
    }
  }

  for (const [postId, postRow] of Object.entries(posts)) {
    if (postRow.upstream_status === "deleted") {
      continue;
    }
    const baseTags = effectiveTags(
      postRow.current.tag_ids,
      creatorId,
      postId,
      overrides
    );

    const colIds = postCollectionMap.get(postId) ?? [];
    const themeTagList = [...(postThemeTags.get(postId) ?? [])];

    let addedMedia = false;
    for (const mediaId of postRow.current.media_ids) {
      const m = mediaMap[mediaId];
      if (!m || m.upstream_status === "deleted") {
        continue;
      }
      const hasExport = Boolean(exportIndex.media[mediaId]);
      const failRec = exportIndex.export_failures?.[mediaId];
      const rowTags = galleryRowTags(baseTags, m.current.role, mediaId, false);
      const tags = applyMediaRowTagDelta(rowTags, creatorId, postId, mediaId, overrides);
      items.push({
        media_id: mediaId,
        post_id: postId,
        title: postRow.current.title,
        description: postRow.current.description,
        published_at: postRow.current.published_at,
        tag_ids: tags,
        tier_ids: [...postRow.current.tier_ids],
        mime_type: m.current.mime_type,
        media_role: m.current.role,
        has_export: hasExport,
        export_status: hasExport ? "ready" : "missing",
        ...(failRec?.message && !hasExport
          ? { export_error: failRec.message }
          : {}),
        content_url_path: `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`,
        visibility: resolveItemVisibility(creatorId, postId, mediaId, overrides),
        collection_ids: colIds,
        collection_theme_tag_ids: themeTagList
      });
      addedMedia = true;
    }

    if (!addedMedia) {
      const syntheticId = `post_only_${postId}`;
      items.push({
        media_id: syntheticId,
        post_id: postId,
        title: postRow.current.title,
        description: postRow.current.description,
        published_at: postRow.current.published_at,
        tag_ids: applyMediaRowTagDelta(
          galleryRowTags(baseTags, undefined, syntheticId, true),
          creatorId,
          postId,
          syntheticId,
          overrides
        ),
        tier_ids: [...postRow.current.tier_ids],
        mime_type: undefined,
        has_export: false,
        export_status: "missing",
        content_url_path: "",
        visibility: resolveItemVisibility(creatorId, postId, syntheticId, overrides),
        collection_ids: colIds,
        collection_theme_tag_ids: themeTagList
      });
    }
  }

  markShadowCoverDuplicates(items, mediaMap);
  return items;
}

/**
 * When cover + attachment share the same Patreon post-media hash, mark the cover row as
 * `shadow_cover` so the Library can hide duplicate thumbnails without deleting data.
 */
function markShadowCoverDuplicates(
  items: GalleryItem[],
  mediaById: Record<string, MediaRow>
): void {
  const byPost = new Map<string, GalleryItem[]>();
  for (const it of items) {
    if (it.media_id.startsWith("post_only_")) continue;
    const arr = byPost.get(it.post_id) ?? [];
    arr.push(it);
    byPost.set(it.post_id, arr);
  }

  for (const group of byPost.values()) {
    if (group.length < 2) continue;
    const keyToItems = new Map<string, GalleryItem[]>();
    for (const it of group) {
      const url = mediaById[it.media_id]?.current?.upstream_url;
      const key = patreonPostMediaStableKey(url);
      if (!key) continue;
      const arr = keyToItems.get(key) ?? [];
      arr.push(it);
      keyToItems.set(key, arr);
    }
    for (const sameKey of keyToItems.values()) {
      if (sameKey.length < 2) continue;
      const covers = sameKey.filter((i) => isGalleryCoverAsset(i.media_role, i.media_id));
      const nonCovers = sameKey.filter((i) => !isGalleryCoverAsset(i.media_role, i.media_id));
      if (covers.length !== 1 || nonCovers.length < 1) continue;
      covers[0]!.shadow_cover = true;
    }
  }
}

function pickPrimaryGalleryItem(group: GalleryItem[]): GalleryItem {
  const primaryPool = group.filter((i) => !i.shadow_cover);
  const pool = primaryPool.length > 0 ? primaryPool : group;
  for (const it of pool) {
    if (isGalleryCoverAsset(it.media_role, it.media_id)) return it;
  }
  for (const it of pool) {
    if (it.has_export && it.mime_type?.startsWith("image/")) return it;
  }
  for (const it of pool) {
    if (it.has_export) return it;
  }
  return pool[0]!;
}

/** One row per post, preserving first-seen post order from `items`. */
export function galleryItemsPostPrimaryView(items: GalleryItem[]): GalleryItem[] {
  const byPost = new Map<string, GalleryItem[]>();
  const order: string[] = [];
  for (const it of items) {
    if (!byPost.has(it.post_id)) {
      order.push(it.post_id);
      byPost.set(it.post_id, []);
    }
    byPost.get(it.post_id)!.push(it);
  }
  return order.map((pid) => pickPrimaryGalleryItem(byPost.get(pid)!));
}

function groupItemsByPost(items: GalleryItem[]): { order: string[]; byPost: Map<string, GalleryItem[]> } {
  const byPost = new Map<string, GalleryItem[]>();
  const order: string[] = [];
  for (const it of items) {
    if (!byPost.has(it.post_id)) {
      order.push(it.post_id);
      byPost.set(it.post_id, []);
    }
    byPost.get(it.post_id)!.push(it);
  }
  return { order, byPost };
}

type CursorPayload = {
  published_at: string;
  post_id: string;
  media_id: string;
};

function encodeCursor(c: CursorPayload): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(raw: string): CursorPayload | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const v = JSON.parse(json) as CursorPayload;
    if (
      typeof v.published_at === "string" &&
      typeof v.post_id === "string" &&
      typeof v.media_id === "string"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function matchesFiltersExceptFreeText(item: GalleryItem, p: GalleryListParams): boolean {
  const textOnlyMode = p.text_only_posts ?? "exclude";
  if (textOnlyMode !== "include" && item.media_id.startsWith("post_only_")) {
    return false;
  }
  if (p.visitor_catalog) {
    if (item.visibility === "hidden") {
      return false;
    }
  } else if (p.visibility && p.visibility !== "all") {
    if (item.visibility !== p.visibility) {
      return false;
    }
  }
  if (p.tag_ids && p.tag_ids.length > 0) {
    for (const t of p.tag_ids) {
      if (!item.tag_ids.includes(t)) {
        return false;
      }
    }
  }
  if (p.tier_ids && p.tier_ids.length > 0) {
    if (!item.tier_ids.some((t) => p.tier_ids!.includes(t))) {
      return false;
    }
  }
  if (p.media_type && p.media_type.trim()) {
    const mt = p.media_type.trim().toLowerCase();
    const mime = (item.mime_type ?? "").toLowerCase();
    if (!mime || !mime.startsWith(mt)) {
      return false;
    }
  }
  if (p.published_after) {
    if (item.published_at < p.published_after) {
      return false;
    }
  }
  if (p.published_before) {
    if (item.published_at > p.published_before) {
      return false;
    }
  }
  return true;
}

function matchesFilters(item: GalleryItem, p: GalleryListParams): boolean {
  if (!matchesFiltersExceptFreeText(item, p)) {
    return false;
  }
  if (p.q && p.q.trim()) {
    if (!itemMatchesFreeTextQuery(item, p.q)) {
      return false;
    }
  }
  return true;
}

function itemMatchesChildSpecificFreeText(item: GalleryItem, raw: string): boolean {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  if (tokens.length === 0) {
    return false;
  }
  const mediaIdLower = item.media_id.toLowerCase();
  for (const token of tokens) {
    const inMediaId = mediaIdLower.includes(token);
    const inTag = item.tag_ids.some((t) => t.toLowerCase().includes(token));
    if (!inMediaId && !inTag) {
      return false;
    }
  }
  return true;
}

function postIncludedForSearch(group: GalleryItem[], q: string, p: GalleryListParams): boolean {
  const candidates = group.filter((i) => matchesFiltersExceptFreeText(i, p));
  if (candidates.length === 0) {
    return false;
  }
  return candidates.some((i) => itemMatchesFreeTextQuery(i, q));
}

function pickSearchFocusMediaItem(
  group: GalleryItem[],
  q: string,
  p: GalleryListParams
): GalleryItem {
  const candidates = group.filter((i) => matchesFiltersExceptFreeText(i, p));
  const matched = candidates.filter((i) => itemMatchesFreeTextQuery(i, q));
  if (matched.length === 0) {
    return pickPrimaryGalleryItem(candidates.length > 0 ? candidates : group);
  }

  const childMatched = matched.filter((i) => itemMatchesChildSpecificFreeText(i, q));
  if (childMatched.length === 0) {
    return pickPrimaryGalleryItem(candidates);
  }

  const nonShadow = childMatched.find((i) => !i.shadow_cover);
  return nonShadow ?? pickPrimaryGalleryItem(candidates);
}

function galleryItemsPostPrimarySearchView(
  items: GalleryItem[],
  params: GalleryListParams
): GalleryItem[] {
  const q = params.q?.trim();
  if (!q) {
    return galleryItemsPostPrimaryView(items);
  }
  const { order, byPost } = groupItemsByPost(items);
  const out: GalleryItem[] = [];
  for (const pid of order) {
    const group = byPost.get(pid)!;
    if (!postIncludedForSearch(group, q, params)) {
      continue;
    }
    out.push(pickSearchFocusMediaItem(group, q, params));
  }
  return out;
}

function sortKey(item: GalleryItem): [string, string, string] {
  return [item.published_at, item.post_id, item.media_id];
}

function visibilityRank(v: PostVisibility): number {
  if (v === "visible") return 0;
  if (v === "hidden") return 1;
  return 2;
}

function cmpPublishedDesc(a: GalleryItem, b: GalleryItem): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  if (ka[0] !== kb[0]) {
    return ka[0] < kb[0] ? 1 : -1;
  }
  if (ka[1] !== kb[1]) {
    return ka[1] < kb[1] ? -1 : 1;
  }
  return ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0;
}

function cmpVisibilityThenPublished(a: GalleryItem, b: GalleryItem): number {
  const ra = visibilityRank(a.visibility);
  const rb = visibilityRank(b.visibility);
  if (ra !== rb) {
    return ra - rb;
  }
  return cmpPublishedDesc(a, b);
}

function cmpForMode(mode: GallerySortMode | undefined): (a: GalleryItem, b: GalleryItem) => number {
  return mode === "visibility" ? cmpVisibilityThenPublished : cmpPublishedDesc;
}

export function listGalleryItems(
  all: GalleryItem[],
  params: GalleryListParams
): GalleryListResult {
  const filtered =
    params.display === "post_primary" && Boolean(params.q?.trim())
      ? galleryItemsPostPrimarySearchView(all, params)
      : all.filter((i) => matchesFilters(i, params));
  filtered.sort(cmpForMode(params.sort));

  let start = 0;
  if (params.cursor) {
    const c = decodeCursor(params.cursor);
    if (c) {
      const idx = filtered.findIndex(
        (i) =>
          i.published_at === c.published_at &&
          i.post_id === c.post_id &&
          i.media_id === c.media_id
      );
      if (idx >= 0) {
        start = idx + 1;
      }
    }
  }

  const slice = filtered.slice(start, start + params.limit);
  const last = slice[slice.length - 1];
  const next_cursor =
    slice.length === params.limit && last
      ? encodeCursor({
          published_at: last.published_at,
          post_id: last.post_id,
          media_id: last.media_id
        })
      : null;

  return { items: slice, next_cursor };
}

export function collectFacets(items: GalleryItem[]): {
  tag_ids: string[];
  tier_ids: string[];
  tag_counts: Record<string, number>;
} {
  const tagCounts = new Map<string, number>();
  const tiers = new Set<string>();
  for (const i of items) {
    for (const t of i.tag_ids) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    for (const t of i.tier_ids) {
      tiers.add(t);
    }
  }
  const tag_ids = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
  return {
    tag_ids,
    tier_ids: [...tiers].sort(),
    tag_counts: Object.fromEntries(tagCounts)
  };
}
