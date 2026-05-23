export type PostVisibility = "visible" | "hidden" | "review";

export type MediaTypeValue = "image" | "video" | "audio" | "text";

export type GalleryItem = {
  post_id: string;
  title: string;
  tier_ids: string[];
  tag_ids: string[];
  mime_type?: string;
  media_id?: string;
  content_url_path?: string;
  has_export?: boolean;
  export_error?: string;
  shadow_cover?: boolean;
  visibility?: PostVisibility;
  pipeline_status?: string;
  [key: string]: any;
};

export type TierFacet = {
  tier_id: string;
  title: string;
  amount_cents?: number;
  post_count?: number;
  [key: string]: any;
};

export type PostVisibility = {
  hidden: boolean;
  mature: boolean;
};

export type FacetsData = {
  tag_ids: string[];
  tiers: TierFacet[];
  media_types?: string[];
  export_media_count?: number;
  export_total_bytes?: number;
  total_post_count?: number;
};

export type Collection = {
  collection_id: string;
  title: string;
  post_ids: string[];
};

export type GalleryListData = {
  items: GalleryItem[];
  facets: FacetsData;
};

export type CollectionAddPostsResult = {
  success: boolean;
};

export type GalleryListData = {
  items: GalleryItem[];
  facets: FacetsData;
};

export const RELAY_API_BASE = process.env.NEXT_PUBLIC_RELAY_API_BASE ?? "";

export async function relayRequest(path: string, init?: RequestInit) {
  const url = `${RELAY_API_BASE}${path}`;
  return fetch(url, init);
}

export async function relayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!RELAY_API_BASE) return {} as T; // preview stub
  const res = await relayRequest(path, init);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function buildGalleryQuery(params: Record<string, any>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      u.set(k, String(v));
    }
  }
  return u.toString();
}
