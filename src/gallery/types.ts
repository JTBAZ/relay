export type PostVisibility = "visible" | "hidden" | "flagged";

export type GalleryItem = {
  media_id: string;
  post_id: string;
  title: string;
  description?: string;
  published_at: string;
  tag_ids: string[];
  tier_ids: string[];
  mime_type?: string;
  has_export: boolean;
  content_url_path: string;
  visibility: PostVisibility;
  collection_ids: string[];
};

export type GalleryTierFacet = {
  tier_id: string;
  title: string;
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

export type GalleryListParams = {
  creator_id: string;
  q?: string;
  tag_ids?: string[];
  tier_ids?: string[];
  media_type?: string;
  published_after?: string;
  published_before?: string;
  visibility?: PostVisibility | "all";
  cursor?: string;
  limit: number;
};

export type GalleryListResult = {
  items: GalleryItem[];
  next_cursor: string | null;
};

export type PostOverride = {
  add_tag_ids: string[];
  remove_tag_ids: string[];
  visibility?: PostVisibility;
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
