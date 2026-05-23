/**
 * Pilot UX — repeatable creator sign-up / onboarding walkthrough without Patreon OAuth.
 * Scoped to a single seeded dev account; does not delete posts or touch other faux creators.
 */
import {
  ProviderKind,
  PublicSlugSource,
  UserKind,
  type PrismaClient
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { tierStableId } from "../ingest/canonical-store-db.js";
import { ensureCreatorOnboardingAtLeastImportStarted } from "../creator/onboarding-service.js";

export const PILOT_UX_ONBOARDING_LEGACY_FILE_ID = "creator_dev_onboarding";
export const PILOT_UX_ONBOARDING_EMAIL = "creator_dev_onboarding@pilot.relay.test";
export const PILOT_UX_ONBOARDING_RELAY_CREATOR_ID = "rcx_pilot_dev_onboarding";
export const PILOT_UX_ONBOARDING_PUBLIC_SLUG = "dev-onboarding";
export const PILOT_UX_ONBOARDING_PATREON_CAMPAIGN_ID = "pilot_patreon_campaign_onboarding";
export const PILOT_UX_ONBOARDING_CAMPAIGN_ID = "pilot_campaign_onboarding";
export const PILOT_UX_ONBOARDING_CAMPAIGN_NAME = "Pilot UX — Onboarding walkthrough";

/** Stable faux Patreon tiers for step 4 “What Relay sees” UX (no OAuth). */
export const PILOT_UX_ONBOARDING_WALKTHROUGH_TIERS = [
  {
    relayTierId: "patreon_tier_onboarding_supporter",
    title: "Supporter",
    amountCents: 500
  },
  {
    relayTierId: "patreon_tier_onboarding_studio",
    title: "Studio",
    amountCents: 1500
  }
] as const;

/** Hardcoded membership snapshot returned after simulate Patreon connect (dev walkthrough only). */
export function pilotUxOnboardingWalkthroughPatronTierSummary(): {
  total_patrons: number;
  free_patrons: number;
  tiers: Array<{
    tier_id: string;
    title: string;
    amount_cents: number | null;
    patron_count: number;
  }>;
} {
  return {
    total_patrons: 127,
    free_patrons: 12,
    tiers: [
      {
        tier_id: PILOT_UX_ONBOARDING_WALKTHROUGH_TIERS[0].relayTierId,
        title: PILOT_UX_ONBOARDING_WALKTHROUGH_TIERS[0].title,
        amount_cents: PILOT_UX_ONBOARDING_WALKTHROUGH_TIERS[0].amountCents,
        patron_count: 89
      },
      {
        tier_id: PILOT_UX_ONBOARDING_WALKTHROUGH_TIERS[1].relayTierId,
        title: PILOT_UX_ONBOARDING_WALKTHROUGH_TIERS[1].title,
        amount_cents: PILOT_UX_ONBOARDING_WALKTHROUGH_TIERS[1].amountCents,
        patron_count: 38
      }
    ]
  };
}

const WALKTHROUGH_SEED_NOW = new Date("2026-05-20T12:00:00.000Z");

async function ensurePilotUxOnboardingWalkthroughTiers(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<void> {
  await prisma.campaign.upsert({
    where: { id: PILOT_UX_ONBOARDING_CAMPAIGN_ID },
    create: {
      id: PILOT_UX_ONBOARDING_CAMPAIGN_ID,
      creatorId: relayCreatorId,
      name: PILOT_UX_ONBOARDING_CAMPAIGN_NAME,
      upstreamUpdatedAt: WALKTHROUGH_SEED_NOW,
      versionSeq: 1
    },
    update: {
      name: PILOT_UX_ONBOARDING_CAMPAIGN_NAME,
      upstreamUpdatedAt: WALKTHROUGH_SEED_NOW,
      versionSeq: 1
    }
  });

  for (const tier of PILOT_UX_ONBOARDING_WALKTHROUGH_TIERS) {
    const id = tierStableId(relayCreatorId, tier.relayTierId);
    await prisma.tier.upsert({
      where: { id },
      create: {
        id,
        creatorId: relayCreatorId,
        relayTierId: tier.relayTierId,
        providerTierId: tier.relayTierId,
        campaignId: PILOT_UX_ONBOARDING_CAMPAIGN_ID,
        title: tier.title,
        amountCents: tier.amountCents,
        upstreamUpdatedAt: WALKTHROUGH_SEED_NOW,
        versionSeq: 1
      },
      update: {
        title: tier.title,
        amountCents: tier.amountCents,
        campaignId: PILOT_UX_ONBOARDING_CAMPAIGN_ID,
        upstreamUpdatedAt: WALKTHROUGH_SEED_NOW,
        versionSeq: 1
      }
    });
  }
}

export class PilotUxWalkthroughForbiddenError extends Error {
  public override readonly name = "PilotUxWalkthroughForbiddenError";

  public constructor(message = "Not the pilot UX onboarding walkthrough account.") {
    super(message);
  }
}

/** Dev-only API gate — mirrors pilot UX seed override in production. */
export function isPilotUxDevWalkthroughApiEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.NODE_ENV === "production") {
    return (
      env.RELAY_ALLOW_PILOT_UX_DEV_API === "1" || env.RELAY_ALLOW_PILOT_UX_SEED === "1"
    );
  }
  return true;
}

