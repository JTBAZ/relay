/** No trailing slash — paths like `/api/v1/...` are appended below. */
function resolveRelayApiBase(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_RELAY_API_URL ?? "").trim();
  const raw = fromEnv.length > 0 ? fromEnv : "http://127.0.0.1:8787";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "http://127.0.0.1:8787";
}
export const RELAY_API_BASE = resolveRelayApiBase();

type Envelope<T> = { data: T; meta: { trace_id: string } };

function patronAuthHeader(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }
  const t = window.localStorage.getItem("relay_session_token")?.trim();
  return t ? { authorization: `Bearer ${t}` } : {};
}

export async function relayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RELAY_API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...patronAuthHeader(),
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
  export_status: "ready" | "missing";
  /** Present when export failed after retries; use Retry in Library or re-sync Patreon. */
  export_error?: string;
  content_url_path: string;
  visibility: PostVisibility;
  collection_ids: string[];
  collection_theme_tag_ids: string[];
  /** Duplicate Patreon cover (same asset as another row); UI may hide by default. */
  shadow_cover?: boolean;
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
export type FacetsData = {
  tag_ids: string[];
  tier_ids: string[];
  tiers: TierFacet[];
  /** Asset-row counts per tag (same ordering basis as `tag_ids`, which is sorted by frequency desc). */
  tag_counts: Record<string, number>;
};

export type GalleryPostDetail = {
  post_id: string;
  title: string;
  description?: string;
  published_at: string;
  tag_ids: string[];
  tiers: TierFacet[];
  media: GalleryItem[];
};

export async function fetchGalleryPostDetail(
  creatorId: string,
  postId: string,
  options?: {
    visitor?: boolean;
    /** Dev: server honors when RELAY_DEV_VISITOR_TIER_SIM=true */
    dev_sim_patron?: boolean;
    simulate_tier_ids?: string[];
  }
): Promise<GalleryPostDetail> {
  const u = new URLSearchParams();
  u.set("creator_id", creatorId);
  u.set("post_id", postId);
  if (options?.visitor) u.set("visitor", "true");
  if (options?.dev_sim_patron) u.set("dev_sim_patron", "true");
  for (const t of options?.simulate_tier_ids ?? []) u.append("simulate_tier_ids", t);
  return relayFetch<GalleryPostDetail>(`/api/v1/gallery/post-detail?${u.toString()}`);
}

export type PatronFavoriteTargetKind = "post" | "media";

export type PatronFavoriteRecord = {
  user_id: string;
  creator_id: string;
  target_kind: PatronFavoriteTargetKind;
  target_id: string;
  created_at: string;
};

export type PatronFavoritesListData = { items: PatronFavoriteRecord[] };

export function patronFavoriteKey(kind: PatronFavoriteTargetKind, id: string): string {
  return `${kind}:${id}`;
}

export function patronFavoritesToKeySet(items: PatronFavoriteRecord[]): Set<string> {
  return new Set(items.map((f) => patronFavoriteKey(f.target_kind, f.target_id)));
}

export async function listPatronFavorites(creatorId: string): Promise<PatronFavoriteRecord[]> {
  const u = new URLSearchParams();
  u.set("creator_id", creatorId);
  const data = await relayFetch<PatronFavoritesListData>(`/api/v1/patron/favorites?${u.toString()}`);
  return data.items;
}

export async function addPatronFavorite(params: {
  creatorId: string;
  targetKind: PatronFavoriteTargetKind;
  targetId: string;
}): Promise<PatronFavoriteRecord> {
  const data = await relayFetch<{ item: PatronFavoriteRecord }>(`/api/v1/patron/favorites`, {
    method: "PUT",
    body: JSON.stringify({
      creator_id: params.creatorId,
      target_kind: params.targetKind,
      target_id: params.targetId
    })
  });
  return data.item;
}

export async function removePatronFavorite(params: {
  creatorId: string;
  targetKind: PatronFavoriteTargetKind;
  targetId: string;
}): Promise<void> {
  await relayFetch<{ deleted: boolean }>(`/api/v1/patron/favorites`, {
    method: "DELETE",
    body: JSON.stringify({
      creator_id: params.creatorId,
      target_kind: params.targetKind,
      target_id: params.targetId
    })
  });
}

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

export type PatronCollectionWithEntries = PatronCollectionRecord & {
  entries: PatronCollectionEntryRecord[];
};

export type PatronCollectionsListData = { collections: PatronCollectionWithEntries[] };

