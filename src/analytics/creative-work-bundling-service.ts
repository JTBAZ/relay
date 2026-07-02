/**
 * Performance intelligence Phase 5 — suggested bundling with user-confirmed merge/split.
 * @see docs/analytics/SUGGESTED_BUNDLING.md
 */

import type { CreativeWorkVariantRole, PrismaClient } from "@prisma/client";
import {
  defaultCreativeWorkIdForPost,
  ensureDefaultCreativeWorkForPost
} from "./creative-work-service.js";

export type BundlingErrorCode =
  | "NO_TENANT"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "ALREADY_MERGED"
  | "DISMISSED";

export type BundleSuggestionSignalWire = {
  code: string;
  label: string;
  weight: number;
};

export type BundleSuggestionWire = {
  suggestion_id: string;
  source_post_id: string;
  source_title: string | null;
  target_creative_work_id: string;
  target_title: string;
  target_post_ids: string[];
  score: number;
  confidence: "high" | "medium" | "low";
  signals: BundleSuggestionSignalWire[];
  suggested_variant_role: CreativeWorkVariantRole;
};

export type BundleSuggestionsReport = {
  creator_id: string;
  as_of: string;
  suggestions: BundleSuggestionWire[];
  dismissed_count: number;
};

const MIN_SUGGESTION_SCORE = 35;
const PUBLISH_PROXIMITY_DAYS = 7;

const SIGNAL_WEIGHTS = {
  distribution_lineage: 40,
  shared_external_url: 35,
  title_similarity: 20,
  shared_media: 15,
  publish_proximity: 10
} as const;

type PostCandidate = {
  postId: string;
  creativeWorkId: string;
  title: string;
  publishedAt: Date;
  mediaIds: string[];
  sourceDraftIds: Set<string>;
  externalUrls: Set<string>;
  externalIds: Set<string>;
};

export function suggestionIdFor(sourcePostId: string, targetCreativeWorkId: string): string {
  return `cws_${sourcePostId.trim()}_${targetCreativeWorkId.trim()}`;
}

export function normalizeTitleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

export function titleSimilarity(a: string, b: string): number {
  const tokensA = normalizeTitleTokens(a);
  const tokensB = normalizeTitleTokens(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }
  return intersection / Math.max(tokensA.size, tokensB.size);
}

export function inferSuggestedVariantRole(
  sourceTitle: string,
  targetTitle: string,
  sourcePublishedAt: Date,
  targetPublishedAt: Date
): CreativeWorkVariantRole {
  const normalized = sourceTitle.toLowerCase();
  if (normalized.includes("teaser") || normalized.includes("preview")) return "teaser";
  if (normalized.includes("promo")) return "promo";
  if (normalized.includes("repost")) return "repost";
  if (sourcePublishedAt.getTime() < targetPublishedAt.getTime()) return "teaser";
  if (sourceTitle.trim().length > 0 && sourceTitle.trim().length < targetTitle.trim().length / 2) {
    return "teaser";
  }
  return "standalone";
}

