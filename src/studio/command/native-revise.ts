/**
 * Native PostVersion append for Relay-sourced revise (RC-P2-T08 / RC-DF-10).
 * Imported posts must use presentation overlay instead.
 */
import { PostSource, type PrismaClient } from "@prisma/client";
import { CommandContractError } from "./contracts.js";

export async function appendNativePostVersion(
  prisma: PrismaClient,
  input: { creatorId: string; postId: string; title?: string; description?: string }
): Promise<{ version_seq: number }> {
  const post = await prisma.post.findFirst({
    where: { id: input.postId, creatorId: input.creatorId },
    include: { versions: { orderBy: { versionSeq: "desc" }, take: 1 } }
  });
  if (!post) {
    throw new CommandContractError("COMMAND_NOT_FOUND", "Post not found.", [
      { field: "post_id", issue: input.postId }
    ]);
  }
  if (post.source !== PostSource.RELAY) {
    throw new CommandContractError(
      "COMMAND_WRONG_WRITE_LAYER",
      "Native version append is only for RELAY posts.",
      [{ field: "source", issue: post.source }]
    );
  }
  const latest = post.versions[0];
  if (!latest) {
    throw new CommandContractError("COMMAND_VALIDATION", "Post has no version to append from.", [
      { field: "post_id", issue: input.postId }
    ]);
  }
  const nextSeq = latest.versionSeq + 1;
  await prisma.postVersion.create({
    data: {
      postId: post.id,
      versionSeq: nextSeq,
      upstreamRevision: `relay:command:v${nextSeq}`,
      title: input.title !== undefined ? input.title : latest.title,
      description: input.description !== undefined ? input.description : latest.description,
      publishedAt: latest.publishedAt,
      tagIds: [...latest.tagIds],
      tierIds: [...latest.tierIds],
      mediaIds: [...latest.mediaIds],
      ingestedAt: new Date()
    }
  });
  return { version_seq: nextSeq };
}
