import type { PrismaClient } from "@prisma/client";
import {
  MediaIngestOrigin,
  PostSource,
  PostUpstreamStatus,
  type MediaAsset
} from "@prisma/client";

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

export type RelayCreatePostRow = {
  post: {
    id: string;
    campaignId: string;
    creatorId: string;
    source: "RELAY";
    isPublic: boolean;
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
    tierIds: string[];
    mediaIds: string[];
  };
};

/**
 * T-4.2 — create `Post` + `PostVersion` + `PostTier` + link `MediaAsset` in a single transaction.
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
  for (const tid of uniqueTierKeys) {
    const t = await prisma.tier.findFirst({
      where: { id: tid, creatorId: input.creatorId }
    });
    if (!t) {
      throw new RelayCreatePostError(
        "INVALID_TIER_REF",
        `Tier not found for this creator: ${tid}`,
        400
      );
    }
    if (t.campaignId !== campaignId) {
      throw new RelayCreatePostError(
        "INVALID_TIER_REF",
        `Tier does not belong to the resolved campaign: ${tid}`,
        400
      );
    }
  }
  if (input.requiredTierId?.trim()) {
    const t = await prisma.tier.findFirst({
      where: { id: input.requiredTierId.trim(), creatorId: input.creatorId }
    });
    if (!t) {
      throw new RelayCreatePostError(
        "INVALID_TIER_REF",
        "required_tier_id not found for this creator.",
        400
      );
    }
    if (t.campaignId !== campaignId) {
      throw new RelayCreatePostError(
        "INVALID_TIER_REF",
        "required_tier_id does not belong to the resolved campaign.",
        400
      );
    }
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
    if (m.ingestOrigin !== MediaIngestOrigin.RELAY_UPLOAD || !m.currentStorageKey) {
      throw new RelayCreatePostError(
        "INVALID_MEDIA_REF",
        `media_id is not a committed Relay upload: ${mid}`,
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
          requiredTierId: input.isPublic ? null : input.requiredTierId?.trim() || null,
          versions: {
            create: {
              versionSeq: 1,
              upstreamRevision,
              title,
              description: input.description?.trim() ? input.description : null,
              publishedAt,
              tagIds: [...new Set((input.tagIds ?? []).map((t) => t.trim()).filter(Boolean))],
              tierIds: uniqueTierKeys,
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
      for (const tid of uniqueTierKeys) {
        await tx.postTier.upsert({
          where: { postId_tierId: { postId, tierId: tid } },
          create: { postId, tierId: tid },
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