export async function listPatronCollections(
  creatorId: string
): Promise<PatronCollectionWithEntries[]> {
  const u = new URLSearchParams();
  u.set("creator_id", creatorId);
  const data = await relayFetch<PatronCollectionsListData>(
    `/api/v1/patron/collections?${u.toString()}`
  );
  return data.collections;
}

export function patronCollectionSnipMediaIdSet(
  collections: PatronCollectionWithEntries[]
): Set<string> {
  const s = new Set<string>();
  for (const c of collections) {
    for (const e of c.entries) {
      s.add(e.media_id);
    }
  }
  return s;
}

export async function createPatronCollection(params: {
  creatorId: string;
  title: string;
}): Promise<PatronCollectionRecord> {
  const data = await relayFetch<{ collection: PatronCollectionRecord }>(
    `/api/v1/patron/collections`,
    {
      method: "POST",
      body: JSON.stringify({ creator_id: params.creatorId, title: params.title })
    }
  );
  return data.collection;
}

export async function addPatronCollectionEntry(params: {
  creatorId: string;
  collectionId: string;
  postId: string;
  mediaId: string;
}): Promise<PatronCollectionEntryRecord> {
  const data = await relayFetch<{ entry: PatronCollectionEntryRecord }>(
    `/api/v1/patron/collections/${encodeURIComponent(params.collectionId)}/entries`,
    {
      method: "POST",
      body: JSON.stringify({
        creator_id: params.creatorId,
        post_id: params.postId,
        media_id: params.mediaId
      })
    }
  );
  return data.entry;
}

export async function removePatronCollectionEntry(params: {
  creatorId: string;
  collectionId: string;
  postId: string;
  mediaId: string;
}): Promise<void> {
  await relayFetch<{ deleted: boolean }>(
    `/api/v1/patron/collections/${encodeURIComponent(params.collectionId)}/entries`,
    {
      method: "DELETE",
      body: JSON.stringify({
        creator_id: params.creatorId,
        post_id: params.postId,
        media_id: params.mediaId
      })
    }
  );
}

export async function deletePatronCollection(
  creatorId: string,
  collectionId: string
): Promise<void> {
  const u = new URLSearchParams();
  u.set("creator_id", creatorId);
  await relayFetch<{ deleted: boolean }>(
    `/api/v1/patron/collections/${encodeURIComponent(collectionId)}?${u.toString()}`,
    { method: "DELETE" }
  );
}

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
  total_review_items: number;
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

/** Bulk bar: gallery presence vs content rating are edited separately; maps to single PostVisibility per row. */
export type VisibilityAxisAction = "set_visible" | "set_hidden" | "set_mature" | "set_general";

export function nextVisibilityAfterAxisAction(
  current: PostVisibility,
  action: VisibilityAxisAction
): PostVisibility {
  switch (action) {
    case "set_visible":
      if (current === "hidden") return "visible";
      return current;
    case "set_hidden":
      return "hidden";
    case "set_mature":
      if (current === "hidden") return "hidden";
      return "review";
    case "set_general":
      if (current === "hidden") return "hidden";
      return "visible";
    default:
      return current;
  }
}

export function bucketItemsByVisibilityAfterAction(
  items: GalleryItem[],
  action: VisibilityAxisAction
): Map<PostVisibility, GalleryItem[]> {
  const m = new Map<PostVisibility, GalleryItem[]>();
  for (const item of items) {
    const next = nextVisibilityAfterAxisAction(item.visibility, action);
    const arr = m.get(next) ?? [];
    arr.push(item);
    m.set(next, arr);
  }
  return m;
}

export type GalleryDisplayMode = "all_media" | "post_primary";

export type GalleryTextOnlyPostsParam = "exclude" | "include";

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
  display?: GalleryDisplayMode;
  /** Default omit: server treats missing as `exclude` (hide `post_only_*` rows). */
  text_only_posts?: GalleryTextOnlyPostsParam;
  /** Public catalog: visible + review, never hidden; tier export fields redacted without entitlement. */
  visitor?: boolean;
  cursor?: string | null;
  limit?: number;
  /** Dev: server honors when RELAY_DEV_VISITOR_TIER_SIM=true */
  dev_sim_patron?: boolean;
  simulate_tier_ids?: string[];
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
  if (params.display) u.set("display", params.display);
  if (params.text_only_posts === "include") u.set("text_only_posts", "include");
  if (params.visitor) u.set("visitor", "true");
  if (params.cursor) u.set("cursor", params.cursor);
  if (params.limit != null) u.set("limit", String(params.limit));
  if (params.dev_sim_patron) u.set("dev_sim_patron", "true");
  for (const t of params.simulate_tier_ids ?? []) u.append("simulate_tier_ids", t);
  return `/api/v1/gallery/items?${u.toString()}`;
}

