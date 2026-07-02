/**
 * PE-S (PGS-01) — Patron global search API types + client (PGS-05).
 *
 * Mirror of [`src/patron/patron-search-types.ts`](../../src/patron/patron-search-types.ts).
 * Wire field names stay snake_case to match the backend envelope.
 */

import { RELAY_API_BASE, RelayApiError, relayFetch } from "@/lib/relay-api";
export const PATRON_SEARCH_MIN_QUERY_LENGTH = 2;

export const PATRON_SEARCH_DEFAULT_LIMIT = 20;

export const PATRON_SEARCH_MAX_LIMIT = 50;

export const PATRON_SEARCH_MAX_QUERY_LENGTH = 200;

export type PatronSearchMatchField =
  | "title"
  | "tag"
  | "description"
  | "theme_tag"
  | "post_id"
  | "media_id"
  | "creator";

export type PatronSearchMediaFilter = "all" | "photo" | "video" | "writing";

export type PatronSearchSortMode = "newest" | "oldest";

export type PatronSearchEntitlementState = "visible" | "locked";

export type PatronSearchMediaType = "writing" | "photo" | "audio" | "video";

export type PatronSearchCreator = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string;
};

export type PatronSearchHit = {
  creator_id: string;
  post_id: string;
  creator: PatronSearchCreator;
  title: string;
  excerpt: string;
  published_at: string;
  media_type: PatronSearchMediaType;
  cover_url_path: string | null;
  tag_ids: string[];
  tier_label: string;
  viewer_entitlement: PatronSearchEntitlementState;
  match_fields: PatronSearchMatchField[];
};

export type PatronSearchSection = {
  items: PatronSearchHit[];
  next_cursor: string | null;
};

/** Payload inside the Relay API success envelope for `GET /api/v1/patron/search`. */
export type PatronSearchResult = {
  query: string;
  /** Applied creator scope; empty means all followed creators. */
  creator_ids: string[];
  media_filter: PatronSearchMediaFilter;
  sort: PatronSearchSortMode;
  accessible: PatronSearchSection;
  locked: PatronSearchSection;
};

export type PatronSearchQueryArgs = {
  q: string;
  limit?: number;
  cursor?: string | null;
  /** Which bin to advance when paginating (defaults to accessible). */
  section?: "accessible" | "locked";
  media_filter?: PatronSearchMediaFilter;
  sort?: PatronSearchSortMode;
  /** When non-empty, limits search/browse to these followed creator ids. */
  creator_ids?: string[];
};

/** Returns true when the trimmed query meets the server minimum length. */
export function isPatronSearchQueryReady(raw: string): boolean {
  return raw.trim().length >= PATRON_SEARCH_MIN_QUERY_LENGTH;
}

/** True when the modal should call the search API (keyword search or creator browse). */
export function isPatronSearchRequestReady(args: {
  q: string;
  creator_ids?: readonly string[];
}): boolean {
  if ((args.creator_ids?.length ?? 0) > 0) return true;
  return isPatronSearchQueryReady(args.q);
}

function normalizeCreatorIdsForRequest(raw: readonly string[] | undefined): string[] {
  if (!raw?.length) return [];
  return Array.from(new Set(raw.map((s) => s.trim()).filter(Boolean)));
}

/** Map API validation failures to short modal copy (PGS-06). */
export function patronSearchValidationMessage(code: string | undefined): string | null {
  switch (code) {
    case "QUERY_TOO_SHORT":
      return `Enter at least ${PATRON_SEARCH_MIN_QUERY_LENGTH} characters to search.`;
    case "QUERY_TOO_LONG":
      return `Search is limited to ${PATRON_SEARCH_MAX_QUERY_LENGTH} characters.`;
    default:
      return null;
  }
}

/** User-facing copy for search modal errors (validation, auth, availability). */
export function patronSearchUserMessage(error: unknown): string {
  if (error instanceof RelayApiError) {
    const validation = patronSearchValidationMessage(error.code);
    if (validation) return validation;
    if (error.status === 401) {
      return "Sign in to search posts from creators you follow.";
    }
    if (error.status === 503) {
      return "Search is unavailable right now. Try again in a moment.";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Search failed. Try again.";
}

function absolutizeRelayPath(u: string | null | undefined): string | null | undefined {
  if (u == null || !u) return u;
  if (u.startsWith("/api/")) return `${RELAY_API_BASE}${u}`;
  return u;
}

function absolutizeSearchHit(hit: PatronSearchHit): PatronSearchHit {
  return {
    ...hit,
    cover_url_path: absolutizeRelayPath(hit.cover_url_path) ?? null,
    creator: {
      ...hit.creator,
      avatar_url: absolutizeRelayPath(hit.creator.avatar_url) ?? hit.creator.avatar_url
    }
  };
}

/**
 * Rewrite Relay-relative media paths on search hits for cross-origin `<img src>`.
 * Exported for tests.
 */
export function absolutizePatronSearchResult(result: PatronSearchResult): PatronSearchResult {
  return {
    ...result,
    accessible: {
      ...result.accessible,
      items: result.accessible.items.map(absolutizeSearchHit)
    },
    locked: {
      ...result.locked,
      items: result.locked.items.map(absolutizeSearchHit)
    }
  };
}

/**
 * GET /api/v1/patron/search — cross-creator search over followed creators.
 *
 * Auth: HttpOnly `relay_session` cookie with `credentials: "include"` (see {@link relayFetch}).
 */
export async function searchPatronPosts(
  args: PatronSearchQueryArgs
): Promise<PatronSearchResult> {
  const q = args.q.trim();
  const creatorIds = normalizeCreatorIdsForRequest(args.creator_ids);
  if (!isPatronSearchRequestReady({ q, creator_ids: creatorIds })) {
    throw new RelayApiError(
      patronSearchValidationMessage("QUERY_TOO_SHORT") ?? "Query too short.",
      400,
      "QUERY_TOO_SHORT"
    );
  }
  if (q.length > PATRON_SEARCH_MAX_QUERY_LENGTH) {
    throw new RelayApiError(
      patronSearchValidationMessage("QUERY_TOO_LONG") ?? "Query too long.",
      400,
      "QUERY_TOO_LONG"
    );
  }

  const params = new URLSearchParams();
  params.set("q", q);
  if (args.limit != null && args.limit > 0) {
    params.set("limit", String(Math.min(args.limit, PATRON_SEARCH_MAX_LIMIT)));
  }
  if (args.cursor?.trim()) params.set("cursor", args.cursor.trim());
  if (args.section === "locked") params.set("section", "locked");
  if (args.media_filter && args.media_filter !== "all") {
    params.set("media_filter", args.media_filter);
  }
  if (args.sort && args.sort !== "newest") {
    params.set("sort", args.sort);
  }
  for (const creatorId of creatorIds) {
    params.append("creator_id", creatorId);
  }

  const result = await relayFetch<PatronSearchResult>(
    `/api/v1/patron/search?${params.toString()}`
  );
  return absolutizePatronSearchResult(result);
}
