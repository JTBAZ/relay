/**
 * @fileoverview URL normalization helpers for Patreon CDN media deduplication keys and stable asset fingerprints.
 * @description First-seen raw `upstream_url` should still be stored on ingest rows for download; these helpers only derive comparison keys.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `MediaAsset` upstream / storage fields via ingest
 * @todo Brittle: Signed URLs differing only by auth token are not collapsed (would break fetches).
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

/**
 * Strips hash, normalizes host case, and drops sizing query params on Patreon CDN hosts.
 * @param url Raw media URL.
 */
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

/**
 * Derives `postNum:contentHash` key when URL matches Patreon post asset path pattern.
 * @param url Media URL or undefined.
 * @returns Lowercase hash tuple or `null` when pattern does not match.
 */
export function patreonPostMediaStableKey(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const pathname = new URL(url.trim()).pathname;
    const m = pathname.match(PATREON_POST_ASSET_PATH_RE);
    if (!m?.[1] || !m?.[2]) return null;
    return `${m[1]}:${m[2].toLowerCase()}`;
  } catch {
    return null;
  }
}
