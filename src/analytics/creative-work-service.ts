/**
 * Performance intelligence Phase 1 — Work/Bundle (CreativeWork) helpers.
 * @see docs/analytics/PERFORMANCE_INTELLIGENCE_VOCABULARY.md
 */

import type { CreativeWorkVariantRole, Prisma, PrismaClient } from "@prisma/client";

export type CreativeWorkDb = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_CREATIVE_WORK_ID_PREFIX = "cw_default_";
export const DEFAULT_CREATIVE_WORK_MEMBER_ID_PREFIX = "cwm_default_";

export function defaultCreativeWorkIdForPost(postId: string): string {
  return `${DEFAULT_CREATIVE_WORK_ID_PREFIX}${postId.trim()}`;
}

export function defaultCreativeWorkMemberIdForPost(postId: string): string {
  return `${DEFAULT_CREATIVE_WORK_MEMBER_ID_PREFIX}${postId.trim()}`;
}

export type EnsureDefaultCreativeWorkArgs = {
  postId: string;
  creatorId: string;
  title: string;
  createdAt?: Date;
  variantRole?: CreativeWorkVariantRole;
};

export type EnsureDefaultCreativeWorkResult = {
  creativeWorkId: string;
  memberId: string;
  created: boolean;
};

/**
 * Ensures every Relay Post belongs to exactly one Work/Bundle.
 * Default bundles use deterministic ids so migration backfill and runtime creates align.
 */
export async function ensureDefaultCreativeWorkForPost(
  db: CreativeWorkDb,
  args: EnsureDefaultCreativeWorkArgs
): Promise<EnsureDefaultCreativeWorkResult> {
  const postId = args.postId.trim();
  const creatorId = args.creatorId.trim();
  const title = args.title.trim() || postId;

  if (!postId || !creatorId) {
    throw new Error("postId and creatorId are required");
  }

  const existing = await db.creativeWorkMember.findUnique({
    where: { postId },
    select: { id: true, creativeWorkId: true }
  });
  if (existing) {
    return {
      creativeWorkId: existing.creativeWorkId,
      memberId: existing.id,
      created: false
    };
  }

  const creativeWorkId = defaultCreativeWorkIdForPost(postId);
  const memberId = defaultCreativeWorkMemberIdForPost(postId);
  const linkedAt = args.createdAt ?? new Date();
  const variantRole = args.variantRole ?? "standalone";

  await db.creativeWork.upsert({
    where: { id: creativeWorkId },
    create: {
      id: creativeWorkId,
      creatorId,
      title,
      isDefaultBundle: true,
      createdAt: linkedAt,
      updatedAt: linkedAt
    },
    update: {
      title,
      updatedAt: new Date()
    }
  });

  await db.creativeWorkMember.create({
    data: {
      id: memberId,
      creativeWorkId,
      postId,
      creatorId,
      variantRole,
      sortOrder: 0,
      linkedAt
    }
  });

  return { creativeWorkId, memberId, created: true };
}

export async function getCreativeWorkForPost(
  db: CreativeWorkDb,
  postId: string
): Promise<{
  creativeWorkId: string;
  variantRole: CreativeWorkVariantRole;
  title: string;
  isDefaultBundle: boolean;
} | null> {
  const member = await db.creativeWorkMember.findUnique({
    where: { postId: postId.trim() },
    select: {
      variantRole: true,
      creativeWork: {
        select: {
          id: true,
          title: true,
          isDefaultBundle: true
        }
      }
    }
  });

  if (!member) return null;

  return {
    creativeWorkId: member.creativeWork.id,
    variantRole: member.variantRole,
    title: member.creativeWork.title,
    isDefaultBundle: member.creativeWork.isDefaultBundle
  };
}