export function buildGalleryFacetsQuery(creatorId: string, visitor?: boolean): string {
  const u = new URLSearchParams();
  u.set("creator_id", creatorId);
  if (visitor) u.set("visitor", "true");
  return `/api/v1/gallery/facets?${u.toString()}`;
}

export function buildGalleryCollectionsQuery(creatorId: string, visitor?: boolean): string {
  const u = new URLSearchParams();
  u.set("creator_id", creatorId);
  if (visitor) u.set("visitor", "true");
  return `/api/v1/gallery/collections?${u.toString()}`;
}

/**
 * Maps a layout section `filter.query` object to gallery list params (parity with Library / `buildGalleryQuery`).
 * Unknown or invalid fields are ignored.
 */
export function galleryParamsFromLayoutFilterQuery(query: Record<string, unknown>): {
  q?: string;
  tag_ids?: string[];
  tier_ids?: string[];
  media_type?: string;
  published_after?: string;
  published_before?: string;
  visibility?: PostVisibility | "all";
  sort?: GallerySortMode;
  text_only_posts?: GalleryTextOnlyPostsParam;
} {
  const out: {
    q?: string;
    tag_ids?: string[];
    tier_ids?: string[];
    media_type?: string;
    published_after?: string;
    published_before?: string;
    visibility?: PostVisibility | "all";
    sort?: GallerySortMode;
    text_only_posts?: GalleryTextOnlyPostsParam;
  } = {};

  if (typeof query.q === "string" && query.q.trim()) {
    out.q = query.q.trim();
  }

  if (Array.isArray(query.tag_ids) && query.tag_ids.every((x) => typeof x === "string")) {
    out.tag_ids = query.tag_ids;
  }

  if (Array.isArray(query.tier_ids) && query.tier_ids.every((x) => typeof x === "string")) {
    out.tier_ids = query.tier_ids;
  }

  if (typeof query.media_type === "string" && query.media_type.trim()) {
    out.media_type = query.media_type.trim();
  }

  if (typeof query.published_after === "string" && query.published_after.trim()) {
    out.published_after = query.published_after.trim();
  }

  if (typeof query.published_before === "string" && query.published_before.trim()) {
    out.published_before = query.published_before.trim();
  }

  const vis = query.visibility;
  if (vis === "visible" || vis === "hidden" || vis === "review" || vis === "all") {
    out.visibility = vis;
  }

  const sort = query.sort;
  if (sort === "published" || sort === "visibility") {
    out.sort = sort;
  }

  const top = query.text_only_posts;
  if (top === "include" || top === "exclude") {
    out.text_only_posts = top;
  }

  return out;
}

/** Patreon incremental sync watermark (GET /api/v1/patreon/sync-state). */
export type PatreonOAuthHealthData = {
  credential_health_status: "healthy" | "refresh_failed";
  access_token_expires_at: string;
  access_token_expired: boolean;
  access_token_expires_soon: boolean;
};

export type SyncHealthErrorData = {
  code: string;
  message: string;
  hint: string;
};

export type LastPostScrapeHealthData = {
  finished_at: string;
  ok: boolean;
  patreon_campaign_id?: string;
  error?: SyncHealthErrorData;
  posts_fetched?: number;
  posts_written?: number;
  warning_snippets?: string[];
};

export type LastMemberSyncHealthData = {
  finished_at: string;
  ok: boolean;
  patreon_campaign_id?: string;
  members_synced?: number;
  error?: SyncHealthErrorData;
};

/** Patreon OAuth campaign snapshot (avatar, banner, patron count). */
export type CampaignDisplayData = {
  patreon_campaign_id: string;
  /** Campaign vanity slug (lowercase); Library shows `patreon.com/{patreon_name}` under the Relay display name when set. */
  patreon_name?: string;
  image_url?: string;
  image_small_url?: string;
  patron_count?: number;
  captured_at: string;
};

export type PatreonSyncStateData = {
  creator_id: string;
  patreon_campaign_id: string;
  watermark_published_at: string | null;
  watermark_updated_at: string | null;
  has_cookie_session: boolean;
  upstream_newest_published_at?: string | null;
  likely_has_newer_posts?: boolean;
  oauth: PatreonOAuthHealthData;
  last_post_scrape: LastPostScrapeHealthData | null;
  last_member_sync: LastMemberSyncHealthData | null;
  campaign_display: CampaignDisplayData | null;
};

