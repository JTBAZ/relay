import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { CreatorExportIndex } from "../export/types.js";
import type {
  Collection,
  GalleryItem,
  GalleryListParams,
  GalleryListResult,
  GalleryOverridesRoot,
  GallerySortMode,
  PostVisibility
} from "./types.js";

function effectiveTags(
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
  for (const col of collections) {
    for (const pid of col.post_ids) {
      const arr = postCollectionMap.get(pid);
      if (arr) arr.push(col.collection_id);
      else postCollectionMap.set(pid, [col.collection_id]);
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

    let addedMedia = false;
    for (const mediaId of postRow.current.media_ids) {
      const m = mediaMap[mediaId];
      if (!m || m.upstream_status === "deleted") {
        continue;
      }
      const hasExport = Boolean(exportIndex.media[mediaId]);
      const tags = galleryRowTags(baseTags, m.current.role, mediaId, false);
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
        content_url_path: `/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`,
        visibility: resolveItemVisibility(creatorId, postId, mediaId, overrides),
        collection_ids: colIds
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
        tag_ids: galleryRowTags(baseTags, undefined, syntheticId, true),
        tier_ids: [...postRow.current.tier_ids],
        mime_type: undefined,
        has_export: false,
        content_url_path: "",
        visibility: resolveItemVisibility(creatorId, postId, syntheticId, overrides),
        collection_ids: colIds
      });
    }
  }

  return items;
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

function matchesFilters(item: GalleryItem, p: GalleryListParams): boolean {
  if (p.visibility && p.visibility !== "all") {
    if (item.visibility !== p.visibility) {
      return false;
    }
  }
  if (p.q && p.q.trim()) {
    const q = p.q.trim().toLowerCase();
    if (!item.title.toLowerCase().includes(q)) {
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
  const filtered = all.filter((i) => matchesFilters(i, params));
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
} {
  const tags = new Set<string>();
  const tiers = new Set<string>();
  for (const i of items) {
    for (const t of i.tag_ids) {
      tags.add(t);
    }
    for (const t of i.tier_ids) {
      tiers.add(t);
    }
  }
  return {
    tag_ids: [...tags].sort(),
    tier_ids: [...tiers].sort()
  };
}
