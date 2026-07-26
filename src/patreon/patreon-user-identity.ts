/**
 * @fileoverview Patreon `/v2/identity` URL builder, fetcher, and parsers for patron tier + membership projections.
 * @description Uses user access tokens (not creator tokens). Field lists must match Patreon v2 sparse payload rules.
 * @async `fetchPatronIdentity`, `fetchPatreonOAuthIdentityUserId`.
 * @throws {Error} Non-2xx Patreon responses in fetch helpers.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see {@link https://docs.patreon.com/#get-api-oauth2-v2-identity}
 * @security-audit-required Identity documents include email and name when requested — do not log raw JSON.
 */
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
 * Space-separated scopes for patron "Log in with Patreon" (authorize URL).
 * Keep in sync with `web/lib/patreon-patron-scopes.ts`.
 *
 * `campaigns` is included so a single OAuth round-trip can also reveal whether the
 * user *owns* a Patreon campaign (creator candidacy), in addition to their memberships.
 * `campaigns` is read-only; write scopes (`w:campaigns.posts`, etc.) are requested
 * separately during creator onboarding.
 */
export const PATREON_PATRON_OAUTH_SCOPES =
  "identity identity[email] identity.memberships campaigns";

export function buildPatronIdentityRequestUrl(): string {
  const params = new URLSearchParams();
  params.set(
    "include",
    "memberships,memberships.campaign,memberships.currently_entitled_tiers,campaign"
  );
  params.set("fields[user]", "email,full_name");
  params.set("fields[member]", "patron_status,currently_entitled_amount_cents,full_name");
  params.set("fields[tier]", "title,amount_cents");
  params.set("fields[campaign]", "vanity,creation_name");
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

/** Campaign resource — present in `included[]` when scope `campaigns` is granted. */
export type PatreonCampaignResource = JsonApiResource & {
  type: "campaign";
  attributes?: {
    vanity?: string | null;
    creation_name?: string | null;
    [key: string]: unknown;
  };
};

/**
 * Parsed envelope for handshake: map `patreon_tier_${id}` the same way as member sync.
 */
export type PatreonIdentityDocument = JsonApiDocument & {
  data: PatreonUserResource | null;
  included?: Array<
    PatreonMemberResource | PatreonTierResource | PatreonCampaignResource | JsonApiResource
  >;
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

// ---------------------------------------------------------------------------
// Unified identity extraction (PE-A) — single OAuth round-trip, both lenses.
//
// `extractUnifiedPatreonIdentity` returns:
//   - `owned_campaign_id`: when this Patreon user owns a campaign (creator
//     candidacy). Read-only signal — no creator role is granted automatically.
//   - `memberships[]`: every active patron membership across all campaigns this
//     user pledges to, with `patreon_tier_*` ids ready for tenant upsert.
//
// Mapping `campaign_id` → Relay `creator_id` happens in the identity layer
// (`IdentityService.completeUnifiedPatreonPatronOAuth`); this extractor stays
// transport-pure.
// ---------------------------------------------------------------------------

/**
 * Discriminator for `member.attributes.patron_status` (Patreon enum):
 * - `paid` — `active_patron` (currently pledging).
 * - `declined_patron` — recent payment failure; intent to pay still alive (often resolves in days).
 * - `former_patron` — explicitly cancelled; kept for revival-offer targeting.
 * - `free_follower` — `patron_status === null` (followed without pledging — primary funnel signal).
 *
 * Anything not in this set is dropped from `memberships` (forward-compatible against future Patreon enum values).
 */
export type PatreonMembershipCategory =
  | "paid"
  | "declined_patron"
  | "former_patron"
  | "free_follower";

/**
 * Priority for collapsing multiple `member` rows for the same campaign (rare, but defensible across
 * relationship history — a re-activated patron must not be downgraded by a stale row). Higher = wins.
 */
const CATEGORY_PRIORITY: Record<PatreonMembershipCategory, number> = {
  paid: 4,
  declined_patron: 3,
  former_patron: 2,
  free_follower: 1
};

function categorizeMember(
  m: PatreonMemberResource
): PatreonMembershipCategory | null {
  const raw = m.attributes?.patron_status;
  if (raw === "active_patron") return "paid";
  if (raw === "declined_patron") return "declined_patron";
  if (raw === "former_patron") return "former_patron";
  if (raw === null || raw === undefined) return "free_follower";
  return null;
}

export type UnifiedPatreonMembership = {
  /** Patreon numeric `campaign_id` (same id used in `patreon_campaign_{id}` and the API). */
  patreon_campaign_id: string;
  /** `patreon_tier_*` ids for this membership, deduped. Empty for `free_follower` / `former_patron` / `declined_patron`. */
  tier_ids: string[];
  /** See {@link PatreonMembershipCategory} — drives PE-C follow-seed bucketing + revival-offer UX. */
  status: PatreonMembershipCategory;
};

export type UnifiedPatreonIdentity = {
  patreon_user_id: string;
  email: string;
  /** Patreon `campaign_id` that this user *owns*, when `campaigns` scope was granted. */
  owned_campaign_id: string | null;
  /**
   * Memberships across all four categories (paid, declined, former, free follower). Callers
   * downstream (`IdentityService.completeUnifiedPatreonPatronOAuth`) split by `status` for
   * targeted UX; the underlying `TenantMembership` upsert is the same for all four (with
   * `tierIds: []` when there's nothing currently entitled).
   */
  memberships: UnifiedPatreonMembership[];
};

function memberCampaignId(m: PatreonMemberResource): string | null {
  const c = m.relationships?.campaign?.data;
  return c && c.type === "campaign" ? c.id : null;
}

/**
 * Extract a multi-campaign view of a Patreon identity response.
 *
 * Use after `fetchPatronIdentity` when the OAuth scope set includes both
 * `identity.memberships` and `campaigns`. Falls back to empty arrays for fields
 * that the granted scopes don't populate, so older single-creator scope sets
 * still parse without throwing.
 */
export function extractUnifiedPatreonIdentity(
  doc: PatreonIdentityDocument
): UnifiedPatreonIdentity {
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

  const ownedRel = data.relationships?.campaign?.data;
  const owned_campaign_id =
    ownedRel && ownedRel.type === "campaign" ? ownedRel.id : null;

  const included = doc.included ?? [];
  const members = included.filter(
    (r): r is PatreonMemberResource => r.type === "member"
  );

  // Per campaign, keep the highest-priority status (paid > declined > former > free).
  // Tier ids only count from rows whose status matches the *winning* category, so a stale
  // former_patron row never poisons a re-activated paid membership's tier_ids.
  type Bucket = {
    status: PatreonMembershipCategory;
    tiers: Set<string>;
  };
  const byCampaign = new Map<string, Bucket>();

  for (const m of members) {
    const campaignId = memberCampaignId(m);
    if (!campaignId) continue;
    const category = categorizeMember(m);
    if (!category) continue;

    const tierLinks = m.relationships?.currently_entitled_tiers?.data;
    const tierList = Array.isArray(tierLinks)
      ? tierLinks
      : tierLinks
        ? [tierLinks]
        : [];
    const rowTiers = new Set<string>();
    for (const link of tierList) {
      if (link?.type === "tier" && link.id) {
        rowTiers.add(`patreon_tier_${link.id}`);
      }
    }

    const existing = byCampaign.get(campaignId);
    if (!existing) {
      byCampaign.set(campaignId, { status: category, tiers: rowTiers });
      continue;
    }
    const existingPriority = CATEGORY_PRIORITY[existing.status];
    const newPriority = CATEGORY_PRIORITY[category];
    if (newPriority > existingPriority) {
      byCampaign.set(campaignId, { status: category, tiers: rowTiers });
    } else if (newPriority === existingPriority) {
      for (const t of rowTiers) existing.tiers.add(t);
    }
    // Lower-priority rows are ignored.
  }

  const memberships: UnifiedPatreonMembership[] = [];
  for (const [patreon_campaign_id, bucket] of byCampaign.entries()) {
    memberships.push({
      patreon_campaign_id,
      tier_ids: [...bucket.tiers].sort(),
      status: bucket.status
    });
  }
  // Deterministic order so callers and tests can compare directly.
  memberships.sort((a, b) =>
    a.patreon_campaign_id.localeCompare(b.patreon_campaign_id)
  );

  return { patreon_user_id, email, owned_campaign_id, memberships };
}

/**
 * Minimal GET `/v2/identity` — only needs `data.id` (Patreon user id). Used after creator OAuth
 * token exchange to ensure the same Patreon user reconnects; requires `identity` (or equivalent)
 * on the granted scopes.
 */
export async function fetchPatreonOAuthIdentityUserId(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const params = new URLSearchParams();
  params.set("fields[user]", "full_name");
  const url = `${PATREON_IDENTITY_URL}?${params.toString()}`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Patreon identity request failed (${res.status}): ${body.slice(0, 500)}`
    );
  }
  const doc = (await res.json()) as PatreonIdentityDocument;
  const data = doc.data;
  if (!data || data.type !== "user" || !data.id) {
    throw new Error("Invalid Patreon identity response: missing user id.");
  }
  return data.id;
}
