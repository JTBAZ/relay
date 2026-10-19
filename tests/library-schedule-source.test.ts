import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  getLibraryScheduleSource,
  LibraryScheduleSourceError,
  validateLibraryScheduleAttachment
} from "../src/distribution/library-schedule-source.js";

function sourceDb(overrides: {
  versionId?: string;
  media?: Array<Record<string, unknown>>;
} = {}) {
  const media = overrides.media ?? [
    { id: "m1", upstreamStatus: "active", primaryPostId: "p1", postIds: ["p1"], currentMimeType: "image/png", currentRole: "cover", processingStatus: "READY" },
    { id: "m2", upstreamStatus: "active", primaryPostId: "p1", postIds: ["p1"], currentMimeType: "video/mp4", currentRole: null, processingStatus: "READY" }
  ];
  const db = {
    post: {
      findFirst: vi.fn().mockResolvedValue({
        id: "p1",
        upstreamStatus: "active",
        versions: [{ id: overrides.versionId ?? "v1", title: "Owned work", mediaIds: ["m2", "m1"] }]
      })
    },
    mediaAsset: { findMany: vi.fn().mockResolvedValue(media) }
  };
  return db as unknown as PrismaClient;
}

describe("Library schedule source", () => {
  it("returns only creator-owned associated media in latest-version order and metadata only", async () => {
    const db = sourceDb({ media: [
      { id: "m1", upstreamStatus: "active", primaryPostId: "p1", postIds: [], currentMimeType: "image/png", currentRole: "cover", processingStatus: "READY" },
      { id: "m2", upstreamStatus: "active", primaryPostId: null, postIds: ["p1"], currentMimeType: "video/mp4", currentRole: null, processingStatus: "READY" },
      { id: "foreign", upstreamStatus: "active", primaryPostId: "p1", postIds: [], currentMimeType: "image/jpeg", currentRole: null, processingStatus: "READY" }
    ] });
    const source = await getLibraryScheduleSource(db, "creator-1", "p1");

    expect(source.media.map(({ id }) => id)).toEqual(["m2", "m1"]);
    expect(source.media[1]?.label).toBe("File 2 · cover · image/png");
    expect(JSON.stringify(source)).not.toMatch(/url|storage|bytes/i);
    expect(db.mediaAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { creatorId: "creator-1", id: { in: ["m2", "m1"] }, upstreamStatus: "active" }
    }));
  });

  it("validates an ordered READY subset against the current version", async () => {
    const db = sourceDb();
    const selected = await validateLibraryScheduleAttachment(db, "creator-1", {
      postId: "p1", versionId: "v1", mediaIds: ["m1", "m2"]
    });
    expect(selected.media.map(({ id }) => id)).toEqual(["m1", "m2"]);

    await expect(validateLibraryScheduleAttachment(sourceDb({ versionId: "v2" }), "creator-1", {
      postId: "p1", versionId: "v1", mediaIds: ["m1"]
    })).rejects.toBeInstanceOf(LibraryScheduleSourceError);
  });

  it("rejects unavailable, unassociated, duplicate, and synthetic media without treating them as Library assets", async () => {
    const deletedPost = sourceDb();
    vi.mocked(deletedPost.post.findFirst).mockResolvedValueOnce({
      id: "p1",
      upstreamStatus: "deleted",
      versions: [{ id: "v1", title: "Gone", mediaIds: ["m1"] }]
    } as never);
    await expect(getLibraryScheduleSource(deletedPost, "creator-1", "p1")).rejects.toThrow(/not found/i);

    const pending = sourceDb({ media: [
      { id: "m1", upstreamStatus: "active", primaryPostId: "p1", postIds: ["p1"], currentMimeType: "image/png", currentRole: null, processingStatus: "PENDING" }
    ] });
    await expect(validateLibraryScheduleAttachment(pending, "creator-1", {
      postId: "p1", versionId: "v1", mediaIds: ["m1"]
    })).rejects.toThrow(/not ready/i);

    const deletedButReady = sourceDb({ media: [
      { id: "m1", upstreamStatus: "deleted", primaryPostId: "p1", postIds: ["p1"], currentMimeType: "image/png", currentRole: null, processingStatus: "READY" }
    ] });
    expect((await getLibraryScheduleSource(deletedButReady, "creator-1", "p1")).media).toEqual([]);
    await expect(validateLibraryScheduleAttachment(deletedButReady, "creator-1", {
      postId: "p1", versionId: "v1", mediaIds: ["m1"]
    })).rejects.toThrow(/no longer associated/i);

    await expect(validateLibraryScheduleAttachment(sourceDb(), "creator-1", {
      postId: "p1", versionId: "v1", mediaIds: ["m1", "m1"]
    })).rejects.toThrow(/distinct/i);
    await expect(validateLibraryScheduleAttachment(sourceDb(), "creator-1", {
      postId: "p1", versionId: "v1", mediaIds: ["bench_media_fake"]
    })).rejects.toThrow(/distinct|Library media/i);
  });
});
