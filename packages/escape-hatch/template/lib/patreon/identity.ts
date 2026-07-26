/**
 * Patreon /oauth2/v2/identity fetch + campaign-scoped membership extraction (EH-040).
 * Rejects memberships for the wrong campaign. Never logs tokens or raw PII payloads.
 */

export const DEFAULT_PATREON_IDENTITY_URL =
  "https://www.patreon.com/api/oauth2/v2/identity";

export type PatreonIdentityResource = {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
};

export type PatreonIdentityDocument = {
  data: PatreonIdentityResource | null;
  included?: PatreonIdentityResource[];
};

export type CampaignMembershipExtraction = {
  patreonUserId: string;
  tierIds: string[];
  patronStatus: string | null;
  campaignMatched: boolean;
};

export class PatreonIdentityError extends Error {
  readonly code = "ESCAPE_HATCH_PATREON_IDENTITY";

  constructor(message: string) {
    super(message);
    this.name = "PatreonIdentityError";
  }
}

export function buildIdentityRequestUrl(
  identityBaseUrl: string = DEFAULT_PATREON_IDENTITY_URL
): string {
  const params = new URLSearchParams();
  params.set(
    "include",
    "memberships,memberships.campaign,memberships.currently_entitled_tiers"
  );
  params.set("fields[user]", "full_name");
  params.set("fields[member]", "patron_status,currently_entitled_amount_cents");
  params.set("fields[tier]", "title,amount_cents");
  params.set("fields[campaign]", "vanity,creation_name");
  return `${identityBaseUrl}?${params.toString()}`;
}

export async function fetchPatreonIdentity(
  accessToken: string,
  opts?: {
    identityUrl?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<PatreonIdentityDocument> {
  const url = buildIdentityRequestUrl(
    opts?.identityUrl ?? DEFAULT_PATREON_IDENTITY_URL
  );
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) {
    throw new PatreonIdentityError(
      `Patreon identity request failed with status ${res.status}`
    );
  }
  return (await res.json()) as PatreonIdentityDocument;
}

function asRelData(
  rel: unknown
): { type: string; id: string } | Array<{ type: string; id: string }> | null {
  if (!rel || typeof rel !== "object") return null;
  const data = (rel as { data?: unknown }).data;
  if (!data) return null;
  if (Array.isArray(data)) {
    return data.filter(
      (d): d is { type: string; id: string } =>
        Boolean(d && typeof d === "object" && typeof (d as { id?: unknown }).id === "string")
    );
  }
  if (
    typeof data === "object" &&
    typeof (data as { id?: unknown }).id === "string"
  ) {
    return data as { type: string; id: string };
  }
  return null;
}

/**
 * Extract patreon user id + tier ids for the configured campaign.
 * Throws when campaign does not match any membership (fail closed).
 */
export function extractCampaignMembership(
  doc: PatreonIdentityDocument,
  expectedCampaignId: string
): CampaignMembershipExtraction {
  const campaignId = expectedCampaignId.trim();
  if (!campaignId) {
    throw new PatreonIdentityError("PATREON_CAMPAIGN_ID is required.");
  }

  const data = doc.data;
  if (!data || data.type !== "user" || !data.id) {
    throw new PatreonIdentityError(
      "Invalid Patreon identity response: missing user resource."
    );
  }

  const included = doc.included ?? [];
  const members = included.filter((r) => r.type === "member");

  const matchCampaign = (m: PatreonIdentityResource): boolean => {
    const rel = m.relationships?.campaign;
    const c = asRelData(rel);
    if (!c || Array.isArray(c)) return false;
    return c.type === "campaign" && c.id === campaignId;
  };

  let matched = members.filter(matchCampaign);
  // Single active membership without campaign link — only accept if exactly one member.
  if (matched.length === 0 && members.length === 1) {
    const only = members[0]!;
    const camp = asRelData(only.relationships?.campaign);
    if (!camp) {
      // Ambiguous — reject when campaign is configured (fail closed).
      throw new PatreonIdentityError(
        "Patreon membership missing campaign binding; cannot validate PATREON_CAMPAIGN_ID."
      );
    }
  }

  if (matched.length === 0) {
    throw new PatreonIdentityError(
      "No Patreon membership for the configured campaign."
    );
  }

  const active = matched.filter(
    (m) => m.attributes?.patron_status === "active_patron"
  );
  if (active.length === 0) {
    throw new PatreonIdentityError(
      "No active Patreon membership for the configured campaign."
    );
  }

  const tiers: string[] = [];
  let patronStatus: string | null = null;
  for (const m of active) {
    const status = m.attributes?.patron_status;
    if (typeof status === "string") patronStatus = status;
    const raw = asRelData(m.relationships?.currently_entitled_tiers);
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const link of list) {
      if (link?.type === "tier" && link.id) {
        tiers.push(`patreon_tier_${link.id}`);
      }
    }
  }

  return {
    patreonUserId: data.id,
    tierIds: [...new Set(tiers)],
    patronStatus,
    campaignMatched: true
  };
}
