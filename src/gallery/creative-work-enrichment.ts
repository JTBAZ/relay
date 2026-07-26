/**
 * Gallery owner-list enrichment: CreativeWork membership for Linked Sets.
 * @see docs/studio/PLAN_PHASE_3_LINKED_SETS.md
 */

import type { PrismaClient } from "@prisma/client";

export type GalleryCreativeWorkMembershipWire = {
  creative_work_id: string;
  is_default_bundle: boolean;
  creative_work_member_count: number;
  member_label: string | null;
  variant_role: string;
  sort_order: number;
};

/**
 * Bulk-load membership for gallery owner list rows (keyed by post_id).
 */
export async function getCreativeWorkMembershipForPosts(
  prisma: PrismaClient,
  creatorId: string,
  postIds: string[]
): Promise<Map<string, GalleryCreativeWorkMembershipWire>> {
  const normalizedCreatorId = creatorId.trim();
  const normalizedPostIds = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, GalleryCreativeWorkMembershipWire>();
  if (!normalizedCreatorId || normalizedPostIds.length === 0) {
    return out;
  }

  const members = await prisma.creativeWorkMember.findMany({
    where: { creatorId: normalizedCreatorId, postId: { in: normalizedPostIds } },
    select: {
      postId: true,
      variantRole: true,
      memberLabel: true,
      sortOrder: true,
      creativeWorkId: true,
      creativeWork: {
        select: {
          isDefaultBundle: true,
          _count: { select: { members: true } }
        }
      }
    }
  });

  for (const member of members) {
    out.set(member.postId, {
      creative_work_id: member.creativeWorkId,
      is_default_bundle: member.creativeWork.isDefaultBundle,
      creative_work_member_count: member.creativeWork._count.members,
      member_label: member.memberLabel,
      variant_role: member.variantRole,
      sort_order: member.sortOrder
    });
  }

  return out;
}