/** True when the Library should show a sync-issue pill without opening the menu. */
export function syncStateNeedsAttention(s: PatreonSyncStateData): boolean {
  if (s.oauth.credential_health_status === "refresh_failed") return true;
  if (s.oauth.access_token_expired) return true;
  if (s.last_post_scrape && !s.last_post_scrape.ok) return true;
  if (s.last_member_sync && !s.last_member_sync.ok) return true;
  return false;
}

/** One-line summary for the top bar when something needs attention. */
export function formatSyncHealthBanner(s: PatreonSyncStateData): string | null {
  if (s.oauth.access_token_expired) {
    return "Patreon access expired — reconnect (Patreon connect).";
  }
  if (s.oauth.credential_health_status === "refresh_failed") {
    return "Patreon token refresh failed — reconnect your creator account.";
  }
  if (s.last_post_scrape && !s.last_post_scrape.ok && s.last_post_scrape.error?.hint) {
    return s.last_post_scrape.error.hint;
  }
  if (s.last_member_sync && !s.last_member_sync.ok && s.last_member_sync.error?.hint) {
    return `Member sync: ${s.last_member_sync.error.hint}`;
  }
  if (s.oauth.access_token_expires_soon) {
    return "Patreon token expires soon — refresh or reconnect.";
  }
  return null;
}

export type TierAccessSummaryData = {
  media_source: "cookie" | "oauth";
  oauth_list_pass: boolean;
  oauth_list_posts_updated: number;
  oauth_list_pages_fetched: number;
  per_post_oauth_targets: number;
  per_post_filled_tiers: number;
  per_post_filled_body: number;
};

export type PatreonScrapeResultData = {
  creator_id: string;
  patreon_campaign_id: string;
  media_source: "cookie" | "oauth";
  tier_access_summary: TierAccessSummaryData;
  pages_fetched: number;
  posts_fetched: number;
  summary: {
    campaigns: number;
    tiers: number;
    posts: number;
    media_items: number;
  };
  warnings: string[];
  campaign_display?: CampaignDisplayData;
  apply_result?: {
    posts_written?: number;
    media_written?: number;
    ingest_notes?: string[];
  };
};

async function fetchRelayCreatorJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RELAY_API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    },
    cache: "no-store"
  });
  const json = (await res.json()) as { data: T; error?: { message: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? res.statusText);
  }
  return json.data;
}

export async function fetchPatreonSyncState(
  creatorId: string,
  opts?: { campaignId?: string; probeUpstream?: boolean }
): Promise<PatreonSyncStateData> {
  const q = new URLSearchParams({ creator_id: creatorId });
  if (opts?.campaignId?.trim()) {
    q.set("campaign_id", opts.campaignId.trim());
  }
  if (opts?.probeUpstream) {
    q.set("probe_upstream", "true");
  }
  return fetchRelayCreatorJson<PatreonSyncStateData>(`/api/v1/patreon/sync-state?${q}`);
}

export async function postPatreonScrape(body: {
  creator_id: string;
  campaign_id?: string;
  dry_run?: boolean;
  force_refresh_post_access?: boolean;
  max_post_pages?: number;
}): Promise<PatreonScrapeResultData> {
  return fetchRelayCreatorJson<PatreonScrapeResultData>("/api/v1/patreon/scrape", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/** Short user-facing summary after a live scrape (media path + tier OAuth stats). */
export function formatPatreonSyncResult(data: PatreonScrapeResultData): string {
  const tas = data.tier_access_summary;
  const lines: string[] = [];
  if (data.media_source === "cookie") {
    lines.push("Pulled media via cookie; tiers verified with OAuth.");
  } else {
    lines.push("OAuth-only — post images need a Patreon session cookie (Cookie page).");
  }
  if (tas.oauth_list_posts_updated > 0) {
    lines.push(`OAuth campaign list adjusted tiers on ${tas.oauth_list_posts_updated} post(s).`);
  }
  const written = data.apply_result?.posts_written;
  lines.push(
    written !== undefined
      ? `Ingest wrote ${written} post(s). Batch carried ${data.posts_fetched} post(s), ${data.summary.media_items} media rows.`
      : `Batch: ${data.posts_fetched} post(s), ${data.summary.media_items} media (no ingest result in response).`
  );
  const cookieWarn = data.warnings.find((w) => w.includes("No session cookie"));
  if (cookieWarn && data.media_source === "oauth") {
    lines.push(cookieWarn.length > 140 ? `${cookieWarn.slice(0, 137)}…` : cookieWarn);
  }
  return lines.join(" ");
}
