/**
 * Patreon per-post media merge rules and legacy pitfalls: docs/patreon-ingest-canonical.md
 */
import type { IngestMediaItem } from "../ingest/types.js";
import { normalizePatreonMediaUrl, patreonPostMediaStableKey } from "./media-url-normalize.js";

function pickPreferredIngestMedia(a: IngestMediaItem, b: IngestMediaItem): IngestMediaItem {
  const aCover = a.role === "cover";
  const bCover = b.role === "cover";
  if (aCover && !bCover) return a;
  if (bCover && !aCover) return b;
  return a;
}

/**
 * Collapse rows that share the same normalized URL (e.g. cover + attachment).
 * Preserves first-seen order; when merging, prefers `role: "cover"` for the survivor.
 */
export function mergeIngestMediaByNormalizedUrl(media: IngestMediaItem[]): IngestMediaItem[] {
  type Acc = { winner: IngestMediaItem; minIndex: number };
  const byKey = new Map<string, Acc>();
  const noUrl: IngestMediaItem[] = [];

  for (let i = 0; i < media.length; i++) {
    const item = media[i]!;
    const u = item.upstream_url;
    if (!u?.trim()) {
      noUrl.push(item);
      continue;
    }
    const k = normalizePatreonMediaUrl(u);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, { winner: item, minIndex: i });
    } else {
      prev.winner = pickPreferredIngestMedia(prev.winner, item);
    }
  }

  const merged = [...byKey.entries()]
    .sort((a, b) => a[1].minIndex - b[1].minIndex)
    .map(([, v]) => v.winner);

  return [...merged, ...noUrl];
}

function isIngestCoverItem(m: IngestMediaItem): boolean {
  if (m.role === "cover") return true;
  if (/^patreon_\d+_cover$/i.test(m.media_id)) return true;
  return false;
}

/**
 * Removes Patreon **cover** rows when another item in the post shares the same
 * `patreonPostMediaStableKey` (same underlying asset, different URL transforms).
 * Keeps attachment / main rows so canonical storage matches “what the post shows.”
 */
export function collapseDuplicatePatreonCoverByAssetKey(media: IngestMediaItem[]): IngestMediaItem[] {
  const byKey = new Map<string, IngestMediaItem[]>();
  for (const m of media) {
    const key = patreonPostMediaStableKey(m.upstream_url);
    if (!key) continue;
    const arr = byKey.get(key) ?? [];
    arr.push(m);
    byKey.set(key, arr);
  }

  const drop = new Set<string>();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const covers = group.filter(isIngestCoverItem);
    const nonCovers = group.filter((m) => !isIngestCoverItem(m));
    if (covers.length === 0 || nonCovers.length === 0) continue;
    for (const c of covers) {
      drop.add(c.media_id);
    }
  }

  return media.filter((m) => !drop.has(m.media_id));
}

/**
 * URL merge for cookie + OAuth post media.
 * Duplicate Patreon cover rows (same asset as attachment, different signed URL) are **not**
 * dropped here so canonical storage retains both; gallery marks `shadow_cover` and hides
 * duplicates unless the UI toggle is on (see `markShadowCoverDuplicates` in `query.ts`).
 */
export function finalizePatreonPostMedia(media: IngestMediaItem[]): IngestMediaItem[] {
  return mergeIngestMediaByNormalizedUrl(media);
}
