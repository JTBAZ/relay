/**
 * Studio Lab 2 corpus seed — apply / status / cleanup / eval (RC-P2-T02, RC-P2-T03).
 * Dedicated creator rcx_studio_lab2 only. Refuses production. Requires RELAY_ALLOW_STUDIO_LAB2_SEED=1.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  IdentityAuthProvider,
  MediaIngestOrigin,
  MediaProcessingStatus,
  MediaUpstreamStatus,
  PostPublishState,
  PostSource,
  PostUpstreamStatus,
  PublicSlugSource,
  UserKind,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { ingestPatreonInsightsCsv } from "../../analytics/patreon-insights-csv.js";
import { FileCollectionsStore } from "../../gallery/collections-store.js";
import { GOALS_LAB_SYNTHETIC_LABEL } from "../../goal-cycle/planner/goals-lab-synthetic-metrics.js";
import { hashPassword } from "../../identity/password.js";
import { tierStableId } from "../../ingest/canonical-store-db.js";
import {
  STUDIO_LAB2_ACCOUNT_KEY,
  STUDIO_LAB2_CAMPAIGN_ID,
  STUDIO_LAB2_CREATOR_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_POST_IDS,
  STUDIO_LAB2_DEFAULT_COLLECTION_TITLE,
  STUDIO_LAB2_DEFAULT_DEV_PASSWORD,
  STUDIO_LAB2_DEV_PASSWORD_ENV,
  STUDIO_LAB2_EMAIL,
  STUDIO_LAB2_LABEL,
  STUDIO_LAB2_TIER_ID,
  defaultStudioLab2CorpusPath,
  loadStudioLab2Corpus,
  type StudioLab2Corpus,
  type StudioLab2MetricPattern
} from "./corpus-spec.js";

export const STUDIO_LAB2_METRIC_SNAPSHOT_PREFIX = "sl2syn_" as const;
export const STUDIO_LAB2_DIST_PLAN_PREFIX = "sl2_plan_" as const;

export type StudioLab2SeedStatus = {
  email: string;
  creator_id: string | null;
  account_id: string | null;
  label: typeof STUDIO_LAB2_LABEL;
  fixture_hash: string | null;
  post_count: number;
  media_count: number;
  collection_count: number;
  distribution_posted_x: number;
  metric_rows: number;
  metrics_label: string | null;
};

export type StudioLab2EvalResult = {
  ok: boolean;
  errors: string[];
  status: StudioLab2SeedStatus;
  fixture_hash: string;
};

function assertStudioLab2SeedEnv(env: NodeJS.ProcessEnv = process.env): void {
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();
  if (nodeEnv === "production") {
    throw new Error(
      "Refusing Studio Lab 2 seed in production. RELAY_ALLOW_STUDIO_LAB2_SEED cannot override NODE_ENV=production."
    );
  }
  const raw = (env.RELAY_ALLOW_STUDIO_LAB2_SEED ?? "").trim().toLowerCase();
  if (raw !== "1" && raw !== "true" && raw !== "yes" && raw !== "on") {
    throw new Error(
      "Refusing Studio Lab 2 seed without explicit opt-in. Set RELAY_ALLOW_STUDIO_LAB2_SEED=1."
    );
  }
  if (!env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for Studio Lab 2 seed.");
  }
}

export function resolveStudioLab2DevPassword(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[STUDIO_LAB2_DEV_PASSWORD_ENV]?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : STUDIO_LAB2_DEFAULT_DEV_PASSWORD;
}

function metricValues(pattern: StudioLab2MetricPattern): {
  impressions: number;
  seen: number;
  likes: number;
  comments: number;
} {
  switch (pattern) {
    case "timing_cluster":
      return { impressions: 5100, seen: 3400, likes: 70, comments: 22 };
    case "weak_promo":
      return { impressions: 900, seen: 400, likes: 8, comments: 1 };
    case "forbidden_primary":
      return { impressions: 65000, seen: 40000, likes: 2, comments: 0 };
    default:
      return { impressions: 2200, seen: 1400, likes: 28, comments: 5 };
  }
}

async function upsertIdentity(
  prisma: PrismaClient,
  spec: StudioLab2Corpus,
  password: string
): Promise<{ accountId: string }> {
  const emailNorm = spec.creator.email.toLowerCase().trim();
  const username = spec.creator.accountKey;
  const tenant = await prisma.tenant.upsert({
    where: { relayCreatorId: spec.creator.relayCreatorId },
    create: { relayCreatorId: spec.creator.relayCreatorId },
    update: {}
  });

  let account = await prisma.account.findFirst({
    where: {
      OR: [{ legacyFileId: username }, { emailNorm }]
    }
  });
  const passwordHash = hashPassword(password);
  if (account) {
    account = await prisma.account.update({
      where: { id: account.id },
      data: {
        emailNorm,
        username,
        usernameNorm: username.toLowerCase(),
        legacyFileId: username,
        passwordHash,
        identityAuthProvider: IdentityAuthProvider.independent,
        primaryRelayCreatorId: spec.creator.relayCreatorId
      }
    });
  } else {
    account = await prisma.account.create({
      data: {
        emailNorm,
        username,
        usernameNorm: username.toLowerCase(),
        legacyFileId: username,
        passwordHash,
        identityAuthProvider: IdentityAuthProvider.independent,
        primaryRelayCreatorId: spec.creator.relayCreatorId
      }
    });
  }

  const user =
    (await prisma.user.findFirst({
      where: { tenantId: tenant.id, kind: UserKind.creator }
    })) ??
    (await prisma.user.create({
      data: {
        tenantId: tenant.id,
        kind: UserKind.creator,
        identityAuthProvider: IdentityAuthProvider.independent,
        tierIds: [],
        legacyFileId: username
      }
    }));

  await prisma.creatorProfile.upsert({
    where: { userId: user.id },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      publicSlug: username,
      slugSource: PublicSlugSource.allocated,
      username,
      usernameNorm: username.toLowerCase(),
      displayName: spec.creator.displayName,
      patreonCampaignId: spec.creator.campaignId
    },
    update: {
      displayName: spec.creator.displayName,
      username,
      usernameNorm: username.toLowerCase(),
      publicSlug: username,
      patreonCampaignId: spec.creator.campaignId
    }
  });

  return { accountId: account.id };
}

async function resetCommandOwnedRows(prisma: PrismaClient, creatorId: string): Promise<void> {
  await prisma.libraryCollection.deleteMany({ where: { creatorId } });
  await prisma.creatorScheduleEvent.deleteMany({ where: { creatorId } });
  await prisma.autopostDraft.deleteMany({ where: { creatorId } });
  await prisma.creativeWork.deleteMany({ where: { creatorId } });
  await prisma.postPresentation.deleteMany({ where: { creatorId } });
  await prisma.externalPostMetricSnapshot.deleteMany({
    where: { creatorId, id: { startsWith: STUDIO_LAB2_METRIC_SNAPSHOT_PREFIX } }
  });
  await prisma.patreonInsightsImport.deleteMany({
    where: { creatorId, label: STUDIO_LAB2_LABEL }
  });
  if ((GOALS_LAB_SYNTHETIC_LABEL as string) === (STUDIO_LAB2_LABEL as string)) {
    throw new Error("Lab 2 metrics label must not equal GOALS_LAB_SYNTHETIC_LABEL.");
  }
}

async function upsertCorpusPosts(prisma: PrismaClient, spec: StudioLab2Corpus): Promise<void> {
  const creatorId = spec.creator.relayCreatorId;
  const campaignId = spec.creator.campaignId;
  const corpusPostIds = spec.posts.map((p) => p.post_id);
  const corpusMediaIds = spec.posts.flatMap((p) => p.media.map((m) => m.media_id));

  await prisma.post.deleteMany({
    where: { creatorId, id: { notIn: corpusPostIds } }
  });
  await prisma.mediaAsset.deleteMany({
    where: { creatorId, id: { notIn: corpusMediaIds } }
  });

  for (const post of spec.posts) {
    const publishedAt = new Date(post.published_at);
    const source = post.source === "RELAY" ? PostSource.RELAY : PostSource.PATREON;
    const ingestOrigin =
      post.source === "RELAY" ? MediaIngestOrigin.RELAY_UPLOAD : MediaIngestOrigin.PATREON;
    const mediaIds = post.media.map((m) => m.media_id);
    const requiredTierId = post.is_public ? null : post.tier_ids[0] ?? STUDIO_LAB2_TIER_ID;

    await prisma.post.upsert({
      where: { id: post.post_id },
      create: {
        id: post.post_id,
        campaignId,
        creatorId,
        providerPostId: source === PostSource.RELAY ? null : post.post_id,
        source,
        upstreamStatus: PostUpstreamStatus.active,
        createdAt: publishedAt,
        isPublic: post.is_public,
        requiredTierId,
        publishState: PostPublishState.published
      },
      update: {
        campaignId,
        source,
        providerPostId: source === PostSource.RELAY ? null : post.post_id,
        upstreamStatus: PostUpstreamStatus.active,
        createdAt: publishedAt,
        isPublic: post.is_public,
        requiredTierId,
        publishState: PostPublishState.published
      }
    });

    await prisma.postVersion.deleteMany({
      where: { postId: post.post_id, versionSeq: { gt: 1 } }
    });
    await prisma.postVersion.upsert({
      where: { postId_versionSeq: { postId: post.post_id, versionSeq: 1 } },
      create: {
        postId: post.post_id,
        versionSeq: 1,
        upstreamRevision: `${STUDIO_LAB2_LABEL}-v1`,
        title: post.title,
        description: post.description,
        publishedAt,
        tagIds: [...post.tag_ids],
        tierIds: [...post.tier_ids],
        mediaIds,
        ingestedAt: publishedAt
      },
      update: {
        title: post.title,
        description: post.description,
        publishedAt,
        tagIds: [...post.tag_ids],
        tierIds: [...post.tier_ids],
        mediaIds,
        ingestedAt: publishedAt
      }
    });

    await prisma.postTier.deleteMany({ where: { postId: post.post_id } });
    if (post.tier_ids.length > 0) {
      await prisma.postTier.createMany({
        data: post.tier_ids.map((tid) => ({
          postId: post.post_id,
          tierId: tierStableId(creatorId, tid)
        }))
      });
    }

    await prisma.postMediaLink.deleteMany({ where: { postId: post.post_id } });
    for (const [i, media] of post.media.entries()) {
      await prisma.mediaAsset.upsert({
        where: { id: media.media_id },
        create: {
          id: media.media_id,
          creatorId,
          postIds: [post.post_id],
          primaryPostId: post.post_id,
          upstreamStatus: MediaUpstreamStatus.active,
          currentVersionSeq: 1,
          currentUpstreamRevision: `${STUDIO_LAB2_LABEL}-v1`,
          currentMimeType: media.mime_type,
          currentUpstreamUrl: null,
          currentRole: media.role,
          currentStorageKey: `studio-lab2/${creatorId}/${media.media_id}/asset`,
          currentIngestedAt: publishedAt,
          versionsJson: [] as Prisma.InputJsonValue,
          ingestOrigin,
          processingStatus: MediaProcessingStatus.READY
        },
        update: {
          primaryPostId: post.post_id,
          postIds: [post.post_id],
          currentMimeType: media.mime_type,
          currentRole: media.role,
          currentStorageKey: `studio-lab2/${creatorId}/${media.media_id}/asset`,
          upstreamStatus: MediaUpstreamStatus.active,
          processingStatus: MediaProcessingStatus.READY,
          ingestOrigin
        }
      });
      await prisma.postMediaLink.create({
        data: {
          postId: post.post_id,
          mediaAssetId: media.media_id,
          sortOrder: i
        }
      });
    }
  }
}

async function upsertBaselineVisualCollection(
  prisma: PrismaClient,
  creatorId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const now = new Date("2025-09-01T12:00:00.000Z");
  await prisma.libraryCollection.upsert({
    where: { id: STUDIO_LAB2_DEFAULT_COLLECTION_ID },
    create: {
      id: STUDIO_LAB2_DEFAULT_COLLECTION_ID,
      creatorId,
      title: STUDIO_LAB2_DEFAULT_COLLECTION_TITLE,
      description: "Baseline Lab 2 home-screen stack of similarly named image posts.",
      coverMediaId: null,
      accessCeilingTierId: null,
      themeTagIds: [],
      sortOrder: 0,
      createdAt: now,
      updatedAt: now
    },
    update: {
      creatorId,
      title: STUDIO_LAB2_DEFAULT_COLLECTION_TITLE,
      description: "Baseline Lab 2 home-screen stack of similarly named image posts.",
      sortOrder: 0
    }
  });
  await prisma.collectionPost.deleteMany({
    where: { collectionId: STUDIO_LAB2_DEFAULT_COLLECTION_ID }
  });
  await prisma.collectionPost.createMany({
    data: STUDIO_LAB2_DEFAULT_COLLECTION_POST_IDS.map((postId, sortIndex) => ({
      collectionId: STUDIO_LAB2_DEFAULT_COLLECTION_ID,
      postId,
      sortIndex
    }))
  });

  const dbCollectionsRaw = (env.RELAY_DB_STORE_COLLECTIONS ?? "").trim().toLowerCase();
  const dbCollectionsOn =
    dbCollectionsRaw === "1" ||
    dbCollectionsRaw === "true" ||
    dbCollectionsRaw === "yes" ||
    dbCollectionsRaw === "on";
  if (!dbCollectionsOn) {
    const filePath = env.RELAY_COLLECTIONS_STORE_PATH?.trim() || ".relay-data/collections.json";
    if (existsSync(filePath)) {
      const fileStore = new FileCollectionsStore(filePath);
      await fileStore.create(
        creatorId,
        STUDIO_LAB2_DEFAULT_COLLECTION_TITLE,
        "Baseline Lab 2 home-screen stack of similarly named image posts.",
        { collection_id: STUDIO_LAB2_DEFAULT_COLLECTION_ID }
      );
      await fileStore.setPostOrder(STUDIO_LAB2_DEFAULT_COLLECTION_ID, [
        ...STUDIO_LAB2_DEFAULT_COLLECTION_POST_IDS
      ]);
      const existing = await fileStore.listForCreator(creatorId);
      const rest = existing
        .map((c) => c.collection_id)
        .filter((id) => id !== STUDIO_LAB2_DEFAULT_COLLECTION_ID);
      await fileStore.reorder(creatorId, [STUDIO_LAB2_DEFAULT_COLLECTION_ID, ...rest]);
    }
  }
}

async function stripLab2FileCollectionsToBaseline(
  creatorId: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  const filePath = env.RELAY_COLLECTIONS_STORE_PATH?.trim() || ".relay-data/collections.json";
  if (!existsSync(filePath)) return;
  const fileStore = new FileCollectionsStore(filePath);
  const existing = await fileStore.listForCreator(creatorId);
  for (const col of existing) {
    if (col.collection_id !== STUDIO_LAB2_DEFAULT_COLLECTION_ID) {
      await fileStore.delete(col.collection_id);
    }
  }
}

/**
 * Lab 2 playground reset: drop command collections/rail/drafts, restore Photo Studies.
 * Does not delete corpus posts. Does not require RELAY_ALLOW_STUDIO_LAB2_SEED.
 * Refuses NODE_ENV=production. Lab 2 creator only.
 */
