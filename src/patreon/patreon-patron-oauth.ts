import type { PatreonClient } from "../auth/patreon-client.js";
import type { IdentityService } from "../identity/identity-service.js";
import type { SessionToken, UserAccount } from "../identity/types.js";
import {
  extractPatronSyncFromIdentity,
  fetchPatronIdentity
} from "./patreon-user-identity.js";

/**
 * Patron OAuth: exchange authorization code, pull `/v2/identity`, upsert Relay user
 * tiers (same ids as creator-side member sync), issue gallery session.
 * Does not persist the Patreon access token (creator credentials use a separate store).
 */
export async function exchangePatreonPatronOAuth(params: {
  code: string;
  redirectUri: string;
  creatorId: string;
  patreonCampaignNumericId: string;
  patreonClient: PatreonClient;
  identityService: IdentityService;
  fetchImpl: typeof fetch;
}): Promise<{ user: UserAccount; session: SessionToken }> {
  const tokenResponse = await params.patreonClient.exchangeCode(
    params.code,
    params.redirectUri
  );
  const doc = await fetchPatronIdentity(
    tokenResponse.access_token,
    params.fetchImpl
  );
  const sync = extractPatronSyncFromIdentity(doc, params.patreonCampaignNumericId);
  return params.identityService.completePatreonPatronOAuth(
    params.creatorId,
    sync.patreon_user_id,
    sync.email,
    sync.tier_ids
  );
}
