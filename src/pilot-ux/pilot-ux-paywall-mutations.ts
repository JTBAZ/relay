/**
 * PUX-003 — programmatic paywall mutations on pilot UX seed (no Patreon OAuth).
 * Updates PostVersion.tierIds / PostTier / patron entitlement snapshots for gate tests.
 */
import { EntitlementSource, type PrismaClient } from "@prisma/client";
import { upsertPatronEntitlementSnapshot } from "../identity/patron-entitlement-snapshot.js";
import { updatePostAudienceTierGate } from "../relay/update-post-audience-tier-gate.js";

const PILOT_UX_DEV_ENTITLEMENT_STALE_AFTER = new Date("2099-01-01T00:00:00.000Z");

/**
 * Re-tier a seeded post: updates `Post`, latest `PostVersion`, and `PostTier` rows.
 */
export async function mutatePilotUxPostTierGate(
  prisma: PrismaClient,
  args: {
    creatorId: string;
    postId: string;
    tierIds: string[];
    isPublic?: boolean;
  }
): Promise<void> {
  await updatePostAudienceTierGate(prisma, args);
}

/**
 * Replace patron entitlement tiers for one followed creator (full replace semantics).
 */
export async function mutatePilotUxPatronEntitlement(
  prisma: PrismaClient,
  args: {
    patronMembershipId: string;
    relayCreatorId: string;
    entitledTierIds: string[];
    campaignId?: string | null;
  }
): Promise<void> {
  await upsertPatronEntitlementSnapshot(prisma, {
    patronMembershipId: args.patronMembershipId,
    relayCreatorId: args.relayCreatorId,
    entitledTierIds: [...args.entitledTierIds],
    source: EntitlementSource.manual_support,
    campaignId: args.campaignId ?? null
  });
  await prisma.patronEntitlementSnapshot.update({
    where: {
      patronMembershipId_relayCreatorId: {
        patronMembershipId: args.patronMembershipId,
        relayCreatorId: args.relayCreatorId
      }
    },
    data: { staleAfter: PILOT_UX_DEV_ENTITLEMENT_STALE_AFTER }
  });
}