export async function restoreStudioLab2PlaygroundBaseline(
  prisma: PrismaClient,
  options: { env?: NodeJS.ProcessEnv; creatorId?: string } = {}
): Promise<{
  creator_id: string;
  collection_count: number;
  removed_collection_ids: string[];
}> {
  const env = options.env ?? process.env;
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();
  if (nodeEnv === "production") {
    throw new Error("Refusing Studio Lab 2 playground reset in production.");
  }
  const creatorId = (options.creatorId ?? STUDIO_LAB2_CREATOR_ID).trim();
  if (creatorId !== STUDIO_LAB2_CREATOR_ID) {
    throw new Error("Lab 2 playground reset only operates on rcx_studio_lab2.");
  }

  const existing = await prisma.libraryCollection.findMany({
    where: { creatorId },
    select: { id: true }
  });
  const removed_collection_ids = existing
    .map((row) => row.id)
    .filter((id) => id !== STUDIO_LAB2_DEFAULT_COLLECTION_ID);

  await prisma.libraryCollection.deleteMany({
    where: { creatorId, id: { not: STUDIO_LAB2_DEFAULT_COLLECTION_ID } }
  });
  await prisma.creatorScheduleEvent.deleteMany({
    where: {
      creatorId,
      OR: [{ id: { startsWith: "sl2_evt_" } }, { note: STUDIO_LAB2_LABEL }]
    }
  });
  await prisma.autopostDraft.deleteMany({
    where: {
      creatorId,
      OR: [{ id: { startsWith: "sl2_draft_" } }, { intent: "command_destination_draft" }]
    }
  });

  await stripLab2FileCollectionsToBaseline(creatorId, env);
  await upsertBaselineVisualCollection(prisma, creatorId, env);

  const collection_count = await prisma.libraryCollection.count({ where: { creatorId } });
  return { creator_id: creatorId, collection_count, removed_collection_ids };
}