function confidenceFromScore(score: number): BundleSuggestionWire["confidence"] {
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function publishProximityWeight(sourcePublishedAt: Date, targetPublishedAt: Date): number {
  const deltaDays =
    Math.abs(sourcePublishedAt.getTime() - targetPublishedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (deltaDays <= 3) return SIGNAL_WEIGHTS.publish_proximity;
  if (deltaDays <= PUBLISH_PROXIMITY_DAYS) return SIGNAL_WEIGHTS.publish_proximity / 2;
  return 0;
}

function sharedMediaWeight(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  for (const mediaId of a) {
    if (setB.has(mediaId)) return SIGNAL_WEIGHTS.shared_media;
  }
  return 0;
}

function sharedExternalWeight(a: PostCandidate, b: PostCandidate): number {
  for (const url of a.externalUrls) {
    if (b.externalUrls.has(url)) return SIGNAL_WEIGHTS.shared_external_url;
  }
  for (const id of a.externalIds) {
    if (b.externalIds.has(id)) return SIGNAL_WEIGHTS.shared_external_url;
  }
  return 0;
}

function sharedDistributionLineage(a: PostCandidate, b: PostCandidate): number {
  for (const draftId of a.sourceDraftIds) {
    if (b.sourceDraftIds.has(draftId)) return SIGNAL_WEIGHTS.distribution_lineage;
  }
  return 0;
}

export function scoreBundlePair(source: PostCandidate, target: PostCandidate): {
  score: number;
  signals: BundleSuggestionSignalWire[];
} {
  const signals: BundleSuggestionSignalWire[] = [];

  const lineageWeight = sharedDistributionLineage(source, target);
  if (lineageWeight > 0) {
    signals.push({
      code: "distribution_lineage",
      label: "Same autopost / distribution draft lineage",
      weight: lineageWeight
    });
  }

  const externalWeight = sharedExternalWeight(source, target);
  if (externalWeight > 0) {
    signals.push({
      code: "shared_external_url",
      label: "Shared platform URL or external id",
      weight: externalWeight
    });
  }

  const similarity = titleSimilarity(source.title, target.title);
  const titleWeight = similarity >= 0.35 ? Math.round(similarity * SIGNAL_WEIGHTS.title_similarity) : 0;
  if (titleWeight > 0) {
    signals.push({
      code: "title_similarity",
      label: "Similar title or caption",
      weight: titleWeight
    });
  }

  const mediaWeight = sharedMediaWeight(source.mediaIds, target.mediaIds);
  if (mediaWeight > 0) {
    signals.push({
      code: "shared_media",
      label: "Shared media asset",
      weight: mediaWeight
    });
  }

  const proximityWeight = publishProximityWeight(source.publishedAt, target.publishedAt);
  if (proximityWeight > 0) {
    signals.push({
      code: "publish_proximity",
      label: "Published within a week of each other",
      weight: proximityWeight
    });
  }

  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);
  return { score, signals };
}

async function loadPostProfiles(
  prisma: PrismaClient,
  creatorId: string
): Promise<{
  profiles: Map<string, PostCandidate>;
  defaultBundlePostIds: Set<string>;
}> {
  const works = await prisma.creativeWork.findMany({
    where: { creatorId },
    select: {
      id: true,
      isDefaultBundle: true,
      members: {
        select: {
          postId: true,
          post: {
            select: {
              versions: {
                orderBy: { versionSeq: "desc" },
                take: 1,
                select: {
                  title: true,
                  publishedAt: true,
                  mediaIds: true
                }
              },
              distributionPlans: {
                select: { sourceDraftId: true }
              },
              platformInstances: {
                select: { externalUrl: true, externalId: true }
              }
            }
          }
        }
      }
    }
  });

  const profiles = new Map<string, PostCandidate>();
  const defaultBundlePostIds = new Set<string>();

  for (const work of works) {
    if (work.isDefaultBundle && work.members.length === 1) {
      defaultBundlePostIds.add(work.members[0]!.postId);
    }

    for (const member of work.members) {
      const version = member.post.versions[0];
      profiles.set(member.postId, {
        postId: member.postId,
        creativeWorkId: work.id,
        title: version?.title ?? member.postId,
        publishedAt: version?.publishedAt ?? new Date(0),
        mediaIds: version?.mediaIds ?? [],
        sourceDraftIds: new Set(
          member.post.distributionPlans
            .map((plan) => plan.sourceDraftId?.trim())
            .filter((value): value is string => Boolean(value))
        ),
        externalUrls: new Set(
          member.post.platformInstances
            .map((instance) => instance.externalUrl?.trim())
            .filter((value): value is string => Boolean(value))
        ),
        externalIds: new Set(
          member.post.platformInstances
            .map((instance) => instance.externalId?.trim())
            .filter((value): value is string => Boolean(value))
        )
      });
    }
  }

  return { profiles, defaultBundlePostIds };
}

export async function listCreativeWorkBundleSuggestions(
  prisma: PrismaClient,
  relayCreatorId: string,
  options?: { limit?: number; asOf?: Date }
): Promise<
  { ok: true; report: BundleSuggestionsReport } | { ok: false; code: "NO_TENANT" }
> {
  const creatorId = relayCreatorId.trim();
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: creatorId },
    select: { id: true }
  });
  if (!tenant) return { ok: false, code: "NO_TENANT" };

  const asOf = options?.asOf ?? new Date();
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);

  const [profileData, dismissals, targetWorks] = await Promise.all([
    loadPostProfiles(prisma, creatorId),
    prisma.creativeWorkBundleSuggestionDismissal.findMany({
      where: { creatorId },
      select: { sourcePostId: true, targetCreativeWorkId: true }
    }),
    prisma.creativeWork.findMany({
      where: { creatorId },
      select: {
        id: true,
        title: true,
        members: { select: { postId: true, sortOrder: true }, orderBy: { sortOrder: "asc" } }
      }
    })
  ]);

  const { profiles, defaultBundlePostIds } = profileData;

  const dismissedKeys = new Set(
    dismissals.map((row) => `${row.sourcePostId}::${row.targetCreativeWorkId}`)
  );

  const suggestions: BundleSuggestionWire[] = [];

  for (const sourcePostId of defaultBundlePostIds) {
    const source = profiles.get(sourcePostId);
    if (!source) continue;

    for (const targetWork of targetWorks) {
      if (source.creativeWorkId === targetWork.id) continue;

      const dismissKey = `${source.postId}::${targetWork.id}`;
      if (dismissedKeys.has(dismissKey)) continue;

      const primaryTargetPostId = targetWork.members[0]?.postId;
      const targetProfile = primaryTargetPostId ? profiles.get(primaryTargetPostId) : undefined;
      if (!targetProfile) continue;

      const { score, signals } = scoreBundlePair(source, targetProfile);
      if (score < MIN_SUGGESTION_SCORE) continue;

      suggestions.push({
        suggestion_id: suggestionIdFor(source.postId, targetWork.id),
        source_post_id: source.postId,
        source_title: source.title,
        target_creative_work_id: targetWork.id,
        target_title: targetWork.title,
        target_post_ids: targetWork.members.map((member) => member.postId),
        score,
        confidence: confidenceFromScore(score),
        signals,
        suggested_variant_role: inferSuggestedVariantRole(
          source.title,
          targetProfile.title,
          source.publishedAt,
          targetProfile.publishedAt
        )
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  return {
    ok: true,
    report: {
      creator_id: creatorId,
      as_of: asOf.toISOString(),
      suggestions: suggestions.slice(0, limit),
      dismissed_count: dismissals.length
    }
  };
}

export async function dismissCreativeWorkBundleSuggestion(
  prisma: PrismaClient,
  relayCreatorId: string,
  input: { sourcePostId: string; targetCreativeWorkId: string }
): Promise<
  | { ok: true; dismissed: true; suggestion_id: string }
  | { ok: false; code: BundlingErrorCode }
> {
  const creatorId = relayCreatorId.trim();
  const sourcePostId = input.sourcePostId.trim();
  const targetCreativeWorkId = input.targetCreativeWorkId.trim();

  if (!sourcePostId || !targetCreativeWorkId) {
    return { ok: false, code: "INVALID_INPUT" };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: creatorId },
    select: { id: true }
  });
  if (!tenant) return { ok: false, code: "NO_TENANT" };

  const targetWork = await prisma.creativeWork.findFirst({
    where: { id: targetCreativeWorkId, creatorId },
    select: { id: true }
  });
  if (!targetWork) return { ok: false, code: "NOT_FOUND" };

  await prisma.creativeWorkBundleSuggestionDismissal.upsert({
    where: {
      creatorId_sourcePostId_targetCreativeWorkId: {
        creatorId,
        sourcePostId,
        targetCreativeWorkId
      }
    },
    create: { creatorId, sourcePostId, targetCreativeWorkId },
    update: { dismissedAt: new Date() }
  });

  return {
    ok: true,
    dismissed: true,
    suggestion_id: suggestionIdFor(sourcePostId, targetCreativeWorkId)
  };
}

export type ConfirmMergeCreativeWorkInput = {
  sourcePostId: string;
  targetCreativeWorkId: string;
  variantRole?: CreativeWorkVariantRole;
};

export type ConfirmMergeCreativeWorkResult = {
  creative_work_id: string;
  source_post_id: string;
  variant_role: CreativeWorkVariantRole;
  member_count: number;
  merged_from_creative_work_id: string | null;
};

export async function confirmMergeCreativeWorkBundle(
  prisma: PrismaClient,
  relayCreatorId: string,
  input: ConfirmMergeCreativeWorkInput
): Promise<
  { ok: true; result: ConfirmMergeCreativeWorkResult } | { ok: false; code: BundlingErrorCode }
> {
  const creatorId = relayCreatorId.trim();
  const sourcePostId = input.sourcePostId.trim();
  const targetCreativeWorkId = input.targetCreativeWorkId.trim();

  if (!sourcePostId || !targetCreativeWorkId) {
    return { ok: false, code: "INVALID_INPUT" };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: creatorId },
    select: { id: true }
  });
  if (!tenant) return { ok: false, code: "NO_TENANT" };

  const [sourceMember, targetWork] = await Promise.all([
    prisma.creativeWorkMember.findFirst({
      where: { postId: sourcePostId, creatorId },
      select: {
        id: true,
        creativeWorkId: true,
        variantRole: true,
        creativeWork: { select: { isDefaultBundle: true, members: { select: { postId: true } } } }
      }
    }),
    prisma.creativeWork.findFirst({
      where: { id: targetCreativeWorkId, creatorId },
      select: {
        id: true,
        members: { select: { postId: true, sortOrder: true }, orderBy: { sortOrder: "asc" } }
      }
    })
  ]);

  if (!sourceMember || !targetWork) return { ok: false, code: "NOT_FOUND" };
  if (sourceMember.creativeWorkId === targetCreativeWorkId) {
    return { ok: false, code: "ALREADY_MERGED" };
  }

  const variantRole = input.variantRole ?? sourceMember.variantRole;
  const mergedFromCreativeWorkId = sourceMember.creativeWorkId;
  const nextSortOrder =
    targetWork.members.reduce((max, member) => Math.max(max, member.sortOrder), -1) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.creativeWorkMember.update({
      where: { id: sourceMember.id },
      data: {
        creativeWorkId: targetCreativeWorkId,
        variantRole,
        sortOrder: nextSortOrder,
        linkedAt: new Date()
      }
    });

    await tx.creativeWork.update({
      where: { id: targetCreativeWorkId },
      data: { isDefaultBundle: false, updatedAt: new Date() }
    });

    const remainingMembers = await tx.creativeWorkMember.count({
      where: { creativeWorkId: mergedFromCreativeWorkId }
    });
    if (remainingMembers === 0) {
      await tx.creativeWork.delete({ where: { id: mergedFromCreativeWorkId } });
    }

    await tx.creativeWorkBundleSuggestionDismissal.deleteMany({
      where: {
        creatorId,
        sourcePostId,
        targetCreativeWorkId
      }
    });
  });

  const memberCount = await prisma.creativeWorkMember.count({
    where: { creativeWorkId: targetCreativeWorkId }
  });

  return {
    ok: true,
    result: {
      creative_work_id: targetCreativeWorkId,
      source_post_id: sourcePostId,
      variant_role: variantRole,
      member_count: memberCount,
      merged_from_creative_work_id:
        mergedFromCreativeWorkId === targetCreativeWorkId ? null : mergedFromCreativeWorkId
    }
  };
}

