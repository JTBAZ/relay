import { createHash } from "node:crypto";
import type { IngestPost, IngestMediaItem } from "../ingest/types.js";
import { normalizePatreonMediaUrl } from "./media-url-normalize.js";

function stableUrl(raw: string): string {
  try {
    const url = new URL(normalizePatreonMediaUrl(raw));
    if (/(^|\.)patreonusercontent\.com$/i.test(url.hostname)) {
      for (const key of [...url.searchParams.keys()]) {
        if (/^(token|token-hash|token-time|expires|signature|policy|key-pair-id|x-amz-.+|x-goog-.+)$/i.test(key)) url.searchParams.delete(key);
      }
      url.searchParams.sort();
    }
    return url.toString();
  } catch { return raw; }
}

/** Comparison only: keep original signed URLs on the ingest payload for downloads. */
export function patreonMediaContentHash(media: IngestMediaItem): string {
  return createHash("sha256").update(JSON.stringify({ id: media.media_id, url: media.upstream_url ? stableUrl(media.upstream_url) : undefined, mime: media.mime_type, role: media.role })).digest("hex");
}

export function patreonPostContentHash(post: IngestPost): string {
  const description = post.description?.replace(/https?:\/\/[^\s"'<>]+/gi, stableUrl);
  return createHash("sha256").update(JSON.stringify({
    title: post.title, description, published_at: post.published_at,
    tiers: [...new Set(post.tier_ids)].sort(),
    media: post.media.map(patreonMediaContentHash)
  })).digest("hex");
}