async function upsertDistribution(prisma: PrismaClient, spec: StudioLab2Corpus): Promise<void> {
  const creatorId = spec.creator.relayCreatorId;
  const keepPlanIds = spec.distribution.map((d) => `${STUDIO_LAB2_DIST_PLAN_PREFIX}${d.post_id}`);
  await prisma.postDistributionPlan.deleteMany({
    where: {
      creatorId,
      ...(keepPlanIds.length > 0 ? { id: { notIn: keepPlanIds } } : {})
    }
  });

  for (const row of spec.distribution) {
    const planId = `${STUDIO_LAB2_DIST_PLAN_PREFIX}${row.post_id}`;
    const variantId = `sl2_var_${row.post_id}_${row.destination}`;
    const attemptId = `sl2_att_${row.post_id}_${row.destination}`;
    const postedAt = new Date("2025-01-15T12:00:00.000Z");
    await prisma.postDistributionPlan.upsert({
      where: { id: planId },
      create: {
        id: planId,
        creatorId,
        postId: row.post_id,
        status: "completed"
      },
      update: { status: "completed", postId: row.post_id }
    });
    await prisma.postDistributionVariant.upsert({
      where: { planId_destination: { planId, destination: row.destination } },
      create: {
        id: variantId,
        planId,
        postId: row.post_id,
        creatorId,
        destination: row.destination,
        status: "posted"
      },
      update: { status: "posted", postId: row.post_id }
    });
    const variant = await prisma.postDistributionVariant.findUniqueOrThrow({
      where: { planId_destination: { planId, destination: row.destination } }
    });
    await prisma.postDistributionAttempt.upsert({
      where: { id: attemptId },
      create: {
        id: attemptId,
        variantId: variant.id,
        postId: row.post_id,
        creatorId,
        destination: row.destination,
        status: row.attempt_status,
        externalUrl: row.external_url,
        externalId: row.external_id,
        startedAt: postedAt,
        completedAt: postedAt
      },
      update: {
        status: row.attempt_status,
        externalUrl: row.external_url,
        externalId: row.external_id,
        completedAt: postedAt
      }
    });
  }
}

