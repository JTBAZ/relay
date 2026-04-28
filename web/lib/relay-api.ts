import { PATREON_CREATOR_OAUTH_SCOPES } from "./patreon-creator-scopes";
import {
  RelayForbiddenError,
  RelayServerError,
  RelayUnauthorizedError
} from "./relay-fetch-errors";

export { RelayForbiddenError, RelayServerError, RelayUnauthorizedError };

/** No trailing slash — paths like `/api/v1/...` are appended below. */
function resolveRelayApiBase(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_RELAY_API_URL ?? "").trim();
  const raw = fromEnv.length > 0 ? fromEnv : "http://127.0.0.1:8787";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "http://127.0.0.1:8787";
}
export const RELAY_API_BASE = resolveRelayApiBase();

/**
 * Patron feed media: `<video crossOrigin="anonymous" src={RELAY_API_BASE + "/content"}>` may not send
 * the same cookies as `fetch` with `credentials: "include"` in all browsers. If `/content` 403s in
 * prod for `<video>`/`<img>`, add a same-origin proxy route or signed short-lived URLs.
 */
type Envelope<T> = { data: T; meta: { trace_id: string } };

/** Thrown when Relay API returns a non-2xx JSON envelope. */
export class RelayApiError extends Error {
  public override readonly name = "RelayApiError";

  public constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
  }
}

/**
 * Reads the response body and parses JSON. Surfaces HTML (Express 404 pages, proxies) with a clear hint —
 * common when `NEXT_PUBLIC_RELAY_API_URL` points at an old Relay deploy missing `/api/v1/auth/supabase/*`.
 */
export async function parseRelayResponseBody(res: Response, requestPath = ""): Promise<unknown> {
  const text = await res.text();
  const trim = text.trim();
  if (!trim) {
    throw new RelayApiError(
      `Relay API returned an empty body (HTTP ${res.status}). Check NEXT_PUBLIC_RELAY_API_URL.`,
      res.status,
      "EMPTY_BODY"
    );
  }
  if (trim.startsWith("<")) {
    const target = `${RELAY_API_BASE}${requestPath}`;
    throw new RelayApiError(
      `Relay API returned HTML (HTTP ${res.status}) instead of JSON for ${target}. ` +
        `The deployed API is likely outdated (missing POST /api/v1/auth/supabase/sync and related routes). ` +
        `Redeploy the Relay server from this repo, or for local dev set NEXT_PUBLIC_RELAY_API_URL=http://127.0.0.1:8787 and run npm run build && npm start.`,
      res.status,
      "NON_JSON"
    );
  }
  try {
    return JSON.parse(trim) as unknown;
  } catch {
    throw new RelayApiError(
      `Relay API returned invalid JSON (HTTP ${res.status}): ${trim.slice(0, 200)}`,
      res.status,
      "INVALID_JSON"
    );
  }
}

/**
 * Optional Bearer for non-browser callers that pass a token explicitly via `init.headers`.
 * Browser flows rely on HttpOnly `relay_session` + `credentials: "include"` (see GR-T0-1).
 */
export function relayPatronAuthHeaders(): Record<string, string> {
  return {};
}

/** Non-HttpOnly companion cookie set with `relay_session` (GR-T0-1). */
export function hasRelaySignedInCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((p) => p.trim().startsWith("relay_signed_in=1"));
}

function mergeRelayHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  const method = (init?.method ?? "GET").toUpperCase();
  const hasBody = init?.body != null && method !== "GET" && method !== "HEAD";
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function handleRelayHttpErrors(res: Response): Promise<void> {
  if (res.status === 401) {
    const { performRelayLogout } = await import("./relay-session-logout");
    await performRelayLogout();
    if (typeof window !== "undefined") {
      const onLogin =
        window.location.pathname === "/login" ||
        window.location.pathname.startsWith("/login/");
      if (!onLogin) {
        const { resolvePostAuthPath } = await import("./post-login-redirect");
        const here = resolvePostAuthPath(
          window.location.pathname + window.location.search
        );
        const dest = `/login?reason=expired&returnTo=${encodeURIComponent(here)}`;
        window.location.assign(dest);
      }
    }
    throw new RelayUnauthorizedError();
  }
  if (res.status === 403) {
    const raw = await res.text();
    let body: { error?: { message?: string; code?: string } } = {};
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as typeof body;
      } catch {
        /* ignore */
      }
    }
    throw new RelayForbiddenError(
      body.error?.message ?? "You don't have access to this resource.",
      body.error?.code
    );
  }
  if (res.status >= 500) {
    const raw = await res.text();
    let body: { error?: { message?: string; code?: string } } = {};
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as typeof body;
      } catch {
        /* ignore */
      }
    }
    throw new RelayServerError(
      res.status,
      body.error?.message ?? res.statusText,
      body.error?.code
    );
  }
}

/**
 * Low-level Relay API request with shared 401/403/5xx handling.
 * Use for non-JSON bodies (e.g. `HEAD`) — caller reads the returned `Response`.
 */
export async function relayRequest(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${RELAY_API_BASE}${path}`, {
      ...init,
      headers: mergeRelayHeaders(init),
      credentials: "include",
      cache: init?.cache ?? "no-store"
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new RelayApiError(
      msg.includes("fetch") ? "Network error — is the Relay API running?" : msg,
      0,
      "NETWORK"
    );
  }
  await handleRelayHttpErrors(res);
  return res;
}

export async function relayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${RELAY_API_BASE}${path}`, {
      ...init,
      headers: mergeRelayHeaders(init),
      credentials: "include",
      cache: init?.cache ?? "no-store"
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new RelayApiError(
      msg.includes("fetch") ? "Network error — is the Relay API running?" : msg,
      0,
      "NETWORK"
    );
  }

  await handleRelayHttpErrors(res);

  const json = await parseRelayResponseBody(res, path);

  if (!res.ok) {
    const err = json as { error?: { message?: string; code?: string } };
    throw new RelayApiError(
      err.error?.message ?? res.statusText,
      res.status,
      err.error?.code
    );
  }

  const envelope = json as Envelope<T>;
  return envelope.data;
}

