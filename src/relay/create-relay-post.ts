/**
 * @fileoverview Relay-native post creation (T-4.2): campaign/tier resolution and transactional `Post` + `PostVersion` persistence.
 * @description API tier references may be Prisma `Tier.id` or `Tier.relayTierId`. **`PostTier.tierId`** FKs use **`Tier.id`**; **`PostVersion.tierIds`** and **`Post.requiredTierId`** persist canonical **`relayTierId`** for entitlements / RLS.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `Post`, `PostVersion`, `PostTier`, `Campaign`, `Tier`, `MediaAsset`, `CreatorProfile`
 */
import type { PrismaClient } from "@prisma/client";
import {
  MediaIngestOrigin,
  PostSource,
  PostUpstreamStatus,
  type MediaAsset
} from "@prisma/client";

/** Accepted fields when creating a native Relay post (service / HTTP adapter maps into this). */
export type RelayCreatePostInput = {
  creatorId: string;
  /** When null, resolve via `CreatorProfile.patreonCampaignId` / single-campaign heuristics. */
  campaignId: string | null;
  title: string;
  description: string | null;
  isPublic: boolean;
  requiredTierId: string | null;
  tierIds: string[];
  tagIds: string[];
  mediaIds: string[];
  publish: boolean;
  publishedAtInput: string | null;
};

const DRAFT_PUBLISHED_AT = new Date(0);

/**
 * Structured validation / resolution failure for relay-native post flows (HTTP status carried in `statusCode`).
 * @extends Error
 */
export class RelayCreatePostError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "RelayCreatePostError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * T-4.1 — resolve `Campaign.id` for `Post.campaignId` (FK).
 * @async
 * @throws {RelayCreatePostError} When the requested campaign is missing or ambiguous vs profile / Patreon-sync state.
 * @throws {Error} Unexpected Prisma client failures.
 * @see docs/api/relay-native-posts.md
 */
export async function resolveCampaignIdForRelayPost(
  prisma: PrismaClient,
  creatorId: string,
  campaignIdRequest: string | null
): Promise<string> {
  if (campaignIdRequest?.trim()) {
    const c = await prisma.campaign.findFirst({
      where: { id: campaignIdRequest.trim(), creatorId }
    });
    if (!c) {
      throw new RelayCreatePostError(
        "INVALID_CAMPAIGN",
        "campaign_id not found for this creator.",
        400
      );
    }
    return c.id;
  }
  const profile = await prisma.creatorProfile.findFirst({
    where: { tenant: { relayCreatorId: creatorId } },
    select: { patreonCampaignId: true }
  });
  const fromProfile = profile?.patreonCampaignId?.trim();
  if (fromProfile) {
    const c = await prisma.campaign.findFirst({
      where: { id: fromProfile, creatorId }
    });
    if (c) {
      return c.id;
    }
  }
  const byCreator = await prisma.campaign.findMany({
    where: { creatorId },
    select: { id: true }
  });
  if (byCreator.length === 1) {
    return byCreator[0]!.id;
  }
  if (byCreator.length === 0) {
    throw new RelayCreatePostError(
      "CAMPAIGN_REQUIRED",
      "No campaign for this studio — run Patreon sync or pass campaign_id.",
      400
    );
  }
  throw new RelayCreatePostError(
    "CAMPAIGN_AMBIGUOUS",
    "Multiple campaigns exist — pass campaign_id in the request body.",
    400
  );
}

function validateTitle(title: string): void {
  const t = title.trim();
  if (!t) {
    throw new RelayCreatePostError("VALIDATION_ERROR", "title is required.", 400);
  }
  if (t.length > 2000) {
    throw new RelayCreatePostError("VALIDATION_ERROR", "title exceeds maximum length.", 400);
  }
}

/** Prisma `Tier.id` plus canonical `relayTierId` for snapshot / entitlement gates. */
export type ResolvedRelayPostTier = {
  id: string;
  relayTierId: string;
};

/**
 * Resolve a tier reference from `POST /relay/posts` to Prisma `Tier.id` and `relayTierId`.
 * Accepts primary key (`Tier.id`) or a single matching `Tier.relayTierId` for the creator
 * (safety net when clients send facet / ingest-style keys).
 *
 * Use **`id`** for `PostTier` / FK joins; use **`relayTierId`** for `PostVersion.tierIds`
 * and `Post.requiredTierId`.
 * @async
 * @throws {RelayCreatePostError} On missing tier, ambiguous `relayTierId`, or campaign mismatch.
 * @throws {Error} Prisma read failures.
 */
