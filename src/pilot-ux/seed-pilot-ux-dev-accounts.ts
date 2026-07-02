/**
 * PUX-000 — deterministic Postgres seed for faux creators + patrons.
 * No Patreon OAuth/API calls. Idempotent upserts into canonical Prisma tables.
 */
import {
  EntitlementSource,
  IdentityAuthProvider,
  MediaIngestOrigin,
  MediaProcessingStatus,
  MediaUpstreamStatus,
  PatronFollowSeedSource,
  PostSource,
  PostUpstreamStatus,
  PublicSlugSource,
  TenantRole,
  UserKind,
  type PrismaClient
} from "@prisma/client";
import {
  PILOT_UX_ONBOARDING_PUBLIC_SLUG
} from "./pilot-ux-onboarding-walkthrough.js";
import { tierStableId } from "../ingest/canonical-store-db.js";
import { hashPassword } from "../identity/password.js";
import { getPlatformRelayCreatorId } from "../identity/platform-tenant.js";
import { upsertPatronEntitlementSnapshot } from "../identity/patron-entitlement-snapshot.js";
import { upsertPatronFollowsForMembership } from "../patron/patron-follow-service.js";
import { runPatronInitialFollowSeed } from "../patron/patron-initial-follow-seed.js";
import {
  defaultPilotUxSeedFixturePath,
  loadPilotUxSeedSpec,
  mediaMimeForPilotPost,
  resolvePilotUxDevPassword,
  type PilotUxSeedCreator,
  type PilotUxSeedSpec
} from "./pilot-ux-seed-spec.js";

export type SeedPilotUxDevAccountsResult = {
  specPath: string;
  creators: Array<{ relayCreatorId: string; accountId: string }>;
  patron: { accountId: string; membershipId: string };
  patronOnboarding?: { accountId: string; membershipId: string };
  counts: {
    tiers: number;
    posts: number;
    mediaAssets: number;
    patronFollows: number;
    entitlementSnapshots: number;
  };
};

const SEED_NOW = new Date("2026-05-20T12:00:00.000Z");
const PILOT_UX_DEV_ENTITLEMENT_STALE_AFTER = new Date("2099-01-01T00:00:00.000Z");

function pilotStorageKey(creatorId: string, mediaId: string): string {
  return `pilot-ux/${creatorId}/${mediaId}/asset`;
}

