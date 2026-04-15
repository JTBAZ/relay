import type { PrismaClient } from "@prisma/client";
import { ensureCreatorProfilePatreonCampaignId } from "./campaign-tenant-resolve.js";
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
  await ensureCreatorProfilePatreonCampaignId(args.prisma, {
    relayCreatorId: args.relayCreatorId,
    patreonCampaignId: campaignId
  });
  return { patreonCampaignId: campaignId };
}
