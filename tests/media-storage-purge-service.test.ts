import { beforeEach, describe, expect, it, vi } from "vitest";
import type { R2ClientConfig } from "../src/storage/r2-config.js";
import {
  enqueueMediaStoragePurge,
  MEDIA_STORAGE_PURGE_REASON_LIBRARY_STAGING,
  processMediaStoragePurgeBatch
} from "../src/storage/media-storage-purge-service.js";
import * as relayUploadR2 from "../src/storage/relay-upload-r2.js";

vi.mock("../src/storage/relay-upload-r2.js", () => ({
  deleteR2Object: vi.fn().mockResolvedValue(undefined)
}));

beforeEach(() => {
  vi.mocked(relayUploadR2.deleteR2Object).mockReset();
  vi.mocked(relayUploadR2.deleteR2Object).mockResolvedValue(undefined);
});

const r2cfg: R2ClientConfig = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  credentials: { accessKeyId: "k", secretAccessKey: "s" },
  bucket: "b",
  region: "auto"
};

describe("enqueueMediaStoragePurge", () => {
  it("no-ops when storage key is blank", async () => {
    const create = vi.fn();
    await enqueueMediaStoragePurge({ mediaStoragePurgeQueue: { create } } as never, {
      storageKey: "   ",
      creatorId: "cr",
      reason: "TEST"
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates queue row with trimmed key", async () => {
    const create = vi.fn().mockResolvedValue({});
    await enqueueMediaStoragePurge({ mediaStoragePurgeQueue: { create } } as never, {
      storageKey: "  relay/tenants/x/media/m/a/asset ",
      creatorId: "cr",
      formerMediaId: "m1",
      reason: "TEST",
      delayMs: 0
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storageKey: "relay/tenants/x/media/m/a/asset",
        creatorId: "cr",
        formerMediaId: "m1",
        reason: "TEST",
        eligibleAt: expect.any(Date) as unknown
      })
    });
  });

  it("records unified Library staging discard reason", async () => {
    const create = vi.fn().mockResolvedValue({});
    await enqueueMediaStoragePurge({ mediaStoragePurgeQueue: { create } } as never, {
      storageKey: "relay/tenants/x/media/relay_m_a/blob",
      creatorId: "cr",
      formerMediaId: "relay_m_a",
      reason: MEDIA_STORAGE_PURGE_REASON_LIBRARY_STAGING
    });
    expect(MEDIA_STORAGE_PURGE_REASON_LIBRARY_STAGING).toBe("LIBRARY_STAGING_REMOVED");
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reason: "LIBRARY_STAGING_REMOVED",
        formerMediaId: "relay_m_a"
      })
    });
  });
});

describe("processMediaStoragePurgeBatch", () => {
  it("skips when r2 config is null", async () => {
    const prisma = {
      mediaStoragePurgeQueue: { findMany: vi.fn() }
    };
    const out = await processMediaStoragePurgeBatch(prisma as never, null);
    expect(out).toEqual({ scanned: 0, deletedFromR2: 0, failed: 0, skippedNoR2: true });
    expect(prisma.mediaStoragePurgeQueue.findMany).not.toHaveBeenCalled();
  });

  it("calls deleteR2Object then deletes queue row", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "q1", storageKey: "key-a" }]);
    const del = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn();
    const prisma = {
      mediaStoragePurgeQueue: { findMany, delete: del, update }
    };
    const out = await processMediaStoragePurgeBatch(prisma as never, r2cfg, { batchSize: 10 });
    expect(out.deletedFromR2).toBe(1);
    expect(out.failed).toBe(0);
    expect(out.skippedNoR2).toBe(false);
    expect(relayUploadR2.deleteR2Object).toHaveBeenCalledWith(r2cfg, "key-a");
    expect(del).toHaveBeenCalledWith({ where: { id: "q1" } });
    expect(update).not.toHaveBeenCalled();
  });

  it("increments attempts on R2 failure", async () => {
    vi.mocked(relayUploadR2.deleteR2Object).mockRejectedValueOnce(new Error("network"));
    const findMany = vi.fn().mockResolvedValue([{ id: "q2", storageKey: "key-b" }]);
    const del = vi.fn();
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      mediaStoragePurgeQueue: { findMany, delete: del, update }
    };
    const out = await processMediaStoragePurgeBatch(prisma as never, r2cfg);
    expect(out.deletedFromR2).toBe(0);
    expect(out.failed).toBe(1);
    expect(del).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "q2" },
      data: {
        attempts: { increment: 1 },
        lastError: "network"
      }
    });
  });

  it("when purgeQueueRowId is set, finds only that id with take 1", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { mediaStoragePurgeQueue: { findMany, delete: vi.fn(), update: vi.fn() } };
    const now = new Date("2026-05-01T12:00:00.000Z");
    await processMediaStoragePurgeBatch(prisma as never, r2cfg, {
      purgeQueueRowId: "  row-target  ",
      now
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        eligibleAt: { lte: now },
        attempts: { lt: 30 },
        id: "row-target"
      },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { id: true, storageKey: true }
    });
  });
});