export async function assertPilotUxOnboardingWalkthroughAccount(
  prisma: PrismaClient,
  accountId: string
): Promise<{ relayCreatorId: string; userId: string }> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { legacyFileId: true, primaryRelayCreatorId: true }
  });
  if (
    account?.legacyFileId !== PILOT_UX_ONBOARDING_LEGACY_FILE_ID ||
    account.primaryRelayCreatorId?.trim() !== PILOT_UX_ONBOARDING_RELAY_CREATOR_ID
  ) {
    throw new PilotUxWalkthroughForbiddenError();
  }

  const user = await prisma.user.findFirst({
    where: {
      tenant: { relayCreatorId: PILOT_UX_ONBOARDING_RELAY_CREATOR_ID },
      kind: UserKind.creator
    },
    select: { id: true }
  });
  if (!user) {
    throw new PilotUxWalkthroughForbiddenError("Onboarding walkthrough studio user missing.");
  }

  return { relayCreatorId: PILOT_UX_ONBOARDING_RELAY_CREATOR_ID, userId: user.id };
}

/**
 * Rewind onboarding walkthrough state for the faux onboarding creator only.
 * Keeps the account, tenant, and any seeded catalog rows intact.
 */
export async function resetPilotUxOnboardingWalkthrough(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<void> {
  if (relayCreatorId !== PILOT_UX_ONBOARDING_RELAY_CREATOR_ID) {
    throw new PilotUxWalkthroughForbiddenError();
  }

  const user = await prisma.user.findFirst({
    where: { tenant: { relayCreatorId }, kind: UserKind.creator },
    select: { id: true, creatorProfile: { select: { id: true } } }
  });
  if (!user?.creatorProfile) {
    throw new PilotUxWalkthroughForbiddenError("Onboarding walkthrough profile missing.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.creatorProfile.update({
      where: { id: user.creatorProfile!.id },
      data: {
        displayName: null,
        avatarUrl: null,
        bannerUrl: null,
        bio: null,
        discipline: null,
        username: null,
        usernameNorm: null,
        patreonCampaignId: null,
        subscribestarProfileId: null,
        subscribestarProviderSnapshot: Prisma.DbNull,
        subscribestarProviderSnapshotAt: null,
        slugSource: PublicSlugSource.allocated,
        publicSlug: PILOT_UX_ONBOARDING_PUBLIC_SLUG
      }
    });

    await tx.providerAccount.deleteMany({ where: { userId: user.id } });

    await tx.creatorOnboardingState.upsert({
      where: { creatorId: relayCreatorId },
      create: { creatorId: relayCreatorId, step: "connected" },
      update: { step: "connected", metadata: Prisma.DbNull }
    });

    await tx.creatorSyncState.deleteMany({ where: { creatorId: relayCreatorId } });
    await tx.creatorProviderSyncState.deleteMany({
      where: { creatorId: relayCreatorId, provider: ProviderKind.patreon }
    });
  });
}

/**
 * Fake a successful Patreon creator connect for the walkthrough account (no OAuth, no Patreon API).
 */
export async function simulatePilotUxPatreonConnect(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<void> {
  if (relayCreatorId !== PILOT_UX_ONBOARDING_RELAY_CREATOR_ID) {
    throw new PilotUxWalkthroughForbiddenError();
  }

  const user = await prisma.user.findFirst({
    where: { tenant: { relayCreatorId }, kind: UserKind.creator },
    select: {
      id: true,
      creatorProfile: {
        select: { id: true, displayName: true, avatarUrl: true }
      }
    }
  });
  if (!user?.creatorProfile) {
    throw new PilotUxWalkthroughForbiddenError("Onboarding walkthrough profile missing.");
  }

  await ensurePilotUxOnboardingWalkthroughTiers(prisma, relayCreatorId);

  await prisma.creatorProfile.update({
    where: { id: user.creatorProfile.id },
    data: {
      patreonCampaignId: PILOT_UX_ONBOARDING_PATREON_CAMPAIGN_ID,
      displayName: user.creatorProfile.displayName ?? PILOT_UX_ONBOARDING_CAMPAIGN_NAME,
      avatarUrl: user.creatorProfile.avatarUrl ?? "/placeholder-user.jpg"
    }
  });

  await ensureCreatorOnboardingAtLeastImportStarted(prisma, relayCreatorId);
}
