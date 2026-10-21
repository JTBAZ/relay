/**
 * @fileoverview Patreon OAuth2 v2 REST helpers: campaigns, posts paging, members paging, and JSON:API helpers.
 * @description Bounded OAuth requests via injected `fetch`; errors exclude provider bodies.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Ingest outcomes land in `Post`, `Tier`, `Campaign`, membership tables via sync — not in this module
 */
import type { JsonApiDocument, JsonApiResource } from "./jsonapi-types.js";
import { patreonOAuthRequest, PatreonRequestError } from "./oauth-request.js";

const API_ROOT = "https://www.patreon.com/api/oauth2/v2";

/** Bearer token + fetch implementation (testable / worker injectable). */
export type PatreonFetchOptions = {
  access_token: string;
  fetch_impl: typeof fetch;
};

async function patreonGet(
  url: string,
  opts: PatreonFetchOptions
): Promise<JsonApiDocument> {
  const doc = await patreonOAuthRequest(url, {
    headers: {
      authorization: `Bearer ${opts.access_token}`,
      "user-agent": "Relay - Patreon Sync"
    }
  }, opts.fetch_impl);
  const resource = (value: unknown): boolean => Boolean(value && typeof value === "object" &&
    "type" in value && typeof value.type === "string" && "id" in value && typeof value.id === "string" && value.id.trim());
  if (!doc || typeof doc !== "object" || !("data" in doc) ||
    (doc.data !== null && !(Array.isArray(doc.data) ? doc.data.every(resource) : resource(doc.data)))) {
    throw new PatreonRequestError("Patreon returned an invalid resource document.", true);
  }
  return doc as JsonApiDocument;
}

// Post v2 has no documented edited_at; content/access revisioning is local.
const POST_FIELDS = "title,content,published_at,is_public,is_paid,tiers,embed_url,embed_data";

function pagedUrl(path: string, nextFullUrl?: string | null): URL {
  const base = new URL(`${API_ROOT}${path}`);
  const url = nextFullUrl ? new URL(nextFullUrl) : base;
  if (url.origin !== base.origin || url.pathname !== base.pathname || url.username || url.password || url.hash) {
    throw new Error("Invalid Patreon pagination destination.");
  }
  return url;
}

/**
 * List campaigns owned by the token grant, including tier includes.
 * @async
 * @throws {Error} Patreon HTTP failures and JSON parse errors.
 */
export async function fetchCampaignsWithTiers(
  opts: PatreonFetchOptions
): Promise<JsonApiDocument> {
  const params = new URLSearchParams();
  params.set("include", "tiers");
  params.set(
    "fields[campaign]",
    "created_at,name,published_at,vanity,summary,creation_name,image_url,image_small_url,patron_count"
  );
  // PE-C P1 — `amount_cents` is required for `paidUserTierIds` / `tierFloorCents` /
  // `expandAllPatronsTierIds`. Without it the patron-feed gate cannot distinguish Free Tier
  // members from paying patrons, and `relay_tier_all_patrons` posts can never expand to
  // the explicit paid-tier list. Patreon docs list the field on Tier v2; matches the patron
  // `/v2/identity` request (`patreon-user-identity.ts`) for consistency.
  params.set("fields[tier]", "title,amount_cents,created_at,edited_at,published");
  const url = `${API_ROOT}/campaigns?${params.toString()}`;
  return patreonGet(url, opts);
}

/**
 * Builds absolute URL for one page of posts (or follows `links.next` when provided).
 * @param campaignId Patreon campaign id.
 * @param nextFullUrl Patreon-returned full next URL or null for first page.
 */
export function postsPageUrl(campaignId: string, nextFullUrl?: string | null): string {
  const url = pagedUrl(`/campaigns/${encodeURIComponent(campaignId)}/posts`, nextFullUrl);
  const params = url.searchParams;
  params.set("page[count]", "25");
  params.set("include", "campaign");
  // OAuth v2: body, embeds and access for enrichment. Rich images/attachments come from
  // the cookie session path (`cookie-scraper.ts` → www `/api/posts`), not this endpoint.
  params.set("fields[post]", POST_FIELDS);
  return url.toString();
}

