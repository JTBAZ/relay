/**
 * Creator-owned audience tier gate updates on `Post` / latest `PostVersion` / `PostTier`.
 * Patreon re-sync may overwrite PATREON-sourced posts; Relay presentation overlays are separate.
 */
import type { PrismaClient } from "@prisma/client";
import { tierStableId } from "../ingest/canonical-store-db.js";

export type UpdatePostAudienceTierGateArgs = {
  creatorId: string;
  postId: string;
  /** Canonical `relayTierId` values persisted on `PostVersion.tierIds`. */
  tierIds: string[];
  isPublic?: boolean;
};

export type UpdatePostAudienceTierGateResult = {
  postId: string;
  isPublic: boolean;
  tierIds: string[];
};

/**
 * Updates post head RLS fields and the latest version tier gate (does not append a new version row).
 */
export async function updatePostAudienceTierGate(
  prisma: PrismaClient,
  args: UpdatePostAudienceTierGateArgs
): Promise<UpdatePostAudienceTierGateResult> {
  const uniqueTierIds = [...new Set(args.tierIds.map((s) => s.trim()).filter(Boolean))];
  const isPublic = args.isPublic ?? uniqueTierIds.length === 0;
  const requiredTierId =
    uniqueTierIds.length === 1
      ? uniqueTierIds[0]!
      : uniqueTierIds.length > 1
        ? uniqueTierIds[0]!
        : null;

  await prisma.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: args.postId },
      data: {
        isPublic,
        requiredTierId: isPublic ? null : requiredTierId
      }
    });

    const version = await tx.postVersion.findFirst({
      where: { postId: args.postId },
      orderBy: { versionSeq: "desc" }
    });
    if (version) {
      await tx.postVersion.update({
        where: {
          postId_versionSeq: { postId: args.postId, versionSeq: version.versionSeq }
        },
        data: { tierIds: [...uniqueTierIds] }
      });
    }

    await tx.postTier.deleteMany({ where: { postId: args.postId } });
    if (uniqueTierIds.length > 0) {
      await tx.postTier.createMany({
        data: uniqueTierIds.map((tid) => ({
          postId: args.postId,
          tierId: tierStableId(args.creatorId, tid)
        }))
      });
    }
  });

  return {
    postId: args.postId,
    isPublic,
    tierIds: uniqueTierIds
  };
}
