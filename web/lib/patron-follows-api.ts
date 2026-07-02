import { relayFetch, relayFetchWithoutAuthRedirect } from "@/lib/relay-api";

/** Row from `GET /api/v1/patron/follows` (PE-C). */
export type PatronFollowApiItem = {
  relay_creator_id: string;
  created_at: string;
  creator?: {
    display_name: string;
    handle: string;
    public_slug: string | null;
    avatar_url: string | null;
    discipline: string | null;
  };
  entitlement?: {
    active: boolean;
    tier_ids: string[];
    tier_label: string;
    as_of: string | null;
    stale_after: string | null;
  };
};

export type PatronFollowsPayload = {
  items: PatronFollowApiItem[];
};

export type PatronFollowsFetchOptions = {
  /** Dev/optional previews should fall back instead of navigating to `/login` on 401. */
  suppressAuthRedirect?: boolean;
};

/**
 * PE-C — Patron follow graph for the session membership. Auth: `relay_session` cookie
 * (`credentials: "include"` via {@link relayFetch}).
 */
export async function fetchPatronFollows(
  options: PatronFollowsFetchOptions = {}
): Promise<PatronFollowsPayload> {
  const fetcher = options.suppressAuthRedirect
    ? relayFetchWithoutAuthRedirect
    : relayFetch;
  return fetcher<PatronFollowsPayload>("/api/v1/patron/follows");
}