/** `GET /api/v1/me/session` — opaque Bearer + optional linked `UserAccount`. */
export type PatronSessionMe = {
  user_id: string;
  creator_id: string;
  email: string | null;
  auth_provider: "independent" | "patreon" | null;
  patreon_user_id: string | null;
  /** When false, session-first `POST .../patron/link` will reject until Supabase email is confirmed (PE-A gate). Omitted on older API builds. */
  email_verified?: boolean;
  expires_at: string;
  /**
   * PE-I (BO-P4-01) — UI lens role from the `relay_active_role` cookie. Never an authz signal.
   * Omitted on older API builds.
   */
  active_role?: ActiveRole | null;
  /**
   * PE-I (BO-P4-01) — roles the account is allowed to occupy (creator / supporter / both).
   * Drives the role switcher visibility: hide when length <= 1. Omitted on older API builds.
   */
  available_roles?: ActiveRole[];
};

export type ActiveRole = "creator" | "supporter";

export function fetchPatronSessionMe(): Promise<PatronSessionMe> {
  return relayFetch<PatronSessionMe>("/api/v1/me/session");
}

// ---------------------------------------------------------------------------
// PE-K Rest (BO-P4-04) — public patron profile lookup for /p/[handle].
// Backend service: src/patron/public-patron-profile-service.ts; route GET /api/v1/public/patrons/:handle.
// ---------------------------------------------------------------------------

export type PublicPatronProfile = {
  handle: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  public_collections: Array<{
    id: string;
    title: string;
    entry_count: number;
    created_at: string;
  }>;
};

/**
 * GET /api/v1/public/patrons/:handle — no auth required.
 *
 * Returns null on 404 (handle missing OR profile is private). Throws on transport / 5xx so
 * Next.js page render code can decide whether to re-throw or call notFound() based on the
 * shape (null vs throw).
 */
export async function fetchPublicPatronProfileByHandle(
  handle: string
): Promise<PublicPatronProfile | null> {
  try {
    return await relayFetch<PublicPatronProfile>(
      `/api/v1/public/patrons/${encodeURIComponent(handle)}`
    );
  } catch (err) {
    if (err instanceof RelayApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// PE-J (BO-P4-03) — Data export + per-creator unwind + account deletion lifecycle.
// Backend: src/patron/{data-export,creator-relationship-delete,account-deletion}-service.ts
// ---------------------------------------------------------------------------

/**
 * Trigger a browser download of the patron data bundle. Returns a `Blob` so callers can
 * decide whether to save-as / display / hash. The backend route bypasses the standard
 * envelope and serves `application/json` with a `Content-Disposition: attachment` header.
 */
export async function downloadPatronAccountExport(): Promise<{
  blob: Blob;
  filename: string;
}> {
  const path = "/api/v1/patron/me/export";
  const res = await fetch(`${RELAY_API_BASE}${path}`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!res.ok) {
    throw new RelayApiError(
      `Account export failed (HTTP ${res.status}).`,
      res.status,
      "EXPORT_FAILED"
    );
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename =
    match?.[1] ?? `relay-account-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = await res.blob();
  return { blob, filename };
}

export type CreatorRelationshipDeletionCounts = {
  favorites: number;
  collections: number;
  collectionEntries: number;
  comments: number;
  commentReactions: number;
  contentReports: number;
  notificationPreferences: number;
  notifications: number;
  memberships: number;
};

/**
 * DELETE /api/v1/patron/memberships/:relay_creator_id — purge ONE creator relationship
 * (favorites, collections, comments, reactions on that creator's posts, reports filed in
 * that scope, notifications, notification prefs, finally the membership row + cascades).
 */
export async function deleteCreatorRelationship(
  relayCreatorId: string
): Promise<{ counts: CreatorRelationshipDeletionCounts }> {
  return relayFetch<{ counts: CreatorRelationshipDeletionCounts }>(
    `/api/v1/patron/memberships/${encodeURIComponent(relayCreatorId)}`,
    { method: "DELETE" }
  );
}

export type PendingDeletion = {
  id: string;
  requested_at: string;
  scheduled_for: string;
  reason: string | null;
};

/** GET /api/v1/patron/me/delete — current pending deletion (or null). */
export async function getPendingPatronAccountDeletion(): Promise<{
  pending_deletion: PendingDeletion | null;
}> {
  return relayFetch<{ pending_deletion: PendingDeletion | null }>(
    `/api/v1/patron/me/delete`
  );
}

/** POST /api/v1/patron/me/delete — schedule a deletion (idempotent). */
export async function requestPatronAccountDeletion(args: { reason?: string } = {}): Promise<{
  created: boolean;
  id: string;
  requested_at: string;
  scheduled_for: string;
  reason: string | null;
}> {
  return relayFetch<{
    created: boolean;
    id: string;
    requested_at: string;
    scheduled_for: string;
    reason: string | null;
  }>(`/api/v1/patron/me/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: args.reason ?? null })
  });
}

/** DELETE /api/v1/patron/me/delete — cancel pending (idempotent). */
export async function cancelPatronAccountDeletion(): Promise<{
  cancelled: boolean;
  id: string | null;
  cancelled_at: string | null;
}> {
  return relayFetch<{
    cancelled: boolean;
    id: string | null;
    cancelled_at: string | null;
  }>(`/api/v1/patron/me/delete`, { method: "DELETE" });
}

/**
 * PE-I (BO-P4-01) — POST /api/v1/me/active-role.
 *
 * Flips the `relay_active_role` UI cookie at runtime. Server validates that the requested
 * role is in the caller's `available_roles`; rejects with 403 otherwise. Returns the
 * persisted state so callers can update local context without a follow-up GET.
 *
 * Recommended caller pattern: after success, push the user to the role's natural landing
 * page (`/designer` for creator, `/patron/feed` for supporter) and re-fetch any
 * shell-scoped session state.
 */
export async function setActiveRole(role: ActiveRole): Promise<{
  active_role: ActiveRole;
  available_roles: ActiveRole[];
}> {
  return relayFetch<{ active_role: ActiveRole; available_roles: ActiveRole[] }>(
    `/api/v1/me/active-role`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    }
  );
}

export type DeletePatronPatreonLinkData = {
  unlinked: boolean;
  patron_oauth_credential_deleted: boolean;
  entitlement_snapshots_invalidated: number;
};

/** `DELETE /api/v1/auth/patreon/patron/link` — drop patron OAuth credential + invalidate entitlement snapshots. */
export function deletePatronPatreonLink(): Promise<DeletePatronPatreonLinkData> {
  return relayFetch<DeletePatronPatreonLinkData>("/api/v1/auth/patreon/patron/link", {
    method: "DELETE"
  });
}

