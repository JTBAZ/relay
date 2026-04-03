import type { JsonApiDocument, JsonApiResource } from "./jsonapi-types.js";

const API_ROOT = "https://www.patreon.com/api/oauth2/v2";

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

/** List campaigns owned by the token user, including tier objects. */
export async function fetchCampaignsWithTiers(
  opts: PatreonFetchOptions
): Promise<JsonApiDocument> {
  const params = new URLSearchParams();
  params.set("include", "tiers");
  params.set(
    "fields[campaign]",
    "created_at,name,published_at,vanity,summary,creation_name,image_url,image_small_url,patron_count"
  );
  params.set("fields[tier]", "title,created_at,edited_at,published");
  const url = `${API_ROOT}/campaigns?${params.toString()}`;
  return patreonGet(url, opts);
}

/** One page of posts for a campaign (`links.next` for pagination). */
export function postsPageUrl(campaignId: string, nextFullUrl?: string | null): string {
  if (nextFullUrl) return nextFullUrl;
  const params = new URLSearchParams();
  params.set("page[count]", "25");
  params.set(
    "fields[post]",
    "title,content,published_at,is_public,is_paid,tiers"
  );
  return `${API_ROOT}/campaigns/${encodeURIComponent(campaignId)}/posts?${params.toString()}`;
}

export async function fetchPostsPage(
  opts: PatreonFetchOptions,
  campaignId: string,
  nextUrl?: string | null
): Promise<JsonApiDocument> {
  return patreonGet(postsPageUrl(campaignId, nextUrl), opts);
}

/**
 * Single post (OAuth2 v2). Patreon’s www cookie `/api/posts` often returns
 * `attributes.content: null`; the creator access token usually still receives HTML here.
 */
export function singlePostUrl(postId: string): string {
  return `${API_ROOT}/posts/${encodeURIComponent(postId)}`;
}

export async function fetchPostById(
  opts: PatreonFetchOptions,
  postId: string
): Promise<JsonApiDocument> {
  return patreonGet(singlePostUrl(postId), opts);
}

/** One page of members for a campaign (scope: campaigns.members). */
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
  params.set("fields[tier]", "title,created_at,edited_at,published");
  params.set("fields[user]", "full_name,vanity,url");
  return `${API_ROOT}/campaigns/${encodeURIComponent(campaignId)}/members?${params.toString()}`;
}

export async function fetchCampaignMembers(
  opts: PatreonFetchOptions,
  campaignId: string,
  nextUrl?: string | null
): Promise<JsonApiDocument> {
  return patreonGet(membersPageUrl(campaignId, nextUrl), opts);
}

export function indexIncluded(doc: JsonApiDocument): Map<string, JsonApiResource> {
  const map = new Map<string, JsonApiResource>();
  for (const r of doc.included ?? []) {
    map.set(`${r.type}:${r.id}`, r);
  }
  return map;
}

export function asDataArray(data: JsonApiDocument["data"]): JsonApiResource[] {
  if (data === null || data === undefined) return [];
  return Array.isArray(data) ? data : [data];
}
