/**
 * Pilot UX — repeatable creator sign-up / onboarding walkthrough without Patreon OAuth.
 * Scoped to a single seeded dev account; does not delete posts or touch other faux creators.
 */
import {
  IdentityAuthProvider,
  MediaIngestOrigin,
  MediaProcessingStatus,
  MediaUpstreamStatus,
  PostSource,
  PostUpstreamStatus,
  ProviderKind,
  PublicSlugSource,
  TenantRole,
  UserKind,
  type PrismaClient
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { tierStableId } from "../ingest/canonical-store-db.js";
import { ensureCreatorOnboardingAtLeastImportStarted } from "../creator/onboarding-service.js";
import { getPlatformRelayCreatorId } from "../identity/platform-tenant.js";
import { FileExportIndex } from "../export/export-index.js";
import type { CreatorExportIndex, ExportMediaRecord } from "../export/types.js";
import { DbPatreonSyncHealthStore } from "../patreon/patreon-sync-health-store-db.js";
import { mediaMimeForPilotPost } from "./pilot-ux-seed-spec.js";

export const PILOT_UX_ONBOARDING_LEGACY_FILE_ID = "creator_dev_onboarding";
export const PILOT_UX_ONBOARDING_EMAIL = "creator_dev_onboarding@pilot.relay.test";
export const PILOT_UX_ONBOARDING_RELAY_CREATOR_ID = "rcx_pilot_dev_onboarding";
export const PILOT_UX_ONBOARDING_PUBLIC_SLUG = "dev-onboarding";
export const PILOT_UX_ONBOARDING_PATREON_CAMPAIGN_ID = "pilot_patreon_campaign_onboarding";
export const PILOT_UX_ONBOARDING_CAMPAIGN_ID = "pilot_campaign_onboarding";
export const PILOT_UX_ONBOARDING_CAMPAIGN_NAME = "Pilot UX — Onboarding walkthrough";
export const PILOT_UX_PATRON_ONBOARDING_LEGACY_FILE_ID = "patron_dev_onboarding";
export const PILOT_UX_PATRON_ONBOARDING_EMAIL = "patron_dev_onboarding@pilot.relay.test";
export const PILOT_UX_PATRON_ONBOARDING_HANDLE = "patron_dev_onboarding";
export const PILOT_UX_PATRON_ONBOARDING_DISPLAY_NAME = "Dev Patron Onboarding";

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

export async function assertPilotUxPatronOnboardingWalkthroughAccount(
  prisma: PrismaClient,
  accountId: string
): Promise<{
  accountId: string;
  platformMembershipId: string;
  patronMembershipIds: string[];
}> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { legacyFileId: true, primaryRelayCreatorId: true }
  });
  if (
    account?.legacyFileId !== PILOT_UX_PATRON_ONBOARDING_LEGACY_FILE_ID ||
    account.primaryRelayCreatorId !== null
  ) {
    throw new PilotUxWalkthroughForbiddenError(
      "Not the pilot UX patron onboarding walkthrough account."
    );
  }

  const memberships = await prisma.tenantMembership.findMany({
    where: { accountId, role: TenantRole.patron },
    select: { id: true, tenant: { select: { relayCreatorId: true } } }
  });
  const platformMembership = memberships.find(
    (row) => row.tenant.relayCreatorId === getPlatformRelayCreatorId()
  );
  if (!platformMembership) {
    throw new PilotUxWalkthroughForbiddenError(
      "Patron onboarding walkthrough membership is missing."
    );
  }
  return {
    accountId,
    platformMembershipId: platformMembership.id,
    patronMembershipIds: memberships.map((row) => row.id)
  };
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

