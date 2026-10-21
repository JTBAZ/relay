import type { Prisma, PrismaClient } from "@prisma/client";

type ScheduleSourceClient = PrismaClient | Prisma.TransactionClient;

export type LibraryScheduleAttachment = Readonly<{
  postId: string;
  versionId: string;
  mediaIds: string[];
}>;

export type LibraryScheduleSource = Readonly<{
  postId: string;
  versionId: string;
  title: string;
  media: Array<{
    id: string;
    label: string;
    mime: string | null;
    processingStatus: string;
  }>;
}>;

export class LibraryScheduleSourceError extends Error {
  public override readonly name = "LibraryScheduleSourceError";
  public constructor(message: string, public readonly statusCode: 400 | 404 = 400) {
    super(message);
  }
}

const MAX_SOURCE_MEDIA = 100;

function associatedWithPost(row: { primaryPostId: string | null; postIds: string[] }, postId: string): boolean {
  return row.primaryPostId === postId || row.postIds.includes(postId);
}

/** Reads bounded, creator-owned metadata for the current Library post version. */
export async function getLibraryScheduleSource(
  prisma: ScheduleSourceClient,
  creatorId: string,
  postId: string
): Promise<LibraryScheduleSource> {
  const id = creatorId.trim();
  const pid = postId.trim();
  if (!id || !pid || pid.startsWith("bench_")) {
    throw new LibraryScheduleSourceError("Choose a real Library post.");
  }

  const post = await prisma.post.findFirst({
    where: { id: pid, creatorId: id, upstreamStatus: "active" },
    select: {
      id: true,
      upstreamStatus: true,
      versions: {
        orderBy: { versionSeq: "desc" },
        take: 1,
        select: { id: true, title: true, mediaIds: true }
      }
    }
  });
  const version = post?.versions[0];
  if (!post || post.upstreamStatus !== "active" || !version) {
    throw new LibraryScheduleSourceError("Library post not found.", 404);
  }

  const versionMediaIds = version.mediaIds.map((value) => value.trim()).filter(Boolean);
  if (versionMediaIds.length > MAX_SOURCE_MEDIA) {
    throw new LibraryScheduleSourceError("This Library post has too many media items to attach.");
  }
  const mediaRows = versionMediaIds.length
    ? await prisma.mediaAsset.findMany({
        where: { creatorId: id, id: { in: versionMediaIds }, upstreamStatus: "active" },
        select: {
          id: true,
          upstreamStatus: true,
          primaryPostId: true,
          postIds: true,
          currentMimeType: true,
          currentRole: true,
          processingStatus: true
        }
      })
    : [];
  const byId = new Map(mediaRows.map((row) => [row.id, row]));

  return {
    postId: post.id,
    versionId: version.id,
    title: version.title.slice(0, 200),
    media: versionMediaIds.flatMap((mediaId, index) => {
      const row = byId.get(mediaId);
      if (!row || row.upstreamStatus !== "active" || !associatedWithPost(row, post.id) || mediaId.startsWith("bench_")) return [];
      return [{
        id: row.id,
        // The DB-backed media record has no filename column. Use safe, stable metadata only.
        label: `File ${index + 1}${row.currentRole?.trim() ? ` · ${row.currentRole.trim().slice(0, 40)}` : ""}${row.currentMimeType?.trim() ? ` · ${row.currentMimeType.trim().slice(0, 80)}` : ""}`,
        mime: row.currentMimeType?.trim() || null,
        processingStatus: row.processingStatus
      }];
    })
  };
}

/** Revalidates a selected ordered subset against the current owned Library version. */
export async function validateLibraryScheduleAttachment(
  prisma: ScheduleSourceClient,
  creatorId: string,
  attachment: LibraryScheduleAttachment
): Promise<LibraryScheduleSource> {
  if (
    !attachment ||
    typeof attachment.postId !== "string" ||
    typeof attachment.versionId !== "string" ||
    !Array.isArray(attachment.mediaIds) ||
    attachment.mediaIds.length < 1 ||
    attachment.mediaIds.length > 3 ||
    attachment.mediaIds.some((value) => typeof value !== "string" || !value.trim() || value.startsWith("bench_")) ||
    new Set(attachment.mediaIds).size !== attachment.mediaIds.length
  ) {
    throw new LibraryScheduleSourceError("Choose one to three distinct Library media items.");
  }

  const source = await getLibraryScheduleSource(prisma, creatorId, attachment.postId);
  if (source.versionId !== attachment.versionId) {
    throw new LibraryScheduleSourceError("The Library post changed. Review the current version again.");
  }

  const byId = new Map(source.media.map((item) => [item.id, item]));
  const selected = attachment.mediaIds.map((mediaId) => byId.get(mediaId));
  if (selected.some((item) => !item)) {
    throw new LibraryScheduleSourceError("Selected media is no longer associated with this Library post.");
  }
  if (selected.some((item) => item!.processingStatus !== "READY")) {
    throw new LibraryScheduleSourceError("Selected Library media is not ready yet.");
  }

  return { ...source, media: selected as NonNullable<(typeof selected)[number]>[] };
}