/**
 * `GET /api/v1/me/session` when **401 means "not signed in"** — without the global 401 handler
 * (logout + redirect to `/login`). Use for flows that must branch on session presence.
 *
 * **Patron Patreon (universal policy):** We only link Patreon to an existing Relay account.
 * With a session → `POST .../patron/link`. Without a session → the web callback redirects to
 * sign-in first; we do **not** call `.../patron/exchange` on the default path. Legacy
 * `POST .../patron/exchange` exists for emergency rollback only (`RELAY_PATRON_PATRON_ALLOW_LEGACY_EXCHANGE`).
 */
export async function fetchPatronSessionIfPresent(): Promise<PatronSessionMe | null> {
  const path = "/api/v1/me/session";
  let res: Response;
  try {
    res = await fetch(`${RELAY_API_BASE}${path}`, {
      method: "GET",
      headers: mergeRelayHeaders(),
      credentials: "include",
      cache: "no-store"
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new RelayApiError(
      msg.includes("fetch") ? "Network error — is the Relay API running?" : msg,
      0,
      "NETWORK"
    );
  }

  if (res.status === 401) {
    return null;
  }

  await handleRelayHttpErrors(res);

  const json = await parseRelayResponseBody(res, path);

  if (!res.ok) {
    const err = json as { error?: { message?: string; code?: string } };
    throw new RelayApiError(
      err.error?.message ?? res.statusText,
      res.status,
      err.error?.code
    );
  }

  const envelope = json as Envelope<PatronSessionMe>;
  return envelope.data;
}

/** Browser storage for studio id after `POST /api/v1/creator/workspace` (MT-032 / MT-035). */
export const RELAY_CREATOR_ID_STORAGE_KEY = "relay_creator_id";

/** Browser storage for `/patron/c/{slug}` segment after workspace bootstrap. */
export const RELAY_PUBLIC_SLUG_STORAGE_KEY = "relay_public_slug";

/** True when `state` is the signed value from `POST /api/v1/auth/patreon/creator/prepare` (v1.HMAC). */
export function isPreparedPatreonOAuthState(state: string | null | undefined): boolean {
  return Boolean(state && state.startsWith("1.") && state.split(".").length === 3);
}

export type PatreonCreatorPrepareData = {
  state: string;
  creator_id: string;
  expires_at: string;
};

/** MT-035: signed OAuth `state` — requires Relay session (cookie) + owned `creator_id`. */
export async function postPatreonCreatorPrepare(creatorId: string): Promise<PatreonCreatorPrepareData> {
  return relayFetch<PatreonCreatorPrepareData>("/api/v1/auth/patreon/creator/prepare", {
    method: "POST",
    body: JSON.stringify({ creator_id: creatorId.trim() })
  });
}

export type CreatorWorkspaceData = {
  relay_creator_id: string;
  account_id: string;
  created: boolean;
  public_slug: string;
};

export async function postCreatorWorkspace(): Promise<CreatorWorkspaceData> {
  return relayFetch<CreatorWorkspaceData>("/api/v1/creator/workspace", {
    method: "POST",
    body: JSON.stringify({ confirm_creator_intent: true })
  });
}

export type PublicSlugSourceValue = "allocated" | "patreon_default" | "user_chosen";

export async function fetchCreatorPublicSlug(): Promise<{
  public_slug: string;
  slug_source: PublicSlugSourceValue;
}> {
  return relayFetch<{ public_slug: string; slug_source: PublicSlugSourceValue }>(
    "/api/v1/creator/public-slug"
  );
}

export async function patchCreatorPublicSlug(public_slug: string): Promise<{
  public_slug: string;
  slug_source: PublicSlugSourceValue;
}> {
  return relayFetch<{ public_slug: string; slug_source: PublicSlugSourceValue }>(
    "/api/v1/creator/public-slug",
    {
      method: "PATCH",
      body: JSON.stringify({ public_slug: public_slug.trim().toLowerCase() })
    }
  );
}

// ---------------------------------------------------------------------------
// APD-S1 / APD-S4 — creator public identity (display_name, username, avatar, etc).
// Backend service: src/creator/creator-identity-service.ts.
// ---------------------------------------------------------------------------

export type CreatorProfileIdentity = {
  public_slug: string;
  slug_source: PublicSlugSourceValue;
  patreon_campaign_id: string | null;
  username: string | null;
  username_norm: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  discipline: string | null;
  needs_setup: boolean;
};

export type CreatorProfileIdentityPatch = {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  bio?: string | null;
  discipline?: string | null;
};

export async function getCreatorProfile(): Promise<CreatorProfileIdentity> {
  return relayFetch<CreatorProfileIdentity>("/api/v1/creator/profile");
}

export type CreatorPatronTierSummary = {
  total_patrons: number;
  free_patrons: number;
  tiers: Array<{
    tier_id: string;
    title: string;
    amount_cents: number | null;
    patron_count: number;
  }>;
};

export async function getCreatorPatronTierSummary(): Promise<CreatorPatronTierSummary> {
  return relayFetch<CreatorPatronTierSummary>("/api/v1/creator/patron-tier-summary");
}

export async function patchCreatorProfile(
  patch: CreatorProfileIdentityPatch
): Promise<CreatorProfileIdentity> {
  return relayFetch<CreatorProfileIdentity>("/api/v1/creator/profile", {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export type PublicCreatorResolution = {
  public_slug: string;
  relay_creator_id: string;
};

/** No auth — for public pages and share links. */
export async function fetchPublicCreatorBySlug(
  slug: string
): Promise<PublicCreatorResolution | null> {
  const trimmed = slug.trim();
  if (trimmed.length < 2) {
    return null;
  }
  const path = `/api/v1/public/creators/${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetch(`${RELAY_API_BASE}${path}`, {
      credentials: "include",
      cache: "no-store",
      headers: mergeRelayHeaders()
    });
    await handleRelayHttpErrors(res);
    if (res.status === 404) {
      return null;
    }
    const json = (await parseRelayResponseBody(res, path)) as Envelope<PublicCreatorResolution>;
    return json.data ?? null;
  } catch {
    return null;
  }
}

export function buildPatreonCreatorAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  oauthState: string
): string {
  const u = new URL("https://www.patreon.com/oauth2/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId.trim());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", PATREON_CREATOR_OAUTH_SCOPES);
  u.searchParams.set("state", oauthState);
  return u.toString();
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
  /** Blurred still from API (`/preview`); kept when full export is tier-redacted. */
  preview_url_path: string;
  visibility: PostVisibility;
  collection_ids: string[];
  collection_theme_tag_ids: string[];
  /** Duplicate Patreon cover (same asset as another row); UI may hide by default. */
  shadow_cover?: boolean;
};

/**
 * Visitor / patron gallery list: `redactGalleryItemExportIfLocked` clears `content_url_path` when
 * the session may not view the export; `preview_url_path` stays set for blurred teasers.
 * Use this before showing tier chips on the tile.
 */
export function galleryItemExportVisibleToVisitor(item: GalleryItem): boolean {
  return Boolean(item.has_export && item.content_url_path?.trim());
}

/** Absolute URL for visitor teaser image (tier-gated tiles), or null. */
export function galleryItemPreviewSrc(item: GalleryItem): string | null {
  const p = item.preview_url_path?.trim();
  if (!p) return null;
  return `${RELAY_API_BASE}${p}`;
}

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

/** Public gallery header: Relay display name + Patreon campaign art (from `creator_campaign_display` after sync). */
export type VisitorHeroData = {
  relay_display_name?: string;
  patreon_name?: string;
  banner_url?: string;
  avatar_url?: string;
};

export type FacetsData = {
  tag_ids: string[];
  tier_ids: string[];
  tiers: TierFacet[];
  /** Asset-row counts per tag (same ordering basis as `tag_ids`, which is sorted by frequency desc). */
  tag_counts: Record<string, number>;
  /** Present on creator Library facets only: sum of `byte_length` in export index. */
  export_total_bytes?: number;
  /** Present on creator Library facets only: number of exported media records. */
  export_media_count?: number;
  /** Present when `GET .../facets?visitor=true`: hero imagery and names for the public gallery page. */
  visitor_hero?: VisitorHeroData;
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
  /** PE-D / D29 forensic; never used for gate decisions (see viewer_entitlement). */
  snapshot_tier_ids?: string[];
};

/**
 * PE-D / D29 — viewer-aware render contract returned by GET /favorites + /collections.
 * Always reflects the viewer's CURRENT entitlement (live re-check), not save-time state.
 *
 * - 'visible'    — viewer can fully view (free post or tier match).
 * - 'preview'    — partial reveal allowed (reserved for PE-L).
 * - 'unlockable' — viewer can pay a tip to unlock a viewing window (reserved for PE-L).
 * - 'locked'     — viewer cannot view; show blurred teaser + upgrade CTA.
 */
export type ViewerEntitlementState =
  | "visible"
  | "preview"
  | "unlockable"
  | "locked";

export type ViewerEntitlementDecision = {
  state: ViewerEntitlementState;
  required_tier_ids: string[];
  source:
    | "free_post"
    | "active_snapshot"
    | "missing_snapshot"
    | "inactive_snapshot";
};

export type PatronFavoriteWithViewerEntitlement = PatronFavoriteRecord & {
  viewer_entitlement: ViewerEntitlementDecision;
};

export type PatronFavoritesListData = { items: PatronFavoriteRecord[] };
export type PatronFavoritesEnrichedListData = {
  items: PatronFavoriteWithViewerEntitlement[];
};

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

/**
 * PE-D — cross-creator favorites listing with live viewer_entitlement attached to each row.
 * Backend route: GET /api/v1/patron/favorites/all (account-scoped, no creator_id filter).
 */
export async function listAllPatronFavoritesEnriched(): Promise<
  PatronFavoriteWithViewerEntitlement[]
> {
  const data = await relayFetch<PatronFavoritesEnrichedListData>(
    `/api/v1/patron/favorites/all`
  );
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
  /** PE-D / D11 — when true, exposed on the patron's public profile. */
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
  /** PE-D / D29 forensic; never used for gate decisions. */
  snapshot_tier_ids?: string[];
};

export type PatronCollectionEntryWithViewerEntitlement =
  PatronCollectionEntryRecord & {
    viewer_entitlement: ViewerEntitlementDecision;
  };

export type PatronCollectionWithEntries = PatronCollectionRecord & {
  entries: PatronCollectionEntryRecord[];
};

export type PatronCollectionWithEnrichedEntries = PatronCollectionRecord & {
  entries: PatronCollectionEntryWithViewerEntitlement[];
};

export type PatronCollectionsListData = { collections: PatronCollectionWithEntries[] };
export type PatronCollectionsEnrichedListData = {
  collections: PatronCollectionWithEnrichedEntries[];
};

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

/**
 * PE-D — cross-creator collections listing with live viewer_entitlement attached to each entry.
 * Backend route: GET /api/v1/patron/collections/all (account-scoped, no creator_id filter).
 */
export async function listAllPatronCollectionsEnriched(): Promise<
  PatronCollectionWithEnrichedEntries[]
> {
  const data = await relayFetch<PatronCollectionsEnrichedListData>(
    `/api/v1/patron/collections/all`
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

export type LayoutMode = "grid" | "masonry" | "list" | "featured";

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

export type GalleryArrangement = "chronological" | "tier";

export type PageLayout = {
  creator_id: string;
  theme: {
    color_scheme: "dark" | "light" | "warm";
    accent_color?: string;
    show_bio?: boolean;
    show_tier_badges?: boolean;
    gallery_arrangement?: GalleryArrangement;
    show_patreon_link?: boolean;
    patreon_link_position?: "below_avatar" | "below_bio";
  };
  hero?: {
    title: string;
    subtitle?: string;
    cover_media_id?: string;
    /** false = no hero cover strip (even if Patreon banner exists). Omitted = legacy behavior. */
    show_cover?: boolean;
    bio?: string;
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

/**
 * T-6.2 — Load the creator tier catalog (stable `TierFacet.tier_id` values) for Relay-native compose.
 * These ids are the `tier_ids` array in `POST /api/v1/relay/posts` (Prisma `Tier.id`).
 */
export async function fetchCreatorGalleryFacets(creatorId: string): Promise<FacetsData> {
  return relayFetch<FacetsData>(buildGalleryFacetsQuery(creatorId));
}

// ---------------------------------------------------------------------------
// T-3.2 / T-4.2 / T-6.3 — Relay-native presigned upload + create post
// ---------------------------------------------------------------------------

/** `POST /api/v1/relay/upload/init` — presigned R2 `PUT` (browser uses `putRelayNativeUpload`, not `relayFetch`). */
export type RelayNativeUploadInitData = {
  media_id: string;
  storage_key: string;
  byte_size: number;
  upload: { method: "PUT"; url: string; headers: { "Content-Type": string } };
  expires_in_sec: number;
};

export async function relayNativeUploadInit(args: {
  creator_id: string;
  content_type: string;
  byte_size: number;
  post_id?: string;
}): Promise<RelayNativeUploadInitData> {
  const body: Record<string, unknown> = {
    creator_id: args.creator_id,
    content_type: args.content_type,
    byte_size: args.byte_size
  };
  if (args.post_id) {
    body.post_id = args.post_id;
  }
  return relayFetch<RelayNativeUploadInitData>("/api/v1/relay/upload/init", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/**
 * `PUT` object bytes to the presigned R2 URL. Must not use `relayFetch` (cross-origin, no session cookie on R2).
 * Use the `Content-Type` from `init.upload.headers` (must match the presign).
 */
export async function putRelayNativeUpload(
  presignedUrl: string,
  fileBody: Blob,
  contentType: string
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(presignedUrl, {
      method: "PUT",
      body: fileBody,
      headers: { "Content-Type": contentType }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new RelayApiError(
      `Upload failed (network). If this is a CORS error, add your web origin to the R2 bucket CORS config. ${msg}`,
      0,
      "NETWORK"
    );
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new RelayApiError(
      `Object storage rejected the upload (HTTP ${res.status}). ${t.slice(0, 240)}`,
      res.status,
      "UPLOAD_PUT_FAILED"
    );
  }
}

export type RelayNativeUploadCommitData = {
  media_id: string;
  storage_key: string;
  content_length: number;
  etag: string | null;
};

export async function relayNativeUploadCommit(args: {
  creator_id: string;
  media_id: string;
  content_type: string;
  byte_size: number;
  post_id?: string;
}): Promise<RelayNativeUploadCommitData> {
  const body: Record<string, unknown> = {
    creator_id: args.creator_id,
    media_id: args.media_id,
    content_type: args.content_type,
    byte_size: args.byte_size
  };
  if (args.post_id) {
    body.post_id = args.post_id;
  }
  return relayFetch<RelayNativeUploadCommitData>("/api/v1/relay/upload/commit", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export type RelayNativeCreatePostParams = {
  creator_id: string;
  title: string;
  description?: string | null;
  is_public: boolean;
  required_tier_id?: string | null;
  tier_ids: string[];
  tag_ids?: string[];
  media_ids: string[];
  publish: boolean;
  published_at?: string | null;
  campaign_id?: string | null;
};

export type RelayNativeCreatePostData = {
  post: {
    id: string;
    campaignId: string;
    creatorId: string;
    source: "RELAY";
    isPublic: boolean;
    requiredTierId: string | null;
  };
  /** API uses snake_case on `version` (see `src/server.ts` relay/posts handler). */
  version: {
    id: string;
    version_seq: number;
    upstream_revision: string;
    title: string;
    description: string | null;
    published_at: string;
    tag_ids: string[];
    tier_ids: string[];
    media_ids: string[];
  };
};

export async function relayNativeCreatePost(
  params: RelayNativeCreatePostParams
): Promise<RelayNativeCreatePostData> {
  const body: Record<string, unknown> = {
    creator_id: params.creator_id,
    title: params.title,
    description: params.description ?? null,
    is_public: params.is_public,
    required_tier_id: params.required_tier_id ?? null,
    tier_ids: params.tier_ids,
    tag_ids: params.tag_ids ?? [],
    media_ids: params.media_ids,
    publish: params.publish
  };
  if (params.published_at) {
    body.published_at = params.published_at;
  }
  if (params.campaign_id) {
    body.campaign_id = params.campaign_id;
  }
  return relayFetch<RelayNativeCreatePostData>("/api/v1/relay/posts", {
    method: "POST",
    body: JSON.stringify(body)
  });
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

export type WebhookRegistrationSummaryData = {
  registration_status: "ok" | "failed" | "skipped_no_public_url";
  uri_registered?: string;
  triggers?: string[];
  last_registration_error?: string;
  updated_at?: string;
};

export type PatreonSyncStateData = {
  creator_id: string;
  patreon_campaign_id: string;
  watermark_published_at: string | null;
  watermark_updated_at: string | null;
  has_cookie_session: boolean;
  cookie_session_status?: "ok" | "expired_local" | "rejected_remote";
  upstream_newest_published_at?: string | null;
  likely_has_newer_posts?: boolean;
  oauth: PatreonOAuthHealthData;
  last_post_scrape: LastPostScrapeHealthData | null;
  last_member_sync: LastMemberSyncHealthData | null;
  campaign_display: CampaignDisplayData | null;
  /** Patreon platform webhook registration (member/post delivery). */
  webhook_registration?: WebhookRegistrationSummaryData | null;
  /** From Relay API env: public webhook base URL configured (RELAY_PUBLIC_WEBHOOK_BASE_URL). */
  public_webhook_base_configured?: boolean;
};

/** True when the Library should show a sync-issue pill without opening the menu. */
export function syncStateNeedsAttention(s: PatreonSyncStateData): boolean {
  if (s.oauth.credential_health_status === "refresh_failed") return true;
  if (s.oauth.access_token_expired) return true;
  if (s.cookie_session_status === "expired_local") return true;
  if (s.cookie_session_status === "rejected_remote") return true;
  if (s.last_post_scrape && !s.last_post_scrape.ok) return true;
  if (s.last_member_sync && !s.last_member_sync.ok) return true;
  if (s.webhook_registration?.registration_status === "failed") return true;
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
  if (s.cookie_session_status === "rejected_remote") {
    return "Patreon session key was rejected — re-enter it on Creator Connect.";
  }
  if (s.cookie_session_status === "expired_local") {
    return "Patreon session key expired — re-enter it on Creator Connect.";
  }
  if (s.last_post_scrape && !s.last_post_scrape.ok && s.last_post_scrape.error?.hint) {
    return s.last_post_scrape.error.hint;
  }
  if (s.last_member_sync && !s.last_member_sync.ok && s.last_member_sync.error?.hint) {
    return `Member sync: ${s.last_member_sync.error.hint}`;
  }
  if (s.webhook_registration?.registration_status === "failed" && s.webhook_registration.last_registration_error) {
    return `Patreon webhook registration failed: ${s.webhook_registration.last_registration_error}`;
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
  return relayFetch<PatreonSyncStateData>(`/api/v1/patreon/sync-state?${q}`);
}

export async function postPatreonScrape(body: {
  creator_id: string;
  campaign_id?: string;
  dry_run?: boolean;
  force_refresh_post_access?: boolean;
  max_post_pages?: number;
}): Promise<PatreonScrapeResultData> {
  return relayFetch<PatreonScrapeResultData>("/api/v1/patreon/scrape", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/** POST /api/v1/patreon/webhooks/register — requires Bearer session + creator scope. */
export type RegisterPatreonWebhooksData = {
  creator_id: string;
  webhook_id: string;
  uri: string;
};

export async function registerPatreonWebhooks(
  creatorId: string
): Promise<RegisterPatreonWebhooksData> {
  return relayFetch<RegisterPatreonWebhooksData>("/api/v1/patreon/webhooks/register", {
    method: "POST",
    body: JSON.stringify({ creator_id: creatorId.trim() })
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

/** Workstream E — Action Center recommendation cards */
export type ActionCenterCard = {
  recommendation_id: string;
  creator_id: string;
  card_type: string;
  title: string;
  signal: string;
  diagnosis: string;
  recommendation: string;
  confidence_score: number;
  expected_impact: { metric: string; delta_range: [number, number]; horizon_days: number };
  reason_codes: string[];
  evidence_refs: string[];
  status: string;
  created_at: string;
  updated_at: string;
  notes?: string;
};

export type ActionCenterCardsData = {
  items: ActionCenterCard[];
  next_cursor: string | null;
};

export async function fetchActionCenterCards(creatorId: string): Promise<ActionCenterCardsData> {
  const q = new URLSearchParams({ creator_id: creatorId });
  return relayFetch<ActionCenterCardsData>(`/api/v1/action-center/cards?${q.toString()}`);
}

export async function postAnalyticsGenerate(creatorId: string): Promise<{
  snapshot_id: string;
  recommendations_created: number;
}> {
  return relayFetch<{ snapshot_id: string; recommendations_created: number }>(
    `/api/v1/analytics/generate`,
    {
      method: "POST",
      body: JSON.stringify({ creator_id: creatorId })
    }
  );
}

export async function postActionCenterAccept(
  creatorId: string,
  recommendationId: string,
  notes?: string
): Promise<{ recommendation_id: string; status: string }> {
  return relayFetch<{ recommendation_id: string; status: string }>(
    `/api/v1/action-center/cards/${encodeURIComponent(recommendationId)}/accept`,
    {
      method: "POST",
      body: JSON.stringify({ creator_id: creatorId, notes })
    }
  );
}

export async function postActionCenterDismiss(
  creatorId: string,
  recommendationId: string,
  reasonCode?: string
): Promise<{ recommendation_id: string; status: string }> {
  return relayFetch<{ recommendation_id: string; status: string }>(
    `/api/v1/action-center/cards/${encodeURIComponent(recommendationId)}/dismiss`,
    {
      method: "POST",
      body: JSON.stringify({
        creator_id: creatorId,
        reason_code: reasonCode ?? "dismissed_from_ui"
      })
    }
  );
}

export type AnalyticsHealthData = {
  status: "ok" | "degraded";
  metrics: {
    generate_attempts: number;
    generate_successes: number;
    generate_failures: number;
    success_ratio: number | null;
    failure_ratio: number | null;
  };
  alerts: string[];
  documentation: string[];
};

export async function fetchAnalyticsHealth(): Promise<AnalyticsHealthData> {
  return relayFetch<AnalyticsHealthData>("/api/v1/health/analytics");
}

// ---------------------------------------------------------------------------
// PE-E (BO-P2-04) — Comments + reactions + reports + blocks API client.
// Backend services in src/patron/comment-*.ts; routes in src/server.ts.
// ---------------------------------------------------------------------------

export type CommentReactionKind = "like" | "heart" | "insightful" | "laugh";
export type CommentVisibility = "everyone" | "patrons_only";
export type CommentModState = "visible" | "hidden" | "removed";
export type ContentReportTargetKind = "comment" | "post" | "account";
export type ContentReportStatus = "open" | "actioned" | "dismissed";
export type AutoModSeverity = "info" | "warn" | "block";

export type AutoModFlag = {
  rule_id: string;
  severity: AutoModSeverity;
  snippet: string;
  meta?: Record<string, string | number | boolean>;
};

export type CommentReactionAggregate = {
  kind: CommentReactionKind;
  count: number;
  /** Whether the calling viewer has this reaction toggled on. */
  viewerReacted: boolean;
};

/**
 * Live shape returned by GET /api/v1/patron/posts/:post_id/comments. Mirrors
 * `CommentRecord` in src/patron/comment-types.ts plus a `reactions` aggregate the
 * server attaches at list time.
 */
export type PatronCommentRecord = {
  id: string;
  relayCreatorId: string;
  postId: string;
  mediaId: string | null;
  /** 0-100 percentage; null when post-level. */
  anchorX: number | null;
  anchorY: number | null;
  patronUserId: string;
  body: string;
  parentCommentId: string | null;
  tagIds: string[];
  /** Subset of tagIds the post owner has revoked from this specific comment. */
  tagsRevokedByOwner: string[];
  creatorPinnedAt: string | null;
  requiredTierId: string | null;
  visibility: CommentVisibility;
  autoModFlagsJson: AutoModFlag[] | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  modState: CommentModState;
  reactions: CommentReactionAggregate[];
};

export type CreateCommentInput = {
  relayCreatorId: string;
  postId: string;
  body: string;
  mediaId?: string | null;
  /** Required when mediaId is set; 0-100 percentage. */
  anchorX?: number | null;
  anchorY?: number | null;
  parentCommentId?: string | null;
  tagIds?: string[];
  requiredTierId?: string | null;
  visibility?: CommentVisibility;
};

export type CreateCommentResult = {
  item: PatronCommentRecord;
  /** Server-side auto-mod hits at create time. UI surfaces these to the author. */
  auto_mod_flags: AutoModFlag[];
};

export type PatchCommentInput = {
  /** Author edit (within 15-min window): body and/or tag_ids. */
  body?: string;
  tagIds?: string[];
  /** Creator pin/unpin (creator session only). */
  creatorPinned?: boolean;
  /** Creator hide/unhide/remove (creator session only). */
  modState?: CommentModState;
};

/** GET /api/v1/patron/posts/:post_id/comments?creator_id=...&media_id=... */
export async function listPostComments(args: {
  relayCreatorId: string;
  postId: string;
  mediaId?: string;
}): Promise<PatronCommentRecord[]> {
  const params = new URLSearchParams({ creator_id: args.relayCreatorId });
  if (args.mediaId) params.set("media_id", args.mediaId);
  const data = await relayFetch<{ items: PatronCommentRecord[] }>(
    `/api/v1/patron/posts/${encodeURIComponent(args.postId)}/comments?${params.toString()}`
  );
  return data.items;
}

/** POST /api/v1/patron/posts/:post_id/comments */
export async function createComment(input: CreateCommentInput): Promise<CreateCommentResult> {
  return relayFetch<CreateCommentResult>(
    `/api/v1/patron/posts/${encodeURIComponent(input.postId)}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creator_id: input.relayCreatorId,
        body: input.body,
        media_id: input.mediaId ?? null,
        anchor_x: input.anchorX ?? null,
        anchor_y: input.anchorY ?? null,
        parent_comment_id: input.parentCommentId ?? null,
        tag_ids: input.tagIds ?? [],
        required_tier_id: input.requiredTierId ?? null,
        visibility: input.visibility ?? "everyone"
      })
    }
  );
}

/**
 * PATCH /api/v1/patron/comments/:comment_id
 *
 * Routes either to the author-edit path (body / tag_ids) or the creator path
 * (creator_pinned, mod_state). Server enforces ownership + 15-min edit window.
 */
export async function patchComment(
  commentId: string,
  patch: PatchCommentInput
): Promise<PatronCommentRecord> {
  const body: Record<string, unknown> = {};
  if (patch.body !== undefined) body.body = patch.body;
  if (patch.tagIds !== undefined) body.tag_ids = patch.tagIds;
  if (patch.creatorPinned !== undefined) body.creator_pinned = patch.creatorPinned;
  if (patch.modState !== undefined) body.mod_state = patch.modState;
  const data = await relayFetch<{ item: PatronCommentRecord }>(
    `/api/v1/patron/comments/${encodeURIComponent(commentId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  return data.item;
}

/** DELETE /api/v1/patron/comments/:comment_id (author or creator). */
export async function deleteComment(commentId: string): Promise<PatronCommentRecord> {
  const data = await relayFetch<{ item: PatronCommentRecord }>(
    `/api/v1/patron/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" }
  );
  return data.item;
}

/** POST /api/v1/patron/comments/:comment_id/reactions — toggles, returns active state. */
export async function toggleCommentReaction(
  commentId: string,
  kind: CommentReactionKind
): Promise<{ active: boolean }> {
  return relayFetch<{ active: boolean }>(
    `/api/v1/patron/comments/${encodeURIComponent(commentId)}/reactions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind })
    }
  );
}

/** POST /api/v1/patron/comments/:comment_id/revoke-tag (creator-only; supports unrevoke). */
export async function revokeCommentTag(
  commentId: string,
  tagId: string,
  options?: { unrevoke?: boolean }
): Promise<{ tag_id: string; unrevoked: boolean }> {
  return relayFetch<{ tag_id: string; unrevoked: boolean }>(
    `/api/v1/patron/comments/${encodeURIComponent(commentId)}/revoke-tag`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_id: tagId, unrevoke: options?.unrevoke === true })
    }
  );
}

export type CreateContentReportInput = {
  targetKind: ContentReportTargetKind;
  targetId: string;
  reasonCode: string;
  body?: string | null;
  /** Creator scope; usually inferred from the target context. Empty for platform-wide. */
  relayCreatorId?: string;
};

/** POST /api/v1/patron/reports */
export async function createContentReport(
  input: CreateContentReportInput
): Promise<{ id: string }> {
  return relayFetch<{ id: string }>(`/api/v1/patron/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_kind: input.targetKind,
      target_id: input.targetId,
      reason_code: input.reasonCode,
      body: input.body ?? null,
      relay_creator_id: input.relayCreatorId ?? ""
    })
  });
}