export async function resolveRelayPostTier(
  prisma: PrismaClient,
  creatorId: string,
  tierKey: string,
  campaignId: string
): Promise<ResolvedRelayPostTier> {
  const byId = await prisma.tier.findFirst({
    where: { id: tierKey, creatorId },
    select: { id: true, relayTierId: true, campaignId: true }
  });
  let row = byId;
  if (!row) {
    const byRelay = await prisma.tier.findMany({
      where: { relayTierId: tierKey, creatorId },
      select: { id: true, relayTierId: true, campaignId: true }
    });
    if (byRelay.length === 1) {
      row = byRelay[0]!;
    } else if (byRelay.length > 1) {
      throw new RelayCreatePostError(
        "INVALID_TIER_REF",
        `Ambiguous tier reference for this creator (matches multiple tiers): ${tierKey}`,
        400
      );
    }
  }
  if (!row) {
    throw new RelayCreatePostError(
      "INVALID_TIER_REF",
      `Tier not found for this creator: ${tierKey}`,
      400
    );
  }
  if (row.campaignId !== campaignId) {
    throw new RelayCreatePostError(
      "INVALID_TIER_REF",
      `Tier does not belong to the resolved campaign: ${tierKey}`,
      400
    );
  }
  return { id: row.id, relayTierId: row.relayTierId };
}

/**
 * Same lookup as {@link resolveRelayPostTier}; returns Prisma `Tier.id` only
 * (`PostTier.tierId`, internal FK resolution). Persisted gate fields use
 * {@link resolveRelayPostTier}'s **`relayTierId`**.
 * @async
 * @throws {RelayCreatePostError} Delegated from {@link resolveRelayPostTier}.
 */
export async function resolveRelayPostTierKey(
  prisma: PrismaClient,
  creatorId: string,
  tierKey: string,
  campaignId: string
): Promise<string> {
  const r = await resolveRelayPostTier(prisma, creatorId, tierKey, campaignId);
  return r.id;
}

/** Transactional row snapshot returned from {@link createRelayPostTransaction} (post head + v1 version). */
export type RelayCreatePostRow = {
  post: {
    id: string;
    campaignId: string;
    creatorId: string;
    source: "RELAY";
    isPublic: boolean;
    /** Canonical `relayTierId` when gated; null when public. */
    requiredTierId: string | null;
  };
  version: {
    id: string;
    versionSeq: number;
    upstreamRevision: string;
    title: string;
    description: string | null;
    publishedAt: Date;
    tagIds: string[];
    /** Canonical `relayTierId` values (not Prisma `Tier.id`). */
    tierIds: string[];
    mediaIds: string[];
  };
};

/**
 * Media that was stored in tenant R2 by Relay (browser presigned upload) or the Discord ingest bridge.
 * Both require `currentStorageKey` before attaching to a native Relay post.
 */
export function isMediaEligibleForRelayNativePost(
  m: Pick<MediaAsset, "ingestOrigin" | "currentStorageKey">
): boolean {
  if (!m.currentStorageKey?.trim()) {
    return false;
  }
  return (
    m.ingestOrigin === MediaIngestOrigin.RELAY_UPLOAD ||
    m.ingestOrigin === MediaIngestOrigin.DISCORD
  );
}

/**
 * T-4.2 — create `Post` + `PostVersion` + `PostTier` + link `MediaAsset` in a single transaction.
 * @async
 * @throws {RelayCreatePostError} Validation and reference resolution failures surfaced to HTTP as 4xx.
 * @throws {Error} Prisma transaction errors, internal invariant breaks.
 */