export type SplitCreativeWorkMemberResult = {
  post_id: string;
  creative_work_id: string;
  variant_role: CreativeWorkVariantRole;
  previous_creative_work_id: string;
  previous_member_count: number;
};

export async function splitCreativeWorkMember(
  prisma: PrismaClient,
  relayCreatorId: string,
  postId: string,
  options?: { title?: string }
): Promise<
  { ok: true; result: SplitCreativeWorkMemberResult } | { ok: false; code: BundlingErrorCode }
> {
  const creatorId = relayCreatorId.trim();
  const normalizedPostId = postId.trim();
  if (!normalizedPostId) return { ok: false, code: "INVALID_INPUT" };

  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: creatorId },
    select: { id: true }
  });
  if (!tenant) return { ok: false, code: "NO_TENANT" };

  const member = await prisma.creativeWorkMember.findFirst({
    where: { postId: normalizedPostId, creatorId },
    select: {
      id: true,
      creativeWorkId: true,
      variantRole: true,
      creativeWork: {
        select: {
          id: true,
          title: true,
          isDefaultBundle: true,
          members: { select: { postId: true } }
        }
      },
      post: {
        select: {
          versions: {
            orderBy: { versionSeq: "desc" },
            take: 1,
            select: { title: true }
          }
        }
      }
    }
  });

  if (!member) return { ok: false, code: "NOT_FOUND" };

  const previousCreativeWorkId = member.creativeWorkId;
  const previousMemberCount = member.creativeWork.members.length;

  if (
    member.creativeWork.isDefaultBundle &&
    previousMemberCount === 1 &&
    member.creativeWorkId === defaultCreativeWorkIdForPost(normalizedPostId)
  ) {
    return {
      ok: true,
      result: {
        post_id: normalizedPostId,
        creative_work_id: previousCreativeWorkId,
        variant_role: member.variantRole,
        previous_creative_work_id: previousCreativeWorkId,
        previous_member_count: previousMemberCount
      }
    };
  }

  const title =
    options?.title?.trim() ||
    member.post.versions[0]?.title?.trim() ||
    member.creativeWork.title ||
    normalizedPostId;

  const result = await prisma.$transaction(async (tx) => {
    await tx.creativeWorkMember.delete({ where: { id: member.id } });

    const remaining = await tx.creativeWorkMember.count({
      where: { creativeWorkId: previousCreativeWorkId }
    });
    if (remaining === 1) {
      await tx.creativeWork.update({
        where: { id: previousCreativeWorkId },
        data: { isDefaultBundle: true, updatedAt: new Date() }
      });
    }

    const split = await ensureDefaultCreativeWorkForPost(tx, {
      postId: normalizedPostId,
      creatorId,
      title,
      variantRole: "standalone"
    });

    if (remaining === 0) {
      await tx.creativeWork.delete({ where: { id: previousCreativeWorkId } });
    }

    return split;
  });

  return {
    ok: true,
    result: {
      post_id: normalizedPostId,
      creative_work_id: result.creativeWorkId,
      variant_role: "standalone",
      previous_creative_work_id: previousCreativeWorkId,
      previous_member_count: previousMemberCount
    }
  };
}