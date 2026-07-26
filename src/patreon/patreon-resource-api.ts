/**
 * @fileoverview Patreon OAuth2 v2 REST helpers: campaigns, posts paging, members paging, and JSON:API helpers.
 * @description All network I/O uses injected `fetch`; throws on non-2xx with truncated body text.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Ingest outcomes land in `Post`, `Tier`, `Campaign`, membership tables via sync — not in this module
 */
import type { JsonApiDocument, JsonApiResource } from "./jsonapi-types.js";

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
  const res = await opts.fetch_impl(url, {
    headers: {
      authorization: `Bearer ${opts.access_token}`
    }
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Patreon API ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as JsonApiDocument;
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
  if (nextFullUrl) return nextFullUrl;
  const params = new URLSearchParams();
  params.set("page[count]", "25");
  // OAuth v2: metadata + tier/access for enrichment. Post media (images/attachments) comes from
  // the cookie session path (`cookie-scraper.ts` → www `/api/posts`), not this endpoint.
  params.set("fields[post]", "title,content,published_at,is_public,is_paid,tiers");
  return `${API_ROOT}/campaigns/${encodeURIComponent(campaignId)}/posts?${params.toString()}`;
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
  return `${API_ROOT}/posts/${encodeURIComponent(postId)}`;
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
  if (nextFullUrl) return nextFullUrl;
  const params = new URLSearchParams();
  params.set("page[count]", "25");
  params.set("include", "currently_entitled_tiers,user");
  params.set(
    "fields[member]",
    "full_name,email,patron_status,currently_entitled_amount_cents," +
      "lifetime_support_cents,pledge_relationship_start"
  );
  // PE-C P1 — see `fetchCampaignsWithTiers` for rationale.
  params.set("fields[tier]", "title,amount_cents,created_at,edited_at,published");
  params.set("fields[user]", "full_name,vanity,url");
  return `${API_ROOT}/campaigns/${encodeURIComponent(campaignId)}/members?${params.toString()}`;
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