export type ContentReportRecord = {
  id: string;
  reporterAccountId: string;
  targetKind: ContentReportTargetKind;
  targetId: string;
  reasonCode: string;
  body: string | null;
  status: ContentReportStatus;
  createdAt: string;
};

/** GET /api/v1/creator/moderation/reports — owner-only. */
export async function listContentReports(args: {
  relayCreatorId: string;
  status?: ContentReportStatus;
  cursor?: string;
}): Promise<{ items: ContentReportRecord[]; nextCursor?: string }> {
  const params = new URLSearchParams({ relay_creator_id: args.relayCreatorId });
  if (args.status) params.set("status", args.status);
  if (args.cursor) params.set("cursor", args.cursor);
  return relayFetch<{ items: ContentReportRecord[]; nextCursor?: string }>(
    `/api/v1/creator/moderation/reports?${params.toString()}`
  );
}

/** POST /api/v1/creator/moderation/reports/:report_id/resolve — owner-only. */
export async function resolveContentReport(
  reportId: string,
  outcome: "actioned" | "dismissed"
): Promise<{ resolved: boolean; outcome: "actioned" | "dismissed" }> {
  return relayFetch<{ resolved: boolean; outcome: "actioned" | "dismissed" }>(
    `/api/v1/creator/moderation/reports/${encodeURIComponent(reportId)}/resolve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome })
    }
  );
}

/** POST /api/v1/patron/blocks — D14 future-only semantics. */
export async function blockAccount(
  blockedAccountId: string
): Promise<{ created: boolean }> {
  return relayFetch<{ created: boolean }>(`/api/v1/patron/blocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocked_account_id: blockedAccountId })
  });
}

