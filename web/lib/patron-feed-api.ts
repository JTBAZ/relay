import { RELAY_API_BASE, relayFetch } from "@/lib/relay-api";
import type { PatronFeedBundle, PatronFeedItemSource } from "@/lib/relay-fixtures";

export type { PatronFeedItemSource };

/**
 * Patron home feed + sidebar payload from `GET /api/v1/patron/relay_feed` (alias: `GET /api/v1/patron/feed`).
 * With DB identity + Prisma (`RELAY_DB_STORE_IDENTITY`), the server assembles from follows, posts,
 * and entitlement snapshots (PE-B). Without that, the same routes serve static fixture JSON from
 * `web/lib/patron-relay-feed-bundle.json` — there is no separate patron-feed fixture env flag.
 * The live sidebar also calls `GET /api/v1/patron/follows` (PE-C; see `patron-follows-api.ts`) for ordering and faster load.
 *
 * Optional query params (PE-B): `cursor`, `limit`, `filter` — pass via {@link fetchPatronRelayFeedWithOptions}.
 *
 * Auth: HttpOnly `relay_session` cookie with `credentials: "include"` (see {@link relayFetch}).
 *
 * Cover/high-res image URLs come back as **paths** (`/api/v1/export/media/...`) so the API
 * stays origin-agnostic; we rewrite them to absolute URLs against {@link RELAY_API_BASE} below
 * so `<img src>` works cross-origin (Next.js dev :3000 ↔ Relay API :8787, plus prod variants).
 */
export async function fetchPatronRelayFeed(): Promise<PatronFeedBundle> {
  return absolutizeMediaUrls(await relayFetch<PatronFeedBundle>("/api/v1/patron/relay_feed"));
}

export type FetchPatronFeedOptions = {
  cursor?: string | null;
  limit?: number;
  filter?: string | null;
};

/** PE-B — same as {@link fetchPatronRelayFeed} with pagination / filter query string. */
export async function fetchPatronRelayFeedWithOptions(
  opts: FetchPatronFeedOptions = {}
): Promise<PatronFeedBundle> {
  const params = new URLSearchParams();
  if (opts.cursor?.trim()) params.set("cursor", opts.cursor.trim());
  if (opts.limit != null && opts.limit > 0) params.set("limit", String(opts.limit));
  if (opts.filter?.trim()) params.set("filter", opts.filter.trim());
  const q = params.toString();
  const bundle = await relayFetch<PatronFeedBundle>(
    `/api/v1/patron/feed${q ? `?${q}` : ""}`
  );
  return absolutizeMediaUrls(bundle);
}

/**
 * Rewrite Relay-relative media paths (`/api/...`) to absolute URLs against {@link RELAY_API_BASE}.
 * Leaves placeholder paths (`/placeholder.svg?...`) and any already-absolute URLs untouched.
 * Exported for {@link fetchPatronRelayFeed} tests.
 */
export function absolutizeMediaUrls(bundle: PatronFeedBundle): PatronFeedBundle {
  const fix = (u: string | null | undefined): string | undefined => {
    if (u == null || !u) return undefined;
    if (u.startsWith("/api/")) return `${RELAY_API_BASE}${u}`;
    return u;
  };
  return {
    ...bundle,
    feedPosts: bundle.feedPosts.map((p) => ({
      ...p,
      coverImageUrl: fix(p.coverImageUrl),
      highResImageUrl: fix(p.highResImageUrl),
      posterImageUrl: fix(p.posterImageUrl),
      galleryImageUrls: p.galleryImageUrls?.map((u) => fix(u) ?? u)
    }))
  };
}
