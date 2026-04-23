import type { PrismaClient } from "@prisma/client";
import {
  ensureCreatorProfilePatreonCampaignId,
  getRelayCreatorIdForPatreonCampaignDb
} from "./campaign-tenant-resolve.js";
import { pickDefaultCampaignId } from "./map-patreon-to-ingest.js";
import { fetchCampaignsWithTiers } from "./patreon-resource-api.js";

/**
 * After creator ingest OAuth, list campaigns with the new access token and persist
 * `CreatorProfile.patreonCampaignId` when Patreon returns exactly one campaign (same heuristic as sync).
 */
export async function syncCreatorProfilePatreonCampaignFromOAuthToken(args: {
  prisma: PrismaClient;
  relayCreatorId: string;
  accessToken: string;
  fetchImpl: typeof fetch;
}): Promise<{ patreonCampaignId: string | null }> {
  const doc = await fetchCampaignsWithTiers({
    access_token: args.accessToken,
    fetch_impl: args.fetchImpl
  });
  const campaignId = pickDefaultCampaignId(doc);
  if (!campaignId) {
    return { patreonCampaignId: null };
  }

  const boundCreator = await getRelayCreatorIdForPatreonCampaignDb(
    args.prisma,
    campaignId
  );
  if (boundCreator && boundCreator !== args.relayCreatorId.trim()) {
    throw new Error(
      "That Patreon campaign is already registered to a different Relay studio. " +
        "Confirm you’re signed into the Patreon account that owns this campaign, or open the Relay workspace for that studio. " +
        `(Patreon campaign: ${campaignId}.)`
    );
  }

  const ensured = await ensureCreatorProfilePatreonCampaignId(args.prisma, {
    relayCreatorId: args.relayCreatorId,
    patreonCampaignId: campaignId
  });
  if (ensured.kind === "conflict") {
    throw new Error(
      "This would have overwritten the campaign already registered to this studio. " +
        "Make sure you’re logged into the correct Patreon creator account—the one that matches the campaign you already saved—then try again. " +
        "If the saved campaign is wrong, update it in your studio settings or contact support before reconnecting."
    );
  }
  return { patreonCampaignId: campaignId };
}