/** DELETE /api/v1/patron/blocks/:account_id */
export async function unblockAccount(
  blockedAccountId: string
): Promise<{ removed: boolean }> {
  return relayFetch<{ removed: boolean }>(
    `/api/v1/patron/blocks/${encodeURIComponent(blockedAccountId)}`,
    { method: "DELETE" }
  );
}

// ---------------------------------------------------------------------------
// PE-F (BO-P3-02) — Discovery v1 API client.
// Backend service: src/patron/discover-service.ts; routes in src/server.ts.
// ---------------------------------------------------------------------------

/**
 * Mirror of `DiscoverItem` from src/patron/discover-service.ts. The wire format is the same
 * shape; we keep field names snake_case to match the envelope rather than renaming on the
 * client.
 */
export type DiscoverItem = {
  creator_id: string;
  post_id: string;
  title: string;
  description?: string;
  published_at: string;
  tag_ids: string[];
  cover_media_id?: string;
};

export type DiscoverPageResult = {
  items: DiscoverItem[];
  next_cursor: string | null;
};

/**
 * GET /api/v1/patron/discover — recency-DESC cross-creator feed of opted-in free posts.
 *
 * - `q` is a free-text query (AND tokens; reuses the canonical search kernel server-side).
 * - `cursor` is the opaque token returned in the previous page's `next_cursor`.
 * - `limit` is clamped server-side; safe to omit and accept the default.
 * - `creatorCap` overrides the per-creator fairness cap (default 2). Useful for design states.
 */