/**
 * Fetches one posts page JSON:API document.
 * @async
 * @throws {Error} Patreon HTTP / parse failures.
 */
export async function fetchPostsPage(
  opts: PatreonFetchOptions,
  campaignId: string,
  nextUrl?: string | null
): Promise<JsonApiDocument> {
  return patreonGet(postsPageUrl(campaignId, nextUrl), opts);
}

/**
 * Single-post URL (`GET` via {@link fetchPostById}).
 * Patreon’s www cookie `/api/posts` often returns `attributes.content: null`; the creator access token usually still receives HTML here.
 */
export function singlePostUrl(postId: string): string {
  const url = new URL(`${API_ROOT}/posts/${encodeURIComponent(postId)}`);
  url.searchParams.set("fields[post]", POST_FIELDS);
  url.searchParams.set("include", "campaign");
  return url.toString();
}

/**
 * Fetch one post by id with creator token.
 * @async
 * @throws {Error} Patreon HTTP / parse failures.
 */
export async function fetchPostById(
  opts: PatreonFetchOptions,
  postId: string
): Promise<JsonApiDocument> {
  return patreonGet(singlePostUrl(postId), opts);
}

/**
 * Members list URL for a campaign (first page or `links.next`).
 * Requires creator scopes `campaigns.members`; add `campaigns.members[email]` when
 * `fields[member]` includes `email` (see `PATREON_CREATOR_OAUTH_SCOPES`).
 * @security-audit-required Member payloads may include PII (`email`, `full_name`) — do not log raw documents.
 */
export function membersPageUrl(campaignId: string, nextFullUrl?: string | null): string {
  const url = pagedUrl(`/campaigns/${encodeURIComponent(campaignId)}/members`, nextFullUrl);
  const params = url.searchParams;
  params.set("page[count]", "25");
  params.set("include", "campaign");
  params.set("include", "campaign,currently_entitled_tiers,user");
  params.set(
    "fields[member]",
    "patron_status,currently_entitled_amount_cents,pledge_relationship_start"
  );
  // PE-C P1 — see `fetchCampaignsWithTiers` for rationale.
  params.set("fields[tier]", "title,amount_cents,created_at,edited_at,published");
  return url.toString();
}

export function singleMemberUrl(memberId: string): string {
  const url = new URL(`${API_ROOT}/members/${encodeURIComponent(memberId)}`);
  url.searchParams.set("include", "campaign,currently_entitled_tiers,user");
  url.searchParams.set("fields[member]", "patron_status,currently_entitled_amount_cents,pledge_relationship_start");
  return url.toString();
}

export async function fetchMemberById(opts: PatreonFetchOptions, memberId: string): Promise<JsonApiDocument> {
  return patreonGet(singleMemberUrl(memberId), opts);
}

/**
 * One page of campaign members.
 * @async
 * @throws {Error} Patreon HTTP / parse failures.
 */
export async function fetchCampaignMembers(
  opts: PatreonFetchOptions,
  campaignId: string,
  nextUrl?: string | null
): Promise<JsonApiDocument> {
  return patreonGet(membersPageUrl(campaignId, nextUrl), opts);
}

/**
 * Indexes `included[]` by `type:id` for relationship walks.
 * @param doc Patreon JSON:API document.
 */
export function indexIncluded(doc: JsonApiDocument): Map<string, JsonApiResource> {
  const map = new Map<string, JsonApiResource>();
  for (const r of doc.included ?? []) {
    map.set(`${r.type}:${r.id}`, r);
  }
  return map;
}

/**
 * Normalizes `data` to a resource array (empty when null/undefined).
 * @param data JSON:API `data` field.
 */
export function asDataArray(data: JsonApiDocument["data"]): JsonApiResource[] {
  if (data === null || data === undefined) return [];
  return Array.isArray(data) ? data : [data];
}