async function upsertCreatorStudio(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  spec: PilotUxSeedSpec,
  creator: PilotUxSeedCreator,
  password: string
): Promise<{ accountId: string }> {
  const acctSpec = spec.accounts[creator.accountKey];
  if (!acctSpec) {
    throw new Error(`Missing account spec for ${creator.accountKey}`);
  }
  const emailNorm = acctSpec.email.toLowerCase().trim();

  const tenant = await tx.tenant.upsert({
    where: { relayCreatorId: creator.relayCreatorId },
    create: { relayCreatorId: creator.relayCreatorId },
    update: {}
  });

  let account = await tx.account.findFirst({
    where: {
      OR: [{ legacyFileId: acctSpec.legacyFileId }, { emailNorm }]
    }
  });

  if (account) {
    account = await tx.account.update({
      where: { id: account.id },
      data: {
        emailNorm,
        username: acctSpec.publicSlug ?? creator.accountKey,
        usernameNorm: (acctSpec.publicSlug ?? creator.accountKey).toLowerCase(),
        legacyFileId: acctSpec.legacyFileId,
        passwordHash: hashPassword(password),
        identityAuthProvider: IdentityAuthProvider.independent,
        primaryRelayCreatorId: creator.relayCreatorId
      }
    });
  } else {
    account = await tx.account.create({
      data: {
        emailNorm,
        username: acctSpec.publicSlug ?? creator.accountKey,
        usernameNorm: (acctSpec.publicSlug ?? creator.accountKey).toLowerCase(),
        legacyFileId: acctSpec.legacyFileId,
        passwordHash: hashPassword(password),
        identityAuthProvider: IdentityAuthProvider.independent,
        primaryRelayCreatorId: creator.relayCreatorId
      }
    });
  }

  const user =
    (await tx.user.findFirst({
      where: { tenantId: tenant.id, kind: UserKind.creator }
    })) ??
    (await tx.user.create({
      data: {
        tenantId: tenant.id,
        kind: UserKind.creator,
        identityAuthProvider: IdentityAuthProvider.independent,
        tierIds: []
      }
    }));

  const isWalkthrough = creator.onboardingWalkthrough === true;
  const profileSlug = acctSpec.publicSlug ?? creator.accountKey;
  await tx.creatorProfile.upsert({
    where: { userId: user.id },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      publicSlug: isWalkthrough ? PILOT_UX_ONBOARDING_PUBLIC_SLUG : profileSlug,
      slugSource: PublicSlugSource.allocated,
      username: isWalkthrough ? null : profileSlug,
      usernameNorm: isWalkthrough ? null : profileSlug.toLowerCase(),
      displayName: isWalkthrough ? null : acctSpec.displayName,
      discipline: isWalkthrough ? null : (acctSpec.discipline ?? null),
      patreonCampaignId: isWalkthrough ? null : creator.patreonCampaignId
    },
    update: isWalkthrough
      ? {
          publicSlug: PILOT_UX_ONBOARDING_PUBLIC_SLUG,
          slugSource: PublicSlugSource.allocated,
          displayName: null,
          avatarUrl: null,
          bannerUrl: null,
          bio: null,
          discipline: null,
          username: null,
          usernameNorm: null,
          patreonCampaignId: null,
          subscribestarProfileId: null
        }
      : {
          displayName: acctSpec.displayName,
          username: profileSlug,
          usernameNorm: profileSlug.toLowerCase(),
          discipline: acctSpec.discipline ?? null,
          patreonCampaignId: creator.patreonCampaignId
        }
  });

  if (isWalkthrough) {
    await tx.creatorOnboardingState.upsert({
      where: { creatorId: creator.relayCreatorId },
      create: { creatorId: creator.relayCreatorId, step: "connected" },
      update: { step: "connected" }
    });
  }

  await tx.campaign.upsert({
    where: { id: creator.campaignId },
    create: {
      id: creator.campaignId,
      creatorId: creator.relayCreatorId,
      name: creator.campaignName,
      upstreamUpdatedAt: SEED_NOW,
      versionSeq: 1
    },
    update: {
      name: creator.campaignName,
      upstreamUpdatedAt: SEED_NOW,
      versionSeq: 1
    }
  });

  for (const tier of creator.tiers) {
    const id = tierStableId(creator.relayCreatorId, tier.relayTierId);
    await tx.tier.upsert({
      where: { id },
      create: {
        id,
        creatorId: creator.relayCreatorId,
        relayTierId: tier.relayTierId,
        providerTierId: tier.relayTierId,
        campaignId: creator.campaignId,
        title: tier.title,
        amountCents: tier.amountCents,
        upstreamUpdatedAt: SEED_NOW,
        versionSeq: 1
      },
      update: {
        title: tier.title,
        amountCents: tier.amountCents,
        campaignId: creator.campaignId,
        upstreamUpdatedAt: SEED_NOW,
        versionSeq: 1
      }
    });
  }

  for (const post of creator.posts) {
    const requiredTierId =
      post.tierIds.length === 1 ? post.tierIds[0]! : post.tierIds.length > 1 ? post.tierIds[0]! : null;

    await tx.post.upsert({
      where: { id: post.postId },
      create: {
        id: post.postId,
        campaignId: creator.campaignId,
        creatorId: creator.relayCreatorId,
        providerPostId: post.postId,
        source: PostSource.PATREON,
        upstreamStatus: PostUpstreamStatus.active,
        createdAt: SEED_NOW,
        isPublic: post.isPublic,
        requiredTierId: post.isPublic ? null : requiredTierId
      },
      update: {
        campaignId: creator.campaignId,
        upstreamStatus: PostUpstreamStatus.active,
        isPublic: post.isPublic,
        requiredTierId: post.isPublic ? null : requiredTierId
      }
    });

    await tx.postVersion.upsert({
      where: {
        postId_versionSeq: { postId: post.postId, versionSeq: 1 }
      },
      create: {
        postId: post.postId,
        versionSeq: 1,
        upstreamRevision: "pilot-ux-v1",
        title: post.title,
        description: post.description,
        publishedAt: SEED_NOW,
        tagIds: [],
        tierIds: [...post.tierIds],
        mediaIds: [post.mediaId],
        ingestedAt: SEED_NOW
      },
      update: {
        title: post.title,
        description: post.description,
        tierIds: [...post.tierIds],
        mediaIds: [post.mediaId],
        ingestedAt: SEED_NOW
      }
    });

    await tx.postTier.deleteMany({ where: { postId: post.postId } });
    if (post.tierIds.length > 0) {
      await tx.postTier.createMany({
        data: post.tierIds.map((tid) => ({
          postId: post.postId,
          tierId: tierStableId(creator.relayCreatorId, tid)
        }))
      });
    }

    const mime = mediaMimeForPilotPost(post.mediaType);
    const storageKey = pilotStorageKey(creator.relayCreatorId, post.mediaId);
    await tx.mediaAsset.upsert({
      where: { id: post.mediaId },
      create: {
        id: post.mediaId,
        creatorId: creator.relayCreatorId,
        postIds: [post.postId],
        primaryPostId: post.postId,
        upstreamStatus: MediaUpstreamStatus.active,
        currentVersionSeq: 1,
        currentUpstreamRevision: "pilot-ux-v1",
        currentMimeType: mime,
        currentUpstreamUrl: null,
        currentStorageKey: storageKey,
        currentIngestedAt: SEED_NOW,
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

  return { accountId: account.id };
}

async function upsertPatron(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  spec: PilotUxSeedSpec,
  password: string,
  options?: { accountKey?: string; seedGraph?: boolean }
): Promise<{ accountId: string; membershipId: string }> {
  const accountKey = options?.accountKey?.trim() || spec.patron.accountKey;
  const seedGraph = options?.seedGraph ?? accountKey === spec.patron.accountKey;
  const acctSpec = spec.accounts[accountKey];
  if (!acctSpec) {
    throw new Error(`Missing patron account spec for ${accountKey}`);
  }
  const emailNorm = acctSpec.email.toLowerCase().trim();
  const platformCreatorId = getPlatformRelayCreatorId();

  const platformTenant = await tx.tenant.upsert({
    where: { relayCreatorId: platformCreatorId },
    create: { relayCreatorId: platformCreatorId },
    update: {}
  });

  let account = await tx.account.findFirst({
    where: {
      OR: [{ legacyFileId: acctSpec.legacyFileId }, { emailNorm }]
    }
  });

  if (account) {
    account = await tx.account.update({
      where: { id: account.id },
      data: {
        emailNorm,
        username: acctSpec.handle ?? acctSpec.legacyFileId,
        usernameNorm: (acctSpec.handle ?? acctSpec.legacyFileId).toLowerCase(),
        legacyFileId: acctSpec.legacyFileId,
        passwordHash: hashPassword(password),
        identityAuthProvider: IdentityAuthProvider.independent,
        primaryRelayCreatorId: null
      }
    });
  } else {
    account = await tx.account.create({
      data: {
        emailNorm,
        username: acctSpec.handle ?? acctSpec.legacyFileId,
        usernameNorm: (acctSpec.handle ?? acctSpec.legacyFileId).toLowerCase(),
        legacyFileId: acctSpec.legacyFileId,
        passwordHash: hashPassword(password),
        identityAuthProvider: IdentityAuthProvider.independent
      }
    });
  }

  const membership = await tx.tenantMembership.upsert({
    where: {
      accountId_tenantId: { accountId: account.id, tenantId: platformTenant.id }
    },
    create: {
      accountId: account.id,
      tenantId: platformTenant.id,
      role: TenantRole.patron,
      tierIds: []
    },
    update: { role: TenantRole.patron }
  });

  const handleNorm = (acctSpec.handle ?? acctSpec.legacyFileId).toLowerCase();
  await tx.patronProfile.upsert({
    where: { tenantMembershipId: membership.id },
    create: {
      tenantMembershipId: membership.id,
      handle: acctSpec.handle ?? acctSpec.legacyFileId,
      handleNorm,
      displayName: acctSpec.displayName
    },
    update: {
      handle: acctSpec.handle ?? acctSpec.legacyFileId,
      handleNorm,
      displayName: acctSpec.displayName
    }
  });

  if (seedGraph) {
    const existingSeed = await tx.patronFollowSeed.findFirst({
      where: {
        patronMembershipId: membership.id,
        source: PatronFollowSeedSource.initial_follow_worker
      }
    });
    if (!existingSeed) {
      await runPatronInitialFollowSeed({
        prisma: tx as unknown as PrismaClient,
        patronMembershipId: membership.id,
        relayCreatorIds: spec.patron.followRelayCreatorIds,
        source: PatronFollowSeedSource.initial_follow_worker
      });
    } else {
      await upsertPatronFollowsForMembership(
        tx as unknown as PrismaClient,
        membership.id,
        spec.patron.followRelayCreatorIds
      );
    }

    for (const ent of spec.patron.entitlements) {
      await upsertPatronEntitlementSnapshot(tx, {
        patronMembershipId: membership.id,
        relayCreatorId: ent.relayCreatorId,
        entitledTierIds: [...ent.entitledTierIds],
        source: EntitlementSource.manual_support,
        campaignId:
          spec.creators.find((c) => c.relayCreatorId === ent.relayCreatorId)?.patreonCampaignId ??
          null,
        now: SEED_NOW
      });
      await tx.patronEntitlementSnapshot.update({
        where: {
          patronMembershipId_relayCreatorId: {
            patronMembershipId: membership.id,
            relayCreatorId: ent.relayCreatorId
          }
        },
        data: { staleAfter: PILOT_UX_DEV_ENTITLEMENT_STALE_AFTER }
      });
    }
  } else {
    await tx.patronFollow.deleteMany({ where: { patronMembershipId: membership.id } });
    await tx.patronFollowSeed.deleteMany({ where: { patronMembershipId: membership.id } });
    await tx.patronEntitlementSnapshot.deleteMany({ where: { patronMembershipId: membership.id } });
  }

  return { accountId: account.id, membershipId: membership.id };
}

/** Remove integration-test RELAY posts (and other non-fixture rows) from pilot dev creators. */
async function purgeExtraneousPilotDevCatalogPosts(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  spec: ReturnType<typeof loadPilotUxSeedSpec>
): Promise<void> {
  const creatorIds = spec.creators.map((c) => c.relayCreatorId);
  const seedPostIds = spec.creators.flatMap((c) => c.posts.map((p) => p.postId));
  if (creatorIds.length === 0 || seedPostIds.length === 0) {
    return;
  }

  const stray = await tx.post.findMany({
    where: {
      creatorId: { in: creatorIds },
      id: { notIn: seedPostIds }
    },
    select: { id: true }
  });
  if (stray.length === 0) {
    return;
  }

  const strayIds = stray.map((p) => p.id);
  await tx.mediaAsset.deleteMany({
    where: {
      OR: [
        { primaryPostId: { in: strayIds } },
        { postIds: { hasSome: strayIds } }
      ]
    }
  });
  await tx.postVersion.deleteMany({ where: { postId: { in: strayIds } } });
  await tx.post.deleteMany({ where: { id: { in: strayIds } } });

  await tx.postOverride.deleteMany({
    where: { creatorId: { in: creatorIds } }
  });
}

/**
 * Idempotent seed of pilot UX dev accounts into Postgres.
 */
export async function seedPilotUxDevAccounts(
  prisma: PrismaClient,
  options?: { fixturePath?: string }
): Promise<SeedPilotUxDevAccountsResult> {
  const specPath = options?.fixturePath?.trim() || undefined;
  const spec = loadPilotUxSeedSpec(specPath);
  const password = resolvePilotUxDevPassword(spec);

  const creators: SeedPilotUxDevAccountsResult["creators"] = [];
  let tierCount = 0;
  let postCount = 0;
  let mediaCount = 0;
  let patron!: { accountId: string; membershipId: string };
  let patronOnboarding: { accountId: string; membershipId: string } | undefined;

  const resolvedSpecPath = specPath?.trim() || defaultPilotUxSeedFixturePath();

  await prisma.$transaction(
    async (tx) => {
      for (const creator of spec.creators) {
        const row = await upsertCreatorStudio(tx, spec, creator, password);
        creators.push({
          relayCreatorId: creator.relayCreatorId,
          accountId: row.accountId
        });
        tierCount += creator.tiers.length;
        postCount += creator.posts.length;
        mediaCount += creator.posts.length;
      }
      patron = await upsertPatron(tx, spec, password, {
        accountKey: spec.patron.accountKey,
        seedGraph: true
      });
      const patronOnboardingKey = spec.patronOnboarding?.accountKey?.trim();
      if (patronOnboardingKey) {
        patronOnboarding = await upsertPatron(tx, spec, password, {
          accountKey: patronOnboardingKey,
          seedGraph: false
        });
      }
      await purgeExtraneousPilotDevCatalogPosts(tx, spec);
    },
    { maxWait: 15_000, timeout: 120_000 }
  );

  const followCount = await prisma.patronFollow.count({
    where: { patronMembershipId: patron.membershipId }
  });
  const snapCount = await prisma.patronEntitlementSnapshot.count({
    where: { patronMembershipId: patron.membershipId }
  });

  return {
    specPath: resolvedSpecPath,
    creators,
    patron,
    patronOnboarding,
    counts: {
      tiers: tierCount,
      posts: postCount,
      mediaAssets: mediaCount,
      patronFollows: followCount,
      entitlementSnapshots: snapCount
    }
  };
}

/** Drop non-fixture catalog rows on pilot dev creators (integration-test cleanup). */
export async function purgeExtraneousPilotUxDevCatalogPosts(
  prisma: PrismaClient,
  options?: { fixturePath?: string }
): Promise<void> {
  const specPath = options?.fixturePath?.trim() || undefined;
  const spec = loadPilotUxSeedSpec(specPath);
  await prisma.$transaction(
    async (tx) => {
      await purgeExtraneousPilotDevCatalogPosts(tx, spec);
    },
    { maxWait: 15_000, timeout: 120_000 }
  );
}
