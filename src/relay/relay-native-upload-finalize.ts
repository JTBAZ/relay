import {
  MediaProcessingStatus,
  Prisma,
  type MediaAsset,
  type PrismaClient
} from "@prisma/client";

/** Truncate for `MediaAsset.processing_error` column safety. */
const MAX_PROC_ERR = 2000;

export async function markMediaAssetProcessingFailed(
  prisma: PrismaClient,
  mediaId: string,
  message: string
): Promise<void> {
  const truncated =
    message.length > MAX_PROC_ERR ? `${message.slice(0, MAX_PROC_ERR - 3)}...` : message;
  try {
    await prisma.mediaAsset.update({
      where: { id: mediaId },
      data: {
        processingStatus: MediaProcessingStatus.FAILED,
        processingError: truncated
      }
    });
  } catch {
    /* best-effort */
  }
}

export type RelayUploadCommitHead = {
  contentLength: number;
  etag: string | undefined;
};

export type ApplyRelayUploadCommitParams = {
  mediaId: string;
  creatorId: string;
  key: string;
  contentType: string;
  /** Declared size from client (commit body). */
  byteSize: number;
  postIdOpt?: string;
  head: RelayUploadCommitHead;
  row: MediaAsset;
};

/**
 * T-3.2 — after a successful R2 head, validate size and persist `MediaAsset` READY
 * (+ optional `PostVersion.mediaIds` bump). Shared with `POST /api/v1/relay/upload/commit`.
 */
export async function applyRelayUploadCommitUpdate(
  prisma: PrismaClient,
  params: ApplyRelayUploadCommitParams
): Promise<
  | { ok: true; payload: { content_length: number; etag: string | null } }
  | { ok: false; httpStatus: 400; message: string }
> {
  const { mediaId, creatorId, key, contentType, byteSize, postIdOpt, head, row } = params;

  if (head.contentLength > 0 && head.contentLength !== byteSize) {
    const msgSize = `byte_size does not match stored object (expected ${head.contentLength} bytes, got ${byteSize}).`;
    await markMediaAssetProcessingFailed(prisma, mediaId, msgSize);
    return { ok: false, httpStatus: 400, message: msgSize };
  }

  let primaryPostId: string | null = row.primaryPostId;
  const postIds = [...row.postIds];
  if (postIdOpt) {
    const ownedPost = await prisma.post.findFirst({
      where: { id: postIdOpt, creatorId }
    });
    if (!ownedPost) {
      return { ok: false, httpStatus: 400, message: "post_id not found for this creator." };
    }
    primaryPostId = ownedPost.id;
    if (!postIds.includes(ownedPost.id)) {
      postIds.push(ownedPost.id);
    }
  }

  const now = new Date();
  const v = {
    version_seq: 1,
    upstream_revision: "relay:upload:committed",
    mime_type: contentType,
    storage_key: key,
    r2_etag: head.etag != null ? String(head.etag) : undefined,
    ingested_at: now.toISOString()
  };

  await prisma.mediaAsset.update({
    where: { id: mediaId },
    data: {
      primaryPostId,
      postIds,
      currentStorageKey: key,
      currentMimeType: contentType,
      currentUpstreamUrl: null,
      currentUpstreamRevision: "relay:upload:committed",
      currentIngestedAt: now,
      versionsJson: [v] as unknown as Prisma.InputJsonValue,
      processingStatus: MediaProcessingStatus.READY,
      processingError: null
    }
  });

  if (postIdOpt) {
    const latest = await prisma.postVersion.findFirst({
      where: { postId: postIdOpt },
      orderBy: { versionSeq: "desc" },
      select: { id: true, mediaIds: true }
    });
    if (latest && !latest.mediaIds.includes(mediaId)) {
      await prisma.postVersion.update({
        where: { id: latest.id },
        data: { mediaIds: [...latest.mediaIds, mediaId] }
      });
    }
  }

  return {
    ok: true,
    payload: {
      content_length: head.contentLength,
      etag: head.etag ?? null
    }
  };
}
