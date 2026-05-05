import type { MediaProcessingState } from "../ingest/canonical-store.js";

export type { MediaProcessingState };

export type PostVisibility = "visible" | "hidden" | "review";

export type GalleryItem = {
  media_id: string;
  post_id: string;
  title: string;
  description?: string;
  published_at: string;
  tag_ids: string[];
  tier_ids: string[];
  mime_type?: string;
  media_role?: string;
  has_export: boolean;
  /** Relay upload pipeline (DB); legacy/file snapshots omit → consumers default to READY. */
  processing_status: MediaProcessingState;
  /** `ready` = blob in export index; `missing` = not yet exported or failed. */
  export_status: "ready" | "missing";
  /** Set when a failed export was recorded in `export_index.export_failures` (user can retry). */
  export_error?: string;
  content_url_path: string;
  /**
   * Visitor-safe raster teaser: small blurred still derived from export (images only).
   * Tier-redacted rows keep this path while `content_url_path` is cleared.
   */
  preview_url_path: string;
  visibility: PostVisibility;
  collection_ids: string[];
  /** Theme tags from collections that include this post (for search / UI). */
  collection_theme_tag_ids: string[];
  /**
   * Patreon often ships the same binary as both `cover` and attachment with different signed URLs.
   * When true, UI may hide this row by default; it remains in API/search for recovery.
   */
  shadow_cover?: boolean;
};

export type GalleryTierFacet = {
  tier_id: string;
  title: string;
  amount_cents?: number;
};

export type GalleryPostDetail = {
  post_id: string;
  title: string;
  description?: string;
  published_at: string;
  tag_ids: string[];
  tiers: GalleryTierFacet[];
  media: GalleryItem[];
  /** Relay Inspect tier previews + CTA JSON when `PostPresentation.tierPreviewSettings` exists. */
  tier_preview_settings?: unknown;
};

export type GallerySortMode = "published" | "visibility";

export type GalleryDisplayMode = "all_media" | "post_primary";

/** Synthetic `post_only_*` gallery rows (no media assets). Default API behavior excludes them. */
export type GalleryTextOnlyPostsMode = "exclude" | "include";

export type GalleryListParams = {
  creator_id: string;
  q?: string;
  tag_ids?: string[];
  tier_ids?: string[];
  media_type?: string;
  published_after?: string;
  published_before?: string;
  /**
   * Public / visitor catalog: include `visible` and `review`, never `hidden`.
   * When true, a client `visibility` filter is ignored (caller should omit it).
   */
  visitor_catalog?: boolean;
  visibility?: PostVisibility | "all";
  /** Default published: date desc. visibility: review rows last, then date desc. */
  sort?: GallerySortMode;
  /** `post_primary`: one row per post (hero asset). Default `all_media` preserves one row per media. */
  display?: GalleryDisplayMode;
  /**
   * `exclude` (default): omit synthetic text-only rows (`media_id` starts with `post_only_`).
   * `include`: show polls / text-only posts in the library list.
   */
  text_only_posts?: GalleryTextOnlyPostsMode;
  cursor?: string;
  limit: number;
};

export type GalleryListResult = {
  items: GalleryItem[];
  next_cursor: string | null;
};

export type MediaOverride = {
  visibility?: PostVisibility;
  /** Added on top of post-level row tags for this asset only (Library / search). */
  add_tag_ids?: string[];
  /** Removed from post-level row tags for this asset only. */
  remove_tag_ids?: string[];
};

/** Deltas applied on top of canonical post data; not overwritten by Patreon ingest. */
export type PostOverride = {
  /** Tags to add to effective tag list (Library / search); stored only in overrides file. */
  add_tag_ids: string[];
  /** Tags to strip from effective list even if Patreon keeps sending them in canonical. */
  remove_tag_ids: string[];
  visibility?: PostVisibility;
  /**
   * PE-F (BO-P3-01) — when true (and the underlying post is public), surfaced in
   * `GET /api/v1/patron/discover`. Default false on read; only present in the file/db row when
   * the creator has explicitly opted in. Per-media rows ignore this flag.
   */
  discovery_eligible?: boolean;
  /** Per-asset visibility; wins over post-level for that media row in the gallery. */
  media?: Record<string, MediaOverride>;
};

/** @deprecated Use PostOverride instead */
export type PostTagOverride = PostOverride;

export type GalleryOverridesRoot = {
  creators: Record<
    string,
    {
      posts: Record<string, PostTagOverride>;
    }
  >;
};

export type SavedFilterRecord = {
  filter_id: string;
  creator_id: string;
  name: string;
  query: {
    q?: string;
    tag_ids?: string[];
    tier_ids?: string[];
    media_type?: string;
    published_after?: string;
    published_before?: string;
  };
  created_at: string;
};

export type SavedFiltersRoot = {
  filters: SavedFilterRecord[];
};

// --- Collections ---