function insightsPatreonPostId(postId: string): string {
  const hex = createHash("sha256").update(postId).digest("hex").slice(0, 10);
  const digits = BigInt(`0x${hex}`).toString().slice(0, 12);
  return `patreon_post_${digits}`;
}

async function upsertMetrics(prisma: PrismaClient, spec: StudioLab2Corpus): Promise<void> {
  const creatorId = spec.creator.relayCreatorId;
  const lines = ["Post id,Impressions,Seen,Likes,Comments"];
  for (const row of spec.metrics) {
    const nums = metricValues(row.pattern);
    const pid = insightsPatreonPostId(row.post_id).replace(/^patreon_post_/, "");
    lines.push(`${pid},${nums.impressions},${nums.seen},${nums.likes},${nums.comments}`);
  }
  const csv = `${lines.join("\n")}\n`;
  const result = await ingestPatreonInsightsCsv(prisma, creatorId, Buffer.from(csv, "utf8"), {
    label: STUDIO_LAB2_LABEL,
    asOf: new Date("2025-09-01T12:00:00.000Z")
  });
  if (!result.ok) {
    throw new Error(`Lab 2 metrics ingest failed: ${result.errors.join("; ")}`);
  }
  const metrics = await prisma.patreonInsightsPostMetric.findMany({
    where: { importId: result.import_id, creatorId },
    select: { id: true, patreonPostId: true, postId: true }
  });
  for (const row of spec.metrics) {
    const pid = insightsPatreonPostId(row.post_id);
    const metric = metrics.find((m) => m.patreonPostId === pid);
    if (metric && metric.postId !== row.post_id) {
      await prisma.patreonInsightsPostMetric.update({
        where: { id: metric.id },
        data: { postId: row.post_id }
      });
    }
  }
}

