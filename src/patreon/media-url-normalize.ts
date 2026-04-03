/**
 * Normalize Patreon (and generic HTTP) media URLs for **deduplication keys** only.
 * First-seen raw `upstream_url` should still be stored on ingest rows for download.
 *
 * Limitations: Signed/tokenized URLs that differ only by auth token are not collapsed
 * (stripping token would break fetches). We only drop common **sizing / transform**
 * query params on Patreon CDN hosts so `?w=800` vs `?w=400` map to the same key.
 */

const PATREON_CDN_HOST_RE = /(^|\.)patreonusercontent\.com$/i;

/** Query param names treated as non-identity (image resize / quality hints). */
const SIZING_PARAM_NAMES = new Set([
  "w",
  "h",
  "width",
  "height",
  "fit",
  "crop",
  "q",
  "quality",
  "auto"
]);

export function normalizePatreonMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  parsed.hash = "";

  if (PATREON_CDN_HOST_RE.test(parsed.hostname)) {
    const next = new URLSearchParams();
    for (const [k, v] of parsed.searchParams) {
      const lower = k.toLowerCase();
      if (SIZING_PARAM_NAMES.has(lower)) continue;
      next.append(k, v);
    }
    const q = next.toString();
    parsed.search = q ? `?${q}` : "";
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}

/**
 * Stable fingerprint for Patreon post media URLs: `/p/post/{postNum}/{contentHash}/…`
 * The content hash matches across attachment vs cover transforms (different path segments after it).
 */
const PATREON_POST_ASSET_PATH_RE = /\/p\/post\/(\d+)\/([0-9a-f]{32})\//i;

export function patreonPostMediaStableKey(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const pathname = new URL(url.trim()).pathname;
    const m = pathname.match(PATREON_POST_ASSET_PATH_RE);
    if (!m?.[1] || !m[2]) return null;
    return `${m[1]}:${m[2].toLowerCase()}`;
  } catch {
    return null;
  }
}