export async function listDiscoverFeed(args: {
  q?: string;
  cursor?: string;
  limit?: number;
  creatorCap?: number;
} = {}): Promise<DiscoverPageResult> {
  const params = new URLSearchParams();
  if (args.q) params.set("q", args.q);
  if (args.cursor) params.set("cursor", args.cursor);
  if (typeof args.limit === "number") params.set("limit", String(args.limit));
  if (typeof args.creatorCap === "number") params.set("creator_cap", String(args.creatorCap));
  const query = params.toString();
  return relayFetch<DiscoverPageResult>(
    `/api/v1/patron/discover${query ? `?${query}` : ""}`
  );
}

/**
 * PATCH /api/v1/gallery/posts/:post_id/discovery — owner-only opt-in/out for Discover.
 * The server returns a `warning` string when toggling on a tier-gated post (no v1 effect).
 */
export async function setPostDiscoveryEligibility(args: {
  postId: string;
  creatorId: string;
  eligible: boolean;
}): Promise<{
  creator_id: string;
  post_id: string;
  eligible: boolean;
  warning: string | null;
}> {
  return relayFetch<{
    creator_id: string;
    post_id: string;
    eligible: boolean;
    warning: string | null;
  }>(`/api/v1/gallery/posts/${encodeURIComponent(args.postId)}/discovery`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creator_id: args.creatorId, eligible: args.eligible })
  });
}

