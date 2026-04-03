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
  /** `ready` = blob in export index; `missing` = not yet exported or failed. */
  export_status: "ready" | "missing";
  /** Set when a failed export was recorded in `export_index.export_failures` (user can retry). */
  export_error?: string;
  content_url_path: string;
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

export type LayoutMode = "grid" | "masonry" | "list";

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

export type PageLayout = {
  creator_id: string;
  theme: {
    color_scheme: "dark" | "light" | "warm";
    accent_color?: string;
  };
  hero?: {
    title: string;
    subtitle?: string;
    cover_media_id?: string;
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
};

export type PatronCollectionEntryRecord = {
  entry_id: string;
  collection_id: string;
  user_id: string;
  creator_id: string;
  post_id: string;
  media_id: string;
  created_at: string;
};

export type PatronCollectionsRoot = {
  collections: PatronCollectionRecord[];
  entries: PatronCollectionEntryRecord[];
};
