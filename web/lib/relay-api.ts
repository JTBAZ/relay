/** No trailing slash — paths like `/api/v1/...` are appended below. */
function resolveRelayApiBase(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_RELAY_API_URL ?? "").trim();
  const raw = fromEnv.length > 0 ? fromEnv : "http://127.0.0.1:8787";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "http://127.0.0.1:8787";
}
export const RELAY_API_BASE = resolveRelayApiBase();

type Envelope<T> = { data: T; meta: { trace_id: string } };

export async function relayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RELAY_API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    },
    cache: "no-store"
  });
  const json = (await res.json()) as Envelope<T> & { error?: { message: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? res.statusText);
  }
  return json.data;
}

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
  media_role?: string;
  has_export: boolean;
  content_url_path: string;
  visibility: PostVisibility;
  collection_ids: string[];
};

export type Collection = {
  collection_id: string;
  creator_id: string;
  title: string;
  description?: string;
  cover_media_id?: string;
  access_ceiling_tier_id?: string;
  theme_tag_ids: string[];
  post_ids: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CollectionAddPostsResult = {
  collection: Collection;
  rejected_post_ids: { post_id: string; reason: string }[];
};

export type GalleryListData = {
  items: GalleryItem[];
  next_cursor: string | null;
};

export type TierFacet = { tier_id: string; title: string; amount_cents?: number };
export type FacetsData = { tag_ids: string[]; tier_ids: string[]; tiers: TierFacet[] };

export type GalleryPostDetail = {
  post_id: string;
  title: string;
  description?: string;
  published_at: string;
  tag_ids: string[];
  tiers: TierFacet[];
  media: GalleryItem[];
};

export type SavedFilter = {
  filter_id: string;
  creator_id: string;
  name: string;
  query: Record<string, unknown>;
  created_at: string;
};

export type TriageResult = {
  text_only_post_ids: string[];
  duplicate_groups: { canonical_post_id: string; duplicate_post_ids: string[] }[];
  small_media_ids: string[];
  cover_media_ids: string[];
  total_flagged: number;
};

export type LayoutMode = "grid" | "masonry" | "list";

export type PageSection = {
  section_id: string;
  title: string;
  source:
    | { type: "collection"; collection_id: string }
    | { type: "filter"; query: Record<string, unknown> }
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

export type GallerySortMode = "published" | "visibility";

/** Asset-level visibility: real media uses only media_targets; text-only rows use post_ids. */
export function buildGalleryVisibilityBody(
  creatorId: string,
  items: GalleryItem[],
  visibility: PostVisibility
): {
  creator_id: string;
  post_ids: string[];
  media_targets: { post_id: string; media_id: string }[];
  visibility: PostVisibility;
} {
  const postOnly = items.filter((i) => i.media_id?.startsWith("post_only_"));
  const mediaRows = items.filter(
    (i) => i.media_id && !i.media_id.startsWith("post_only_")
  );
  return {
    creator_id: creatorId,
    post_ids: Array.from(new Set(postOnly.map((i) => i.post_id))),
    media_targets: mediaRows.map((i) => ({ post_id: i.post_id, media_id: i.media_id })),
    visibility
  };
}

export function buildGalleryQuery(params: {
  creator_id: string;
  q?: string;
  tag_ids?: string[];
  tier_ids?: string[];
  media_type?: string;
  published_after?: string;
  published_before?: string;
  visibility?: PostVisibility | "all";
  sort?: GallerySortMode;
  cursor?: string | null;
  limit?: number;
}): string {
  const u = new URLSearchParams();
  u.set("creator_id", params.creator_id);
  if (params.q) u.set("q", params.q);
  for (const t of params.tag_ids ?? []) u.append("tag_ids", t);
  for (const t of params.tier_ids ?? []) u.append("tier_ids", t);
  if (params.media_type) u.set("media_type", params.media_type);
  if (params.published_after) u.set("published_after", params.published_after);
  if (params.published_before) u.set("published_before", params.published_before);
  if (params.visibility && params.visibility !== "all") u.set("visibility", params.visibility);
  if (params.sort) u.set("sort", params.sort);
  if (params.cursor) u.set("cursor", params.cursor);
  if (params.limit != null) u.set("limit", String(params.limit));
  return `/api/v1/gallery/items?${u.toString()}`;
}
