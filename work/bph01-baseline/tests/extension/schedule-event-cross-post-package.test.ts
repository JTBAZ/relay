import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildScheduleEventCrossPostPackage } from "../../src/extension/schedule-event-cross-post-package.js";

const eventId = `bench_event_${"a".repeat(64)}`;
const event = {
  id: eventId, eventType: "make_post", destination: "x", status: "pending", title: "Saved X title",
  postId: "library-post-1", mediaIds: ["media-2", "media-1"], externalUrl: null, remindMe: false
};
const rows = [
  { id: "media-1", primaryPostId: "library-post-1", postIds: ["library-post-1"], currentMimeType: "image/jpeg" },
  { id: "media-2", primaryPostId: null, postIds: ["library-post-1"], currentMimeType: "image/png" },
];
function db(overrides: { event?: unknown; post?: unknown; media?: unknown[] } = {}) {
  return {
    creatorScheduleEvent: { findFirst: vi.fn(async () => overrides.event === undefined ? event : overrides.event) },
    post: { findFirst: vi.fn(async () => overrides.post === undefined ? { id: "library-post-1", versions: [{ mediaIds: ["media-1", "media-2", "media-3"] }] } : overrides.post) },
    mediaAsset: { findMany: vi.fn(async () => overrides.media ?? rows) },
  } as unknown as PrismaClient & { creatorScheduleEvent: { findFirst: ReturnType<typeof vi.fn> }; post: { findFirst: ReturnType<typeof vi.fn> }; mediaAsset: { findMany: ReturnType<typeof vi.fn> } };
}

describe("saved Schedule Rail X package", () => {
  it("uses the exact event title and preserves selected image order", async () => {
    const prisma = db();
    const result = await buildScheduleEventCrossPostPackage(prisma, "creator-1", eventId);
    expect(result).toEqual({ status: "ok", data: {
      schedule_event_id: eventId, destination: "x", package: {
        relay_post_id: "library-post-1", title: "Saved X title", body_text: "", post_text: "Saved X title",
        media: [
          { media_id: "media-2", filename: "media-2.png", mime_type: "image/png", content_url: "/api/v1/export/media/creator-1/media-2/content" },
          { media_id: "media-1", filename: "media-1.jpg", mime_type: "image/jpeg", content_url: "/api/v1/export/media/creator-1/media-1/content" },
        ]
      }
    } });
    expect(prisma.creatorScheduleEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: eventId, creatorId: "creator-1" },
      select: expect.objectContaining({ mediaIds: true, postId: true, title: true })
    }));
    expect(prisma.post.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "library-post-1", creatorId: "creator-1", upstreamStatus: "active" },
      select: expect.objectContaining({ versions: expect.objectContaining({ orderBy: { versionSeq: "desc" }, take: 1 }) })
    }));
    expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ creatorId: "creator-1", id: { in: event.mediaIds }, upstreamStatus: "active", processingStatus: "READY" })
    }));
  });

  it.each([
    ["wrong destination", { ...event, destination: "patreon" }],
    ["completed event", { ...event, status: "completed" }],
    ["URL-linked event", { ...event, externalUrl: "https://x.com/post/1" }],
    ["reminder event", { ...event, remindMe: true }],
    ["overlong title", { ...event, title: "x".repeat(281) }],
    ["duplicate media", { ...event, mediaIds: ["media-1", "media-1"] }],
  ])("refuses an ineligible saved event: %s", async (_name, badEvent) => {
    await expect(buildScheduleEventCrossPostPackage(db({ event: badEvent }), "creator-1", eventId)).resolves.toEqual({ status: "ineligible" });
  });

  it("rejects synthetic IDs, missing rows, and events owned by another creator", async () => {
    await expect(buildScheduleEventCrossPostPackage(db(), "creator-1", "bench_event_wrong")).resolves.toEqual({ status: "not_found" });
    await expect(buildScheduleEventCrossPostPackage(db({ event: null }), "creator-1", eventId)).resolves.toEqual({ status: "not_found" });
  });

  it("refuses a missing or inactive source and media no longer in the latest version", async () => {
    await expect(buildScheduleEventCrossPostPackage(db({ post: null }), "creator-1", eventId)).resolves.toEqual({ status: "ineligible" });
    await expect(buildScheduleEventCrossPostPackage(db({ post: { id: "library-post-1", versions: [{ mediaIds: ["media-1"] }] } }), "creator-1", eventId)).resolves.toEqual({ status: "ineligible" });
  });

  it.each([
    ["missing media", []],
    ["unassociated media", rows.map(row => row.id === "media-2" ? { ...row, postIds: ["other-post"] } : row)],
    ["non-JPEG/PNG media", rows.map(row => row.id === "media-2" ? { ...row, currentMimeType: "image/gif" } : row)],
  ])("refuses %s without dropping it from the saved media list", async (_name, media) => {
    await expect(buildScheduleEventCrossPostPackage(db({ media }), "creator-1", eventId)).resolves.toEqual({ status: "ineligible" });
  });
});
