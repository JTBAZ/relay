/**
 * Patreon OAuth **patron** (resource owner) identity — request/response shape for site handshake.
 *
 * Call with the **user** access_token (Authorization: Bearer …), not the creator token.
 * Official reference: https://docs.patreon.com/#get-api-oauth2-v2-identity
 *
 * v2 requires explicit `fields[...]` for attributes you want; omitting them returns sparse objects.
 *
 * ## Scopes (typical)
 * - `identity` — user profile fields on `data` (User).
 * - `identity[email]` — user `email` (must be listed in `fields[user]`).
 * - Without `identity.memberships`, `include=memberships` still returns membership to **your** (client creator’s) campaign.
 * - With `identity.memberships` — memberships across **all** campaigns the user belongs to.
 * - To also hydrate `included` Campaign resources when using `include=campaign` / membership campaign links, you need `campaigns` per Patreon docs.
 *
 * ## Suggested first request (single-creator site)
 * ```
 * GET https://www.patreon.com/api/oauth2/v2/identity
 *   ?include=memberships,memberships.currently_entitled_tiers
 *   &fields[user]=full_name,email,image_url,url,vanity
 *   &fields[member]=patron_status,currently_entitled_amount_cents,full_name
 *   &fields[tier]=title,amount_cents
 * ```
 * Encode brackets as `%5B` / `%5D` in real URLs.
 *
 * Nested include `memberships.currently_entitled_tiers` is commonly used to pull Tier stubs into
 * `included[]`; confirm against a live token if Patreon changes compound includes.
 */

import type { JsonApiDocument, JsonApiResource } from "./jsonapi-types.js";

export const PATREON_IDENTITY_URL = "https://www.patreon.com/api/oauth2/v2/identity";

/**
 * Space-separated scopes for patron “Log in with Patreon” (authorize URL).
 * Keep in sync with `web/lib/patreon-patron-scopes.ts`.
 */
export const PATREON_PATRON_OAUTH_SCOPES =
  "identity identity[email] identity.memberships";

export function buildPatronIdentityRequestUrl(): string {
  const params = new URLSearchParams();
  params.set("include", "memberships,memberships.currently_entitled_tiers");
  params.set("fields[user]", "email,full_name");
  params.set("fields[member]", "patron_status,currently_entitled_amount_cents,full_name");
  params.set("fields[tier]", "title,amount_cents");
  return `${PATREON_IDENTITY_URL}?${params.toString()}`;
}

export async function fetchPatronIdentity(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<PatreonIdentityDocument> {
  const url = buildPatronIdentityRequestUrl();
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Patreon identity request failed (${res.status}): ${body.slice(0, 500)}`
    );
  }
  return (await res.json()) as PatreonIdentityDocument;
}

/** Top-level `data` for identity — User v2 */
export type PatreonUserResource = JsonApiResource & {
  type: "user";
  attributes?: {
    about?: string | null;
    created?: string;
    email?: string;
    first_name?: string | null;
    full_name?: string;
    image_url?: string | null;
    last_name?: string | null;
    thumb_url?: string | null;
    url?: string;
    vanity?: string | null;
    /** …see User v2 table in Patreon docs */
    [key: string]: unknown;
  };
  relationships?: {
    campaign?: { data?: { type: "campaign"; id: string } | null };
    memberships?: {
      data?: Array<{ type: "member"; id: string }> | { type: "member"; id: string } | null;
    };
  };
};

/** Member included from `include=memberships` */
export type PatreonMemberResource = JsonApiResource & {
  type: "member";
  attributes?: {
    patron_status?: string | null;
    currently_entitled_amount_cents?: number | null;
    full_name?: string;
    /** …see Member resource in Patreon docs */
    [key: string]: unknown;
  };
  relationships?: {
    campaign?: { data?: { type: "campaign"; id: string } | null };
    currently_entitled_tiers?: {
      data?: Array<{ type: "tier"; id: string }> | { type: "tier"; id: string } | null;
    };
    user?: { data?: { type: "user"; id: string } | null };
  };
};

export type PatreonTierResource = JsonApiResource & {
  type: "tier";
  attributes?: {
    title?: string;
    amount_cents?: number;
    [key: string]: unknown;
  };
};

/**
 * Parsed envelope for handshake: map `patreon_tier_${id}` the same way as member sync.
 */
export type PatreonIdentityDocument = JsonApiDocument & {
  data: PatreonUserResource | null;
  included?: Array<PatreonMemberResource | PatreonTierResource | JsonApiResource>;
};

/**
 * Collects `patreon_tier_*` ids from active patron memberships for the given Patreon
 * **numeric** campaign id (same id used in `patreon_campaign_{id}` and the API).
 */
export function tierIdsFromIdentityDoc(doc: PatreonIdentityDocument, campaignId: string): string[] {
  const included = doc.included ?? [];
  const members = included.filter((r): r is PatreonMemberResource => r.type === "member");
  const active = members.filter((m) => m.attributes?.patron_status === "active_patron");
  const matchCampaign = (m: PatreonMemberResource) => {
    const c = m.relationships?.campaign?.data;
    return c && c.type === "campaign" && c.id === campaignId;
  };
  let use = active.filter(matchCampaign);
  if (use.length === 0 && active.length === 1 && !active[0]!.relationships?.campaign?.data) {
    use = active;
  }
  const tiers: string[] = [];
  for (const m of use) {
    const raw = m.relationships?.currently_entitled_tiers?.data;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const link of list) {
      if (link?.type === "tier" && link.id) tiers.push(`patreon_tier_${link.id}`);
    }
  }
  return [...new Set(tiers)];
}

export function extractPatronSyncFromIdentity(
  doc: PatreonIdentityDocument,
  patreonCampaignNumericId: string
): { patreon_user_id: string; email: string; tier_ids: string[] } {
  const data = doc.data;
  if (!data || data.type !== "user" || !data.id) {
    throw new Error("Invalid Patreon identity response: missing user resource.");
  }
  const patreon_user_id = data.id;
  const emailRaw = data.attributes?.email;
  const email =
    typeof emailRaw === "string" && emailRaw.includes("@")
      ? emailRaw.trim().toLowerCase()
      : `patreon_${patreon_user_id}@relay.local`;
  const tier_ids = tierIdsFromIdentityDoc(doc, patreonCampaignNumericId);
  return { patreon_user_id, email, tier_ids };
}
