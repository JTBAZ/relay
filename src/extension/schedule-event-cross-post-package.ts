import { MediaProcessingStatus, MediaUpstreamStatus, PostUpstreamStatus, type PrismaClient } from "@prisma/client";
import { crossPostMediaContentUrlPath, filenameForMedia, type CrossPostPackageMediaEntry } from "./cross-post-media-entries.js";

export type ScheduleEventCrossPostPackage = {
  schedule_event_id: string;
  destination: "x";
  package: {
    relay_post_id: string;
    title: string;
    body_text: "";
    post_text: string;
    media: CrossPostPackageMediaEntry[];
  };
};

export type ScheduleEventCrossPostPackageResult =
  | { status: "ok"; data: ScheduleEventCrossPostPackage }
  | { status: "not_found" }
  | { status: "ineligible" };

const EVENT_ID = /^bench_event_[a-f0-9]{64}$/;

/** Build an X compose package from the saved event facts, preserving its exact media order. */
export async function buildScheduleEventCrossPostPackage(
  prisma: PrismaClient,
  creatorId: string,
  eventId: string
): Promise<ScheduleEventCrossPostPackageResult> {
  const creator = creatorId.trim();
  if (!creator || !EVENT_ID.test(eventId)) return { status: "not_found" };

  const event = await prisma.creatorScheduleEvent.findFirst({
    where: { id: eventId, creatorId: creator },
    select: {
      id: true, eventType: true, destination: true, status: true, title: true,
      postId: true, mediaIds: true, externalUrl: true, remindMe: true
    }
  });
  if (!event) return { status: "not_found" };
  if (
    event.id !== eventId || event.eventType !== "make_post" || event.destination !== "x" ||
    event.status !== "pending" || !event.postId || event.postId.startsWith("bench_") ||
    event.externalUrl !== null || event.remindMe !== false || typeof event.title !== "string" ||
    !event.title.trim() || event.title.length > 280 || !Array.isArray(event.mediaIds) ||
    event.mediaIds.length < 1 || event.mediaIds.length > 3 ||
    event.mediaIds.some(id => typeof id !== "string" || !id.trim() || id.startsWith("bench_")) ||
    new Set(event.mediaIds).size !== event.mediaIds.length
  ) return { status: "ineligible" };

  const postId = event.postId;
  const selectedIds = event.mediaIds;
  const post = await prisma.post.findFirst({
    where: { id: postId, creatorId: creator, upstreamStatus: PostUpstreamStatus.active },
    select: {
      id: true,
      versions: { orderBy: { versionSeq: "desc" }, take: 1, select: { mediaIds: true } }
    }
  });
  const latestVersion = post?.versions[0];
  if (!post || !latestVersion || selectedIds.some(id => !latestVersion.mediaIds.includes(id))) return { status: "ineligible" };

  const rows = await prisma.mediaAsset.findMany({
    where: {
      creatorId: creator,
      id: { in: selectedIds },
      upstreamStatus: MediaUpstreamStatus.active,
      processingStatus: MediaProcessingStatus.READY
    },
    select: { id: true, primaryPostId: true, postIds: true, currentMimeType: true }
  });
  const byId = new Map(rows.map(row => [row.id, row]));
  const media: CrossPostPackageMediaEntry[] = [];
  for (const id of selectedIds) {
    const row = byId.get(id);
    const mime = row?.currentMimeType?.trim().toLowerCase();
    if (!row || (row.primaryPostId !== postId && !row.postIds.includes(postId)) || (mime !== "image/jpeg" && mime !== "image/png")) {
      return { status: "ineligible" };
    }
    media.push({
      media_id: row.id,
      filename: filenameForMedia(row.id, mime),
      mime_type: mime,
      content_url: crossPostMediaContentUrlPath(creator, row.id)
    });
  }

  return {
    status: "ok",
    data: {
      schedule_event_id: event.id,
      destination: "x",
      package: { relay_post_id: postId, title: event.title, body_text: "", post_text: event.title, media }
    }
  };
}