export async function createRelayPostTransaction(
  prisma: PrismaClient,
  postId: string,
  input: RelayCreatePostInput
): Promise<RelayCreatePostRow> {
  validateTitle(input.title);
  const title = input.title.trim();
  const campaignId = await resolveCampaignIdForRelayPost(
    prisma,
    input.creatorId,
    input.campaignId
  );

  const uniqueTierKeys = [...new Set(input.tierIds.map((s) => s.trim()).filter(Boolean))];
  if (!input.isPublic && uniqueTierKeys.length === 0) {
    throw new RelayCreatePostError(
      "VALIDATION_ERROR",
      "tier_ids must be non-empty when the post is not public.",
      400
    );
  }
  const versionTierRelayIds: string[] = [];
  const junctionTierPrismaIds: string[] = [];
  const seenTierPk = new Set<string>();
  for (const tid of uniqueTierKeys) {
    const resolved = await resolveRelayPostTier(
      prisma,
      input.creatorId,
      tid,
      campaignId
    );
    if (!seenTierPk.has(resolved.id)) {
      seenTierPk.add(resolved.id);
      versionTierRelayIds.push(resolved.relayTierId);
      junctionTierPrismaIds.push(resolved.id);
    }
  }

  let resolvedRequiredRelayTierId: string | null = null;
  if (input.requiredTierId?.trim()) {
    resolvedRequiredRelayTierId = (
      await resolveRelayPostTier(prisma, input.creatorId, input.requiredTierId.trim(), campaignId)
    ).relayTierId;
  }

  const mediaIdList = [...new Set(input.mediaIds.map((s) => s.trim()).filter(Boolean))];
  for (const mid of mediaIdList) {
    const m = await prisma.mediaAsset.findFirst({
      where: { id: mid, creatorId: input.creatorId }
    });
    if (!m) {
      throw new RelayCreatePostError(
        "INVALID_MEDIA_REF",
        `media_id not found for this creator: ${mid}`,
        400
      );
    }
    if (!isMediaEligibleForRelayNativePost(m)) {
      throw new RelayCreatePostError(
        "INVALID_MEDIA_REF",
        `media_id is not a committed Relay upload or Discord capture in storage: ${mid}`,
        400
      );
    }
  }

  const now = new Date();
  let publishedAt: Date;
  if (input.publish) {
    if (input.publishedAtInput?.trim()) {
      const p = new Date(input.publishedAtInput);
      if (Number.isNaN(p.getTime())) {
        throw new RelayCreatePostError("VALIDATION_ERROR", "published_at is not a valid date-time.", 400);
      }
      publishedAt = p;
    } else {
      publishedAt = now;
    }
  } else {
    publishedAt = DRAFT_PUBLISHED_AT;
  }

  const upstreamRevision = `relay:v1:${now.getTime()}`;

  const result = await prisma.$transaction(
    async (tx) => {
      const newPost = await tx.post.create({
        data: {
          id: postId,
          campaignId,
          creatorId: input.creatorId,
          providerPostId: null,
          source: PostSource.RELAY,
          upstreamStatus: PostUpstreamStatus.active,
          createdAt: now,
          isPublic: input.isPublic,
          requiredTierId: input.isPublic ? null : resolvedRequiredRelayTierId,
          versions: {
            create: {
              versionSeq: 1,
              upstreamRevision,
              title,
              description: input.description?.trim() ? input.description : null,
              publishedAt,
              tagIds: [...new Set((input.tagIds ?? []).map((t) => t.trim()).filter(Boolean))],
              tierIds: versionTierRelayIds,
              mediaIds: mediaIdList,
              ingestedAt: now
            }
          }
        },
        include: { versions: { where: { versionSeq: 1 } } }
      });
      const v0 = newPost.versions[0];
      if (!v0) {
        throw new Error("Relay post version missing after create");
      }
      for (const tierPk of junctionTierPrismaIds) {
        await tx.postTier.upsert({
          where: { postId_tierId: { postId, tierId: tierPk } },
          create: { postId, tierId: tierPk },
          update: {}
        });
      }
      for (let i = 0; i < mediaIdList.length; i++) {
        const mid = mediaIdList[i]!;
        const m: MediaAsset = (await tx.mediaAsset.findUniqueOrThrow({
          where: { id: mid }
        })) as MediaAsset;
        const nextPostIds = m.postIds.includes(postId) ? m.postIds : [...m.postIds, postId];
        const setPrimary = m.primaryPostId == null && i === 0;
        await tx.mediaAsset.update({
          where: { id: mid },
          data: {
            postIds: nextPostIds,
            ...(setPrimary ? { primaryPostId: postId } : {})
          }
        });
      }
      return { newPost, v0 };
    },
    { timeout: 30_000 }
  );
  const v = result.v0;
  return {
    post: {
      id: result.newPost.id,
      campaignId: result.newPost.campaignId,
      creatorId: result.newPost.creatorId,
      source: "RELAY",
      isPublic: result.newPost.isPublic,
      requiredTierId: result.newPost.requiredTierId
    },
    version: {
      id: v.id,
      versionSeq: v.versionSeq,
      upstreamRevision: v.upstreamRevision,
      title: v.title,
      description: v.description,
      publishedAt: v.publishedAt,
      tagIds: v.tagIds,
      tierIds: v.tierIds,
      mediaIds: v.mediaIds
    }
  };
}
