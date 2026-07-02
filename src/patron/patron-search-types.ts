/**
 * @fileoverview Patron experience module patron-search-types.ts — wire contract for global search.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Post, PostVersion, PatronFollow, PatronEntitlementSnapshot
 * @security-audit-required Locked hits must not expose gated media URLs or full descriptions.
 */
/**
 * PE-S (PGS-01) — JSON shape for `GET /api/v1/patron/search`.
 *
 * Cross-creator search over posts from creators the patron follows. Results are split into
 * accessible and locked bins for the patron search modal (aggregator, not feed filter).
 */

/** Minimum trimmed query length before the server scans the followed corpus. */
export const PATRON_SEARCH_MIN_QUERY_LENGTH = 2;

/** Default page size per result section (accessible and locked paginate independently in v1). */
export const PATRON_SEARCH_DEFAULT_LIMIT = 20;

/** Maximum allowed `limit` query param. */
export const PATRON_SEARCH_MAX_LIMIT = 50;

/** Maximum trimmed query length accepted by the API. */
export const PATRON_SEARCH_MAX_QUERY_LENGTH = 200;

/** Which fields contributed to a free-text match (for UI highlighting / debugging). */
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

/**
 * Entitlement bucket for a search hit. v1 uses a coarse split; finer states (preview,
 * unlockable) belong on post detail, not search rows.
 */
export type PatronSearchEntitlementState = "visible" | "locked";

export type PatronSearchMediaType = "writing" | "photo" | "audio" | "video";

/** Compact creator block embedded on each search hit for modal rendering. */
export type PatronSearchCreatorJson = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string;
};

/** One post row in patron global search results. */
export type PatronSearchHitJson = {
  creator_id: string;
  post_id: string;
  creator: PatronSearchCreatorJson;
  title: string;
  /** Short plain-text snippet for the modal list (HTML stripped server-side). */
  excerpt: string;
  published_at: string;
  media_type: PatronSearchMediaType;
  /**
   * Relay export path (`/api/v1/export/media/...`) when the viewer may see cover art;
   * `null` for locked hits so the client never receives gated CDN or export URLs.
   */
  cover_url_path: string | null;
  tag_ids: string[];
  tier_label: string;
  viewer_entitlement: PatronSearchEntitlementState;
  match_fields: PatronSearchMatchField[];
};

/** Paginated slice within one entitlement bin. */
export type PatronSearchSectionJson = {
  items: PatronSearchHitJson[];
  next_cursor: string | null;
};

/** Full search response envelope payload (inside API success `data`). */
export type PatronSearchResultJson = {
  query: string;
  /** Applied creator scope; empty means all followed creators. */
  creator_ids: string[];
  media_filter: PatronSearchMediaFilter;
  sort: PatronSearchSortMode;
  accessible: PatronSearchSectionJson;
  locked: PatronSearchSectionJson;
};

/** Service/route input after query-string normalization. */
export type PatronSearchListParams = {
  q: string;
  limit?: number;
  cursor?: string | null;
  /** Which section cursor applies to when paginating (v1: accessible only; locked uses locked_cursor). */
  section?: "accessible" | "locked";
  media_filter?: PatronSearchMediaFilter;
  sort?: PatronSearchSortMode;
  /** When non-empty, search/browse is limited to these followed creator ids. */
  creator_ids?: string[];
};