/** Rewind supporter onboarding state for the faux patron walkthrough account. */
export async function resetPilotUxPatronOnboardingWalkthrough(
  prisma: PrismaClient,
  args: {
    accountId: string;
    platformMembershipId: string;
    patronMembershipIds: string[];
  }
): Promise<void> {
  if (!args.accountId.trim()) {
    throw new PilotUxWalkthroughForbiddenError(
      "Patron onboarding walkthrough account id is missing."
    );
  }
  if (!args.platformMembershipId.trim()) {
    throw new PilotUxWalkthroughForbiddenError(
      "Patron onboarding walkthrough membership is missing."
    );
  }
  const membershipIds = args.patronMembershipIds.filter((id) => id.trim().length > 0);
  await prisma.$transaction(async (tx) => {
    await tx.patronOAuthCredential.deleteMany({ where: { accountId: args.accountId } });

    await tx.account.update({
      where: { id: args.accountId },
      data: {
        username: PILOT_UX_PATRON_ONBOARDING_HANDLE,
        usernameNorm: PILOT_UX_PATRON_ONBOARDING_HANDLE,
        patronPatreonUserId: null,
        identityAuthProvider: IdentityAuthProvider.independent,
        primaryRelayCreatorId: null
      }
    });

    if (membershipIds.length > 0) {
      await tx.tenantMembership.updateMany({
        where: { id: { in: membershipIds }, role: TenantRole.patron },
        data: { tierIds: [] }
      });
      await tx.patronFollow.deleteMany({
        where: { patronMembershipId: { in: membershipIds } }
      });
      await tx.patronFollowSeed.deleteMany({
        where: { patronMembershipId: { in: membershipIds } }
      });
      await tx.patronEntitlementSnapshot.deleteMany({
        where: { patronMembershipId: { in: membershipIds } }
      });
      await tx.notificationDigestRun.deleteMany({
        where: { patronMembershipId: { in: membershipIds } }
      });
    }

    await tx.patronProfile.upsert({
      where: { tenantMembershipId: args.platformMembershipId },
      create: {
        tenantMembershipId: args.platformMembershipId,
        handle: PILOT_UX_PATRON_ONBOARDING_HANDLE,
        handleNorm: PILOT_UX_PATRON_ONBOARDING_HANDLE,
        displayName: PILOT_UX_PATRON_ONBOARDING_DISPLAY_NAME,
        bio: null,
        avatarUrl: null,
        bannerUrl: null,
        isPublic: false,
        onboardingStep: 0,
        notificationDigestEnabled: true,
        notificationDigestCadence: "weekly",
        notificationDigestSlot: null,
        notificationDigestTimezone: null,
        hideMatureContent: false
      },
      update: {
        handle: PILOT_UX_PATRON_ONBOARDING_HANDLE,
        handleNorm: PILOT_UX_PATRON_ONBOARDING_HANDLE,
        displayName: PILOT_UX_PATRON_ONBOARDING_DISPLAY_NAME,
        bio: null,
        avatarUrl: null,
        bannerUrl: null,
        isPublic: false,
        onboardingStep: 0,
        notificationDigestEnabled: true,
        notificationDigestCadence: "weekly",
        notificationDigestSlot: null,
        notificationDigestTimezone: null,
        hideMatureContent: false
      }
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

export type PilotUxWalkthroughMediaPost = {
  postId: string;
  title: string;
  description: string;
  isPublic: boolean;
  tierIds: readonly string[];
  mediaType: "photo";
  mediaId: string;
};

/** Faux imported library for Step 5 review modal — no Patreon scrape or extension required. */
export const PILOT_UX_ONBOARDING_WALKTHROUGH_MEDIA_POSTS: readonly PilotUxWalkthroughMediaPost[] =
  [
    {
      postId: "pilot_post_onboarding_public_sketch",
      title: "Public sketch — onboarding walkthrough",
      description: "Free preview piece for promo slot testing.",
      isPublic: true,
      tierIds: [],
      mediaType: "photo",
      mediaId: "pilot_media_onboarding_public_sketch"
    },
    {
      postId: "pilot_post_onboarding_sunset_study",
      title: "Sunset study",
      description: "Supporter-tier landscape for search/filter checks.",
      isPublic: false,
      tierIds: ["patreon_tier_onboarding_supporter"],
      mediaType: "photo",
      mediaId: "pilot_media_onboarding_sunset"
    },
    {
      postId: "pilot_post_onboarding_forest_path",
      title: "Forest path",
      description: "Another Supporter piece with distinct title keywords.",
      isPublic: false,
      tierIds: ["patreon_tier_onboarding_supporter"],
      mediaType: "photo",
      mediaId: "pilot_media_onboarding_forest"
    },
    {
      postId: "pilot_post_onboarding_studio_wip",
      title: "Studio WIP render",
      description: "Studio-tier work-in-progress for tier chip filtering.",
      isPublic: false,
      tierIds: ["patreon_tier_onboarding_studio"],
      mediaType: "photo",
      mediaId: "pilot_media_onboarding_studio_wip"
    },
    {
      postId: "pilot_post_onboarding_promo_teaser",
      title: "Promo teaser frame",
      description: "Strong candidate for slot #1 in the review modal.",
      isPublic: false,
      tierIds: ["patreon_tier_onboarding_supporter"],
      mediaType: "photo",
      mediaId: "pilot_media_onboarding_promo"
    },
    {
      postId: "pilot_post_onboarding_character_sheet",
      title: "Character sheet",
      description: "Multi-keyword title for unified search smoke tests.",
      isPublic: false,
      tierIds: ["patreon_tier_onboarding_supporter"],
      mediaType: "photo",
      mediaId: "pilot_media_onboarding_character"
    }
  ] as const;

function pilotWalkthroughStorageKey(creatorId: string, mediaId: string): string {
  return `pilot-ux/${creatorId}/${mediaId}/asset`;
}

function pilotWalkthroughExportSha256(mediaId: string): string {
  return createHash("sha256").update(`pilot-ux-walkthrough:${mediaId}`).digest("hex");
}

async function upsertPilotUxWalkthroughMediaCatalog(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<number> {
  await ensurePilotUxOnboardingWalkthroughTiers(prisma, relayCreatorId);

  for (const post of PILOT_UX_ONBOARDING_WALKTHROUGH_MEDIA_POSTS) {
    const requiredTierId =
      post.tierIds.length === 1 ? post.tierIds[0]! : post.tierIds.length > 1 ? post.tierIds[0]! : null;

    await prisma.post.upsert({
      where: { id: post.postId },
      create: {
        id: post.postId,
        campaignId: PILOT_UX_ONBOARDING_CAMPAIGN_ID,
        creatorId: relayCreatorId,
        providerPostId: post.postId,
        source: PostSource.PATREON,
        upstreamStatus: PostUpstreamStatus.active,
        createdAt: WALKTHROUGH_SEED_NOW,
        isPublic: post.isPublic,
        requiredTierId: post.isPublic ? null : requiredTierId
      },
      update: {
        campaignId: PILOT_UX_ONBOARDING_CAMPAIGN_ID,
        upstreamStatus: PostUpstreamStatus.active,
        isPublic: post.isPublic,
        requiredTierId: post.isPublic ? null : requiredTierId
      }
    });

    await prisma.postVersion.upsert({
      where: {
        postId_versionSeq: { postId: post.postId, versionSeq: 1 }
      },
      create: {
        postId: post.postId,
        versionSeq: 1,
        upstreamRevision: "pilot-ux-walkthrough-v1",
        title: post.title,
        description: post.description,
        publishedAt: WALKTHROUGH_SEED_NOW,
        tagIds: [],
        tierIds: [...post.tierIds],
        mediaIds: [post.mediaId],
        ingestedAt: WALKTHROUGH_SEED_NOW
      },
      update: {
        title: post.title,
        description: post.description,
        tierIds: [...post.tierIds],
        mediaIds: [post.mediaId],
        ingestedAt: WALKTHROUGH_SEED_NOW
      }
    });

    await prisma.postTier.deleteMany({ where: { postId: post.postId } });
    if (post.tierIds.length > 0) {
      await prisma.postTier.createMany({
        data: post.tierIds.map((tid) => ({
          postId: post.postId,
          tierId: tierStableId(relayCreatorId, tid)
        }))
      });
    }

    const mime = mediaMimeForPilotPost(post.mediaType);
    const storageKey = pilotWalkthroughStorageKey(relayCreatorId, post.mediaId);
    await prisma.mediaAsset.upsert({
      where: { id: post.mediaId },
      create: {
        id: post.mediaId,
        creatorId: relayCreatorId,
        postIds: [post.postId],
        primaryPostId: post.postId,
        upstreamStatus: MediaUpstreamStatus.active,
        currentVersionSeq: 1,
        currentUpstreamRevision: "pilot-ux-walkthrough-v1",
        currentMimeType: mime,
        currentUpstreamUrl: null,
        currentStorageKey: storageKey,
        currentIngestedAt: WALKTHROUGH_SEED_NOW,
        versionsJson: [],
        ingestOrigin: MediaIngestOrigin.PATREON,
        processingStatus: MediaProcessingStatus.READY
      },
      update: {
        primaryPostId: post.postId,
        postIds: [post.postId],
        currentMimeType: mime,
        currentStorageKey: storageKey,
        upstreamStatus: MediaUpstreamStatus.active,
        processingStatus: MediaProcessingStatus.READY
      }
    });
  }

  return PILOT_UX_ONBOARDING_WALKTHROUGH_MEDIA_POSTS.length;
}

async function upsertPilotUxWalkthroughExportIndex(
  exportIndex: FileExportIndex,
  relayCreatorId: string
): Promise<number> {
  const index: CreatorExportIndex = await exportIndex.load(relayCreatorId);
  index.creator_id = relayCreatorId;
  index.media ??= {};

  const exportedAt = new Date().toISOString();
  for (const post of PILOT_UX_ONBOARDING_WALKTHROUGH_MEDIA_POSTS) {
    const storageKey = pilotWalkthroughStorageKey(relayCreatorId, post.mediaId);
    const record: ExportMediaRecord = {
      media_id: post.mediaId,
      creator_id: relayCreatorId,
      sha256: pilotWalkthroughExportSha256(post.mediaId),
      byte_length: 4096,
      relative_blob_path: storageKey,
      upstream_revision: "pilot-ux-walkthrough-v1",
      mime_type: mediaMimeForPilotPost(post.mediaType),
      exported_at: exportedAt
    };
    index.media[post.mediaId] = record;
  }

  await exportIndex.save(index);
  return Object.keys(index.media).length;
}

export type SimulatePilotUxMediaImportResult = {
  posts_written: number;
  export_media_count: number;
  media_ids: string[];
};

/**
 * Fake a successful media import for the walkthrough account (no extension, no Patreon scrape).
 * Seeds catalog rows, export index entries, and sync health so Step 5 reaches `review_library`.
 */
export async function simulatePilotUxMediaImport(
  prisma: PrismaClient,
  exportIndex: FileExportIndex,
  relayCreatorId: string
): Promise<SimulatePilotUxMediaImportResult> {
  if (relayCreatorId !== PILOT_UX_ONBOARDING_RELAY_CREATOR_ID) {
    throw new PilotUxWalkthroughForbiddenError();
  }

  const postsWritten = await upsertPilotUxWalkthroughMediaCatalog(prisma, relayCreatorId);
  const exportMediaCount = await upsertPilotUxWalkthroughExportIndex(
    exportIndex,
    relayCreatorId
  );

  const syncHealth = new DbPatreonSyncHealthStore(prisma);
  await syncHealth.recordPostScrapeSuccess({
    creator_id: relayCreatorId,
    patreon_campaign_id: PILOT_UX_ONBOARDING_PATREON_CAMPAIGN_ID,
    posts_fetched: postsWritten,
    posts_written: postsWritten,
    warnings: []
  });

  await ensureCreatorOnboardingAtLeastImportStarted(prisma, relayCreatorId);

  return {
    posts_written: postsWritten,
    export_media_count: exportMediaCount,
    media_ids: PILOT_UX_ONBOARDING_WALKTHROUGH_MEDIA_POSTS.map((p) => p.mediaId)
  };
}
