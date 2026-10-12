/**
 * Performance intelligence Phase 5 — suggested bundling with user-confirmed merge/split.
 * @see docs/analytics/SUGGESTED_BUNDLING.md
 */

import type { CreativeWorkVariantRole, Prisma, PrismaClient } from "@prisma/client";
import { loadPostNaming } from "../gallery-editor/naming.js";
import { recordManualStateChange, serializable } from "../gallery-editor/service.js";
import { loadEditorState } from "../gallery-editor/state.js";
import type { EditAction } from "../gallery-editor/types.js";
import {
  defaultCreativeWorkIdForPost,
  ensureDefaultCreativeWorkForPost
} from "./creative-work-service.js";

/** Keep a post's displayed title stable when a legacy Work action changes its parent. */
async function preserveInheritedTitles(
  tx: Prisma.TransactionClient,
  creatorId: string,
  naming: Awaited<ReturnType<typeof loadPostNaming>>,
  postIds: string[]
): Promise<void> {
  for (const postId of postIds) {
    const current = naming[postId];
    if (current?.mode !== "inherit_work") continue;
    await tx.postPresentation.upsert({
      where: { postId },
      create: { creatorId, postId, titleMode: "custom", relayTitle: current.effectiveTitle },
      update: { titleMode: "custom", relayTitle: current.effectiveTitle }
    });
  }
}

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
  actorId?: string;
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

  return serializable(prisma,async (tx) => {
    const [sourceMember, targetWork] = await Promise.all([
    tx.creativeWorkMember.findFirst({
      where: { postId: sourcePostId, creatorId },
      select: {
        id: true,
        creativeWorkId: true,
        variantRole: true,
        creativeWork: { select: { isDefaultBundle: true, members: { select: { postId: true } } } }
      }
    }),
    tx.creativeWork.findFirst({
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

    const naming = await loadPostNaming(tx, creatorId, [sourcePostId]);
    const current=naming[sourcePostId];
    const action:EditAction={id:crypto.randomUUID(),kind:"link_work_post",postId:sourcePostId,workId:targetCreativeWorkId,titleMode:current?.mode==="inherit_work"?"custom":current?.mode??"source",...(current?.mode!=="source"&&current?{customTitle:current.effectiveTitle}:{}),sortOrder:nextSortOrder};
    const before=input.actorId?await loadEditorState(tx,creatorId,[action]):undefined;
    await tx.creativeWorkMember.update({
      where: { id: sourceMember.id },
      data: {
        creativeWorkId: targetCreativeWorkId,
        variantRole,
        sortOrder: nextSortOrder,
        linkedAt: new Date()
      }
    });
    await preserveInheritedTitles(tx, creatorId, naming, [sourcePostId]);

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
    if(before&&input.actorId)await recordManualStateChange(tx,{creatorId,actorId:input.actorId,before,after:await loadEditorState(tx,creatorId,[action],true,before.scope),actions:[action],scope:"manual_work_merge_preserve_titles"});
    const memberCount = await tx.creativeWorkMember.count({ where: { creativeWorkId: targetCreativeWorkId } });
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
  });
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
  options?: { title?: string; actorId?: string }
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

  return serializable(prisma,async (tx) => {
  const member = await tx.creativeWorkMember.findFirst({
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
    previousMemberCount === 1
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

    const naming = await loadPostNaming(tx, creatorId, [normalizedPostId]);
    const anchor:EditAction={id:crypto.randomUUID(),kind:"source_post_title",postId:normalizedPostId};
    const before=options?.actorId?await loadEditorState(tx,creatorId,[anchor]):undefined;
    const title = options?.title?.trim() || naming[normalizedPostId]?.effectiveTitle ||
      member.post.versions[0]?.title?.trim() || member.creativeWork.title || normalizedPostId;
    const defaultId=defaultCreativeWorkIdForPost(normalizedPostId);
    const occupiedDefault=await tx.creativeWork.findUnique({where:{id:defaultId},select:{id:true}});
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

    const split = occupiedDefault
      ? await (async () => {
          const creativeWorkId=`cw_split_${crypto.randomUUID().replace(/-/g,"")}`;
          const linkedAt=new Date();
          await tx.creativeWork.create({data:{id:creativeWorkId,creatorId,title,titleMode:"independent",isDefaultBundle:true,createdAt:linkedAt,updatedAt:linkedAt}});
          const memberId=`cwm_split_${crypto.randomUUID().replace(/-/g,"")}`;
          await tx.creativeWorkMember.create({data:{id:memberId,creatorId,postId:normalizedPostId,creativeWorkId,variantRole:"standalone",sortOrder:0,linkedAt}});
          return {creativeWorkId,memberId,created:true};
        })()
      : await ensureDefaultCreativeWorkForPost(tx, {postId:normalizedPostId,creatorId,title,variantRole:"standalone"});
    await preserveInheritedTitles(tx, creatorId, naming, [normalizedPostId]);

    if (remaining === 0) {
      await tx.creativeWork.delete({ where: { id: previousCreativeWorkId } });
    }
    if(before&&options?.actorId){const current=naming[normalizedPostId];const action:EditAction={id:crypto.randomUUID(),kind:"link_work_post",postId:normalizedPostId,workId:split.creativeWorkId,titleMode:current?.mode==="inherit_work"?"custom":current?.mode??"source",...(current&&current.mode!=="source"?{customTitle:current.effectiveTitle}:{}),sortOrder:0};await recordManualStateChange(tx,{creatorId,actorId:options.actorId,before,after:await loadEditorState(tx,creatorId,[action],true,before.scope),actions:[action],scope:"manual_work_split_preserve_titles"});}

    return {
    ok: true,
    result: {
      post_id: normalizedPostId,
      creative_work_id: split.creativeWorkId,
      variant_role: "standalone",
      previous_creative_work_id: previousCreativeWorkId,
      previous_member_count: previousMemberCount
    }
    };
  });
}

export type LinkCreativeWorkMemberSpec = {
  postId: string;
  variantRole?: CreativeWorkVariantRole;
  memberLabel?: string | null;
  isCover?: boolean;
};

export type LinkCreativeWorkMembersInput = {
  actorId?: string;
  title?: string;
  members: LinkCreativeWorkMemberSpec[];
};

export type LinkCreativeWorkMembersResult = {
  creative_work_id: string;
  title: string;
  member_count: number;
  members: Array<{
    post_id: string;
    variant_role: CreativeWorkVariantRole;
    member_label: string | null;
    sort_order: number;
  }>;
};

const VARIANT_ROLES = new Set<CreativeWorkVariantRole>([
  "full",
  "teaser",
  "promo",
  "repost",
  "standalone"
]);

function newLinkedCreativeWorkId(): string {
  return `cw_linked_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Bulk-link N posts into one non-default CreativeWork (Linked Set).
 * Always creates a new work; moves existing memberships; deletes empty source works.
 */
export async function linkCreativeWorkMembers(
  prisma: PrismaClient,
  relayCreatorId: string,
  input: LinkCreativeWorkMembersInput
): Promise<
  { ok: true; result: LinkCreativeWorkMembersResult } | { ok: false; code: BundlingErrorCode }
> {
  const creatorId = relayCreatorId.trim();
  const rawMembers = Array.isArray(input.members) ? input.members : [];
  const byPost = new Map<string, LinkCreativeWorkMemberSpec>();
  for (const member of rawMembers) {
    const postId = member.postId?.trim() ?? "";
    if (!postId) continue;
    byPost.set(postId, {
      postId,
      variantRole:
        member.variantRole && VARIANT_ROLES.has(member.variantRole)
          ? member.variantRole
          : undefined,
      memberLabel:
        typeof member.memberLabel === "string"
          ? member.memberLabel.trim() || null
          : member.memberLabel ?? null,
      isCover: Boolean(member.isCover)
    });
  }

  const uniquePostIds = [...byPost.keys()];
  if (uniquePostIds.length < 2) {
    return { ok: false, code: "INVALID_INPUT" };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: creatorId },
    select: { id: true }
  });
  if (!tenant) return { ok: false, code: "NO_TENANT" };

  return serializable(prisma,async (tx) => {
  const posts = await tx.post.findMany({
    where: { id: { in: uniquePostIds }, creatorId },
    select: {
      id: true,
      versions: {
        orderBy: { versionSeq: "desc" },
        take: 1,
        select: { title: true }
      }
    }
  });
  if (posts.length !== uniquePostIds.length) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const titleByPost = new Map(
    posts.map((post) => [post.id, post.versions[0]?.title?.trim() || post.id] as const)
  );

  const existingMembers = await tx.creativeWorkMember.findMany({
    where: { postId: { in: uniquePostIds }, creatorId },
    select: {
      id: true,
      postId: true,
      creativeWorkId: true,
      variantRole: true,
      memberLabel: true
    }
  });
  const memberByPost = new Map(existingMembers.map((m) => [m.postId, m]));

  const coverPostId =
    uniquePostIds.find((id) => byPost.get(id)?.isCover) ??
    uniquePostIds.find((id) => {
      const role = byPost.get(id)?.variantRole ?? memberByPost.get(id)?.variantRole;
      return role === "full";
    }) ??
    uniquePostIds[0]!;

  const orderedPostIds = [
    coverPostId,
    ...uniquePostIds.filter((id) => id !== coverPostId)
  ];

  const coverTitle = titleByPost.get(coverPostId) ?? coverPostId;
  const newWorkId = newLinkedCreativeWorkId();
  const now = new Date();
  const sourceWorkIds = new Set(existingMembers.map((m) => m.creativeWorkId));

  const planned = orderedPostIds.map((postId, index) => {
    const spec = byPost.get(postId)!;
    const existing = memberByPost.get(postId);
    const variantRole =
      (spec.variantRole && VARIANT_ROLES.has(spec.variantRole)
        ? spec.variantRole
        : undefined) ?? existing?.variantRole ?? "standalone";
    const memberLabel =
      spec.memberLabel !== undefined ? spec.memberLabel : existing?.memberLabel ?? null;
    return {
      memberId: existing?.id,
      postId,
      variantRole,
      memberLabel,
      sortOrder: index,
      previousWorkId: existing?.creativeWorkId
    };
  });

    const naming = await loadPostNaming(tx, creatorId, uniquePostIds);
    const anchors:EditAction[]=uniquePostIds.map(postId=>({id:crypto.randomUUID(),kind:"source_post_title",postId}));
    const before=input.actorId?await loadEditorState(tx,creatorId,anchors):undefined;
    const title = input.title?.trim() || naming[coverPostId]?.effectiveTitle || coverTitle;
    await tx.creativeWork.create({
      data: {
        id: newWorkId,
        creatorId,
        title,
        isDefaultBundle: false,
        createdAt: now,
        updatedAt: now
      }
    });

    for (const row of planned) {
      if(row.memberId)await tx.creativeWorkMember.update({where:{id:row.memberId},data:{creativeWorkId:newWorkId,variantRole:row.variantRole,memberLabel:row.memberLabel,sortOrder:row.sortOrder,linkedAt:now}});
      else await tx.creativeWorkMember.create({data:{id:`cwm_linked_${crypto.randomUUID().replace(/-/g,"")}`,creatorId,postId:row.postId,creativeWorkId:newWorkId,variantRole:row.variantRole,memberLabel:row.memberLabel,sortOrder:row.sortOrder,linkedAt:now}});
    }
    await preserveInheritedTitles(tx, creatorId, naming, uniquePostIds);

    for (const sourceWorkId of sourceWorkIds) {
      if (sourceWorkId === newWorkId) continue;
      const remaining = await tx.creativeWorkMember.count({
        where: { creativeWorkId: sourceWorkId }
      });
      if (remaining === 0) {
        await tx.creativeWork.delete({ where: { id: sourceWorkId } });
      } else if (remaining === 1) {
        await tx.creativeWork.update({
          where: { id: sourceWorkId },
          data: { isDefaultBundle: true, updatedAt: now }
        });
      }
    }
    if(before&&input.actorId){const actions:EditAction[]=planned.map(row=>{const current=naming[row.postId];return {id:crypto.randomUUID(),kind:"link_work_post",postId:row.postId,workId:newWorkId,titleMode:current?.mode==="inherit_work"?"custom":current?.mode??"source",...(current&&current.mode!=="source"?{customTitle:current.effectiveTitle}:{}),memberLabel:row.memberLabel??undefined,sortOrder:row.sortOrder};});await recordManualStateChange(tx,{creatorId,actorId:input.actorId,before,after:await loadEditorState(tx,creatorId,actions,true,before.scope),actions,scope:"manual_work_link_preserve_titles"});}
    return {
    ok: true,
    result: {
      creative_work_id: newWorkId,
      title,
      member_count: planned.length,
      members: planned.map((row) => ({
        post_id: row.postId,
        variant_role: row.variantRole,
        member_label: row.memberLabel,
        sort_order: row.sortOrder
      }))
    }
    };
  });
}