// ---------------------------------------------------------------------------
// PE-G (BO-P3-04) — Notifications + preferences API client.
// Backend: src/patron/notification-* + routes in src/server.ts.
// ---------------------------------------------------------------------------

export type NotificationKind =
  | "comment_replied"
  | "comment_liked"
  | "new_follower"
  | "tier_changed"
  | "new_post_followed"
  | "mention";

export type NotificationRecord = {
  id: string;
  recipientMembershipId: string;
  relayCreatorId: string;
  kind: NotificationKind;
  /** Kind-shaped; see backend mapper for canonical fields per kind. */
  payload: Record<string, unknown>;
  clusterKey: string | null;
  clusterCount: number;
  sourceEventId: string | null;
  /** ISO string when read; null = unread. */
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationsListResult = {
  items: NotificationRecord[];
  nextCursor: string | null;
};

/** GET /api/v1/patron/notifications */
export async function listPatronNotifications(args: {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
  /** Optional creator-scope filter; matches the row's relayCreatorId exactly. */
  relayCreatorId?: string;
} = {}): Promise<NotificationsListResult> {
  const params = new URLSearchParams();
  if (args.unreadOnly) params.set("unread_only", "true");
  if (typeof args.limit === "number") params.set("limit", String(args.limit));
  if (args.cursor) params.set("cursor", args.cursor);
  if (args.relayCreatorId !== undefined) {
    params.set("relay_creator_id", args.relayCreatorId);
  }
  const query = params.toString();
  return relayFetch<NotificationsListResult>(
    `/api/v1/patron/notifications${query ? `?${query}` : ""}`
  );
}

/** GET /api/v1/patron/notifications/unread-count */
export async function getPatronNotificationUnreadCount(): Promise<{ unread_count: number }> {
  return relayFetch<{ unread_count: number }>(
    `/api/v1/patron/notifications/unread-count`
  );
}

/**
 * POST /api/v1/patron/notifications/mark-read
 *
 * Two modes:
 *   - { notificationIds: [...] } -> mark only those (MUST belong to the caller)
 *   - { allUnread: true }        -> mark every unread row for the caller
 */
export async function markPatronNotificationsRead(args: {
  notificationIds?: string[];
  allUnread?: boolean;
}): Promise<{ updatedCount: number }> {
  return relayFetch<{ updatedCount: number }>(
    `/api/v1/patron/notifications/mark-read`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notification_ids: args.notificationIds ?? [],
        all_unread: args.allUnread === true
      })
    }
  );
}

export type NotificationPreferenceRecord = {
  preferenceType: string;
  relayCreatorId: string;
  enabled: boolean;
  updatedAt: string | null;
};

/** GET /api/v1/patron/notifications/preferences */
export async function listPatronNotificationPreferences(args: {
  relayCreatorId?: string;
} = {}): Promise<{ items: NotificationPreferenceRecord[] }> {
  const params = new URLSearchParams();
  if (args.relayCreatorId !== undefined) {
    params.set("relay_creator_id", args.relayCreatorId);
  }
  const query = params.toString();
  return relayFetch<{ items: NotificationPreferenceRecord[] }>(
    `/api/v1/patron/notifications/preferences${query ? `?${query}` : ""}`
  );
}

/** PATCH /api/v1/patron/notifications/preferences */
export async function setPatronNotificationPreference(args: {
  relayCreatorId: string;
  preferenceType: string;
  enabled: boolean;
}): Promise<NotificationPreferenceRecord> {
  return relayFetch<NotificationPreferenceRecord>(
    `/api/v1/patron/notifications/preferences`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relay_creator_id: args.relayCreatorId,
        preference_type: args.preferenceType,
        enabled: args.enabled
      })
    }
  );
}