export async function applyStudioLab2Corpus(
  prisma: PrismaClient,
  options: { fixturePath?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{
  creator_id: string;
  account_id: string;
  post_count: number;
  fixture_hash: string;
}> {
  const env = options.env ?? process.env;
  assertStudioLab2SeedEnv(env);
  const spec = loadStudioLab2Corpus(options.fixturePath ?? defaultStudioLab2CorpusPath());
  if (spec.creator.relayCreatorId !== STUDIO_LAB2_CREATOR_ID) {
    throw new Error("Lab 2 seed refuses a non-lab creator id.");
  }
  if (spec.creator.email.toLowerCase() !== STUDIO_LAB2_EMAIL) {
    throw new Error("Lab 2 seed refuses a non-lab creator email.");
  }

  const { accountId } = await upsertIdentity(prisma, spec, resolveStudioLab2DevPassword(env));
  const now = new Date("2025-01-01T12:00:00.000Z");
  await prisma.campaign.upsert({
    where: { id: spec.creator.campaignId },
    create: {
      id: spec.creator.campaignId,
      creatorId: spec.creator.relayCreatorId,
      name: spec.creator.displayName,
      upstreamUpdatedAt: now,
      versionSeq: 1
    },
    update: {
      name: spec.creator.displayName,
      creatorId: spec.creator.relayCreatorId,
      upstreamUpdatedAt: now
    }
  });
  for (const tier of spec.tiers) {
    const id = tierStableId(spec.creator.relayCreatorId, tier.relay_tier_id);
    await prisma.tier.upsert({
      where: { id },
      create: {
        id,
        creatorId: spec.creator.relayCreatorId,
        relayTierId: tier.relay_tier_id,
        providerTierId: tier.relay_tier_id,
        campaignId: spec.creator.campaignId,
        title: tier.title,
        amountCents: tier.amount_cents,
        upstreamUpdatedAt: now,
        versionSeq: 1
      },
      update: {
        title: tier.title,
        amountCents: tier.amount_cents,
        campaignId: spec.creator.campaignId
      }
    });
  }

  await resetCommandOwnedRows(prisma, spec.creator.relayCreatorId);
  await upsertCorpusPosts(prisma, spec);
  await upsertBaselineVisualCollection(prisma, spec.creator.relayCreatorId, env);
  await upsertDistribution(prisma, spec);
  await upsertMetrics(prisma, spec);

  return {
    creator_id: spec.creator.relayCreatorId,
    account_id: accountId,
    post_count: spec.posts.length,
    fixture_hash: spec.fixture_hash
  };
}

export async function statusStudioLab2Corpus(
  prisma: PrismaClient,
  options: { fixturePath?: string } = {}
): Promise<StudioLab2SeedStatus> {
  const spec = loadStudioLab2Corpus(options.fixturePath ?? defaultStudioLab2CorpusPath());
  const creatorId = spec.creator.relayCreatorId;
  const account = await prisma.account.findFirst({
    where: { primaryRelayCreatorId: creatorId },
    select: { id: true }
  });
  const post_count = await prisma.post.count({
    where: { creatorId, publishState: PostPublishState.published }
  });
  const media_count = await prisma.mediaAsset.count({ where: { creatorId } });
  const collection_count = await prisma.libraryCollection.count({ where: { creatorId } });
  const distribution_posted_x = await prisma.postDistributionAttempt.count({
    where: { creatorId, destination: "x", status: "posted" }
  });
  const imp = await prisma.patreonInsightsImport.findFirst({
    where: { creatorId, label: STUDIO_LAB2_LABEL },
    select: { id: true, label: true }
  });
  const metric_rows = imp
    ? await prisma.patreonInsightsPostMetric.count({ where: { importId: imp.id } })
    : 0;
  return {
    email: STUDIO_LAB2_EMAIL,
    creator_id: account ? creatorId : null,
    account_id: account?.id ?? null,
    label: STUDIO_LAB2_LABEL,
    fixture_hash: spec.fixture_hash,
    post_count,
    media_count,
    collection_count,
    distribution_posted_x,
    metric_rows,
    metrics_label: metric_rows > 0 ? STUDIO_LAB2_LABEL : null
  };
}

export async function cleanupStudioLab2Corpus(
  prisma: PrismaClient,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<{ deleted_posts: number; deleted_collections: number; deleted_metrics: number }> {
  assertStudioLab2SeedEnv(options.env ?? process.env);
  const creatorId = STUDIO_LAB2_CREATOR_ID;
  const metricCount = await prisma.patreonInsightsPostMetric.count({
    where: { creatorId, import: { label: STUDIO_LAB2_LABEL } }
  });
  await resetCommandOwnedRows(prisma, creatorId);
  const deletedCollections = await prisma.libraryCollection.deleteMany({ where: { creatorId } });
  await prisma.mediaAsset.deleteMany({ where: { creatorId } });
  const deletedPosts = await prisma.post.deleteMany({ where: { creatorId } });
  return {
    deleted_posts: deletedPosts.count,
    deleted_collections: deletedCollections.count,
    deleted_metrics: metricCount
  };
}

export async function evalStudioLab2Corpus(
  prisma: PrismaClient,
  options: { fixturePath?: string } = {}
): Promise<StudioLab2EvalResult> {
  const spec = loadStudioLab2Corpus(options.fixturePath ?? defaultStudioLab2CorpusPath());
  const status = await statusStudioLab2Corpus(prisma, options);
  const errors: string[] = [];
  if (status.post_count < spec.eval.min_published_posts) {
    errors.push(`post_count ${status.post_count} < min ${spec.eval.min_published_posts}`);
  }
  if (status.post_count <= 100) {
    errors.push("post_count must be > 100 so gallery limit 100 requires a second page");
  }
  if (status.collection_count !== 1) {
    errors.push(`baseline collection_count must be 1 (got ${status.collection_count})`);
  }
  const baselineCol = await prisma.libraryCollection.findUnique({
    where: { id: STUDIO_LAB2_DEFAULT_COLLECTION_ID },
    include: { posts: { orderBy: { sortIndex: "asc" } } }
  });
  if (!baselineCol || baselineCol.creatorId !== STUDIO_LAB2_CREATOR_ID) {
    errors.push(`missing baseline collection ${STUDIO_LAB2_DEFAULT_COLLECTION_ID}`);
  } else {
    if (baselineCol.title !== STUDIO_LAB2_DEFAULT_COLLECTION_TITLE) {
      errors.push(
        `baseline collection title ${baselineCol.title} != ${STUDIO_LAB2_DEFAULT_COLLECTION_TITLE}`
      );
    }
    const memberIds = baselineCol.posts.map((p) => p.postId);
    const expected = [...STUDIO_LAB2_DEFAULT_COLLECTION_POST_IDS];
    if (memberIds.join(",") !== expected.join(",")) {
      errors.push(`baseline collection members ${memberIds.join(",")} != ${expected.join(",")}`);
    }
  }
  for (const reservedId of ["sl2_col_hero_academy", "sl2_col_watercolor"]) {
    if (await prisma.libraryCollection.findUnique({ where: { id: reservedId } })) {
      errors.push(`command collection ${reservedId} must not exist at baseline`);
    }
  }
  if (status.distribution_posted_x !== spec.eval.already_on_x_post_ids.length) {
    errors.push(
      `posted X attempts ${status.distribution_posted_x} != ${spec.eval.already_on_x_post_ids.length}`
    );
  }
  if (status.metrics_label !== STUDIO_LAB2_LABEL) {
    errors.push("metrics label studio-lab2-corpus-v1 missing");
  }
  if (status.metric_rows !== spec.metrics.length) {
    errors.push(`metric_rows ${status.metric_rows} != ${spec.metrics.length}`);
  }
  if (status.metrics_label === GOALS_LAB_SYNTHETIC_LABEL) {
    errors.push("must not reuse Goals Lab metrics label");
  }
  const native = await prisma.post.count({
    where: { creatorId: STUDIO_LAB2_CREATOR_ID, source: PostSource.RELAY }
  });
  if (native !== 6) errors.push(`Relay-native posts ${native} != 6`);
  const gated = await prisma.post.count({
    where: { creatorId: STUDIO_LAB2_CREATOR_ID, isPublic: false }
  });
  if (gated !== spec.eval.gated_original_post_ids.length) {
    errors.push(`gated posts ${gated} != ${spec.eval.gated_original_post_ids.length}`);
  }
  for (const id of spec.eval.hero_academy_ordered_ids) {
    const row = await prisma.post.findUnique({ where: { id }, select: { id: true } });
    if (!row) errors.push(`missing Hero Academy id ${id}`);
  }
  if (await prisma.post.findUnique({ where: { id: "sl2_ha_p17" } })) {
    errors.push("gap page sl2_ha_p17 must not exist");
  }
  return {
    ok: errors.length === 0,
    errors,
    status,
    fixture_hash: spec.fixture_hash
  };
}

export { STUDIO_LAB2_ACCOUNT_KEY, STUDIO_LAB2_CAMPAIGN_ID, STUDIO_LAB2_CREATOR_ID, STUDIO_LAB2_EMAIL };
