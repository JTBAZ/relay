/**
 * @fileoverview Unified connected-platform readiness for Autopost distribution UI.
 */

import type { PrismaClient } from "@prisma/client";
import {
  DISTRIBUTION_DESTINATIONS,
  PLATFORM_DESTINATION_META,
  type DistributionDestination,
  type PlatformReadiness
} from "./platform-destinations.js";

export type ConnectedPlatformWire = {
  destination: DistributionDestination;
  label: string;
  readiness: PlatformReadiness;
  handoff: "extension" | "api";
  detail?: string | null;
};

export async function listConnectedPlatforms(
  prisma: PrismaClient,
  creatorId: string
): Promise<ConnectedPlatformWire[]> {
  const cid = creatorId.trim();
  const [bluesky, creatorProfile] = await Promise.all([
    prisma.creatorBlueskyCredential.findUnique({
      where: { creatorId: cid },
      select: { handle: true }
    }),
    prisma.creatorProfile.findFirst({
      where: { tenant: { relayCreatorId: cid } },
      select: { patreonCampaignId: true }
    })
  ]);

  return DISTRIBUTION_DESTINATIONS.map((destination) => {
    const meta = PLATFORM_DESTINATION_META[destination];
    let readiness: PlatformReadiness = "available";
    let detail: string | null = null;

    if (destination === "bluesky") {
      if (!bluesky) {
        readiness = "needs_credential";
        detail = "Connect Bluesky in Autopost settings.";
      } else {
        detail = `@${bluesky.handle}`;
      }
    } else if (destination === "patreon") {
      if (!creatorProfile?.patreonCampaignId) {
        readiness = "needs_credential";
        detail = "Connect Patreon creator ingest.";
      }
    } else {
      readiness = "needs_extension";
      detail = "Requires Relay browser extension for form-fill handoff.";
    }

    return {
      destination,
      label: meta.label,
      readiness,
      handoff: meta.handoff,
      detail
    };
  });
}