export type Collection = {
  collection_id: string;
  creator_id: string;
  title: string;
  description?: string;
  cover_media_id?: string;
  /**
   * When set, posts added to this collection must not require a higher pledge
   * floor than this tier (see tier-access helpers).
   */
  access_ceiling_tier_id?: string;
  /** Collection-scoped theme labels (search/filter in Designer / future Library). */
  theme_tag_ids: string[];
  post_ids: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CollectionsRoot = {
  collections: Collection[];
};

// --- Page Layout ---

export type LayoutMode = "grid" | "masonry" | "list" | "featured";

export type PageSection = {
  section_id: string;
  title: string;
  source:
    | { type: "collection"; collection_id: string }
    | { type: "filter"; query: GalleryListParams }
    | { type: "manual"; post_ids: string[] };
  layout: LayoutMode;
  columns?: number;
  max_items?: number;
  sort_order: number;
};

/** Saved with page layout — controls section item ordering on profile + designer preview */
export type GalleryArrangement = "chronological" | "tier";

export type PageLayout = {
  creator_id: string;
  theme: {
    color_scheme: "dark" | "light" | "warm";
    accent_color?: string;
    /** Designer: show bio paragraph under hero */
    show_bio?: boolean;
    /** Designer: tier chips on gallery tiles */
    show_tier_badges?: boolean;
    /** How items are ordered within each layout section */
    gallery_arrangement?: GalleryArrangement;
    /** Link to patreon.com/{slug} under hero when Patreon slug is known */
    show_patreon_link?: boolean;
    /** Where the Patreon URL appears in the profile hero */
    patreon_link_position?: "below_avatar" | "below_bio";
  };
  hero?: {
    title: string;
    subtitle?: string;
    cover_media_id?: string;
    /**
     * When false, no full-width hero cover (designer + visitor), even if a Patreon campaign banner exists.
     * Omitted = legacy: show cover when `cover_media_id` or synced banner is available.
     */
    show_cover?: boolean;
    /** Longer bio copy (separate from one-line subtitle) */
    bio?: string;
  };
  sections: PageSection[];
  updated_at: string;
};

export type PageLayoutRoot = {
  layouts: Record<string, PageLayout>;
};

// --- Patron favorites (Relay-only; not synced to Patreon) ---

export type PatronFavoriteTargetKind = "post" | "media";

export type PatronFavoriteRecord = {
  user_id: string;
  creator_id: string;
  target_kind: PatronFavoriteTargetKind;
  target_id: string;
  created_at: string;
  /**
   * PE-D / D29: tier ids the patron was entitled to AT favorite time. Forensic only —
   * never consulted for gate decisions; viewer access is re-checked live at render time.
   * Optional on the wire for backward compat with file-store callers that pre-date PE-D.
   */
  snapshot_tier_ids?: string[];
};

export type PatronFavoritesRoot = {
  favorites: PatronFavoriteRecord[];
};

// --- Patron collections (snips; Relay-only) ---

export type PatronCollectionRecord = {
  collection_id: string;
  user_id: string;
  creator_id: string;
  title: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /**
   * PE-D / D11: when true, the collection is exposed on the patron's public profile.
   * Optional on the wire for backward compat with file-store callers that pre-date PE-D.
   */
  is_public?: boolean;
};

export type PatronCollectionEntryRecord = {
  entry_id: string;
  collection_id: string;
  user_id: string;
  creator_id: string;
  post_id: string;
  media_id: string;
  created_at: string;
  /**
   * PE-D / D29: tier ids the patron was entitled to AT save time. Forensic only —
   * never consulted for gate decisions; viewer access is re-checked live at render time.
   * Optional on the wire for backward compat with file-store callers that pre-date PE-D.
   */
  snapshot_tier_ids?: string[];
};

export type PatronCollectionsRoot = {
  collections: PatronCollectionRecord[];
  entries: PatronCollectionEntryRecord[];
};

/**
 * PE-D / D29 — viewer-aware render contract. Computed LIVE at every render against the viewer's
 * current `PatronEntitlementSnapshot` for the source creator. The 'unlockable' slot is reserved
 * for PE-L (tip-to-unlock) and stays dormant until that lane ships, but is part of the API shape
 * from day one to avoid a second response-shape migration later.
 *
 * - 'visible'    — viewer's current entitlement covers the post's required tiers (or post is free).
 * - 'preview'    — post permits a free preview slice and viewer lacks full access (reserved; PE-D
 *                  emits 'visible' for free posts and 'locked' otherwise until PE-L lands).
 * - 'unlockable' — viewer can pay a one-off tip to unlock viewing for a bounded window (PE-L; dormant).
 * - 'locked'     — viewer cannot view and has no tip path; show blurred teaser + upgrade CTA.
 */
export type ViewerEntitlementState = "visible" | "preview" | "unlockable" | "locked";

export type ViewerEntitlementDecision = {
  state: ViewerEntitlementState;
  /** Tier ids required to fully view the source post (empty = free / no tier required). */
  required_tier_ids: string[];
  /**
   * Optional debug breadcrumb: which kind of snapshot we consulted. Helpful in QA and metrics
   * but never surfaced to end users.
   */
  source: "free_post" | "active_snapshot" | "missing_snapshot" | "inactive_snapshot";
};

export type PatronFavoriteWithViewerEntitlement = PatronFavoriteRecord & {
  viewer_entitlement: ViewerEntitlementDecision;
};

export type PatronCollectionEntryWithViewerEntitlement = PatronCollectionEntryRecord & {
  viewer_entitlement: ViewerEntitlementDecision;
};
