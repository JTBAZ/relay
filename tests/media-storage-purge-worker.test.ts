import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBatch = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    scanned: 0,
    deletedFromR2: 0,
    failed: 0,
    skippedNoR2: false
  })
);
const mockBatchFromEnv = vi.hoisted(() => vi.fn(() => 33));

vi.mock("../src/storage/media-storage-purge-service.js", () => ({
  mediaStoragePurgeBatchFromEnv: mockBatchFromEnv,
  processMediaStoragePurgeBatch: mockBatch
}));

vi.mock("../src/storage/r2-config.js", () => ({
  getR2ClientConfigFromEnv: vi.fn(() => ({ kind: "mock-r2" }))
}));

import { processMediaStoragePurgeSweepOnce } from "../src/storage/media-storage-purge-worker.js";

describe("processMediaStoragePurgeSweepOnce", () => {
  beforeEach(() => {
    mockBatch.mockClear();
    mockBatchFromEnv.mockClear();
  });

  it("loads R2 from env and runs one batch with default batch size from env helper", async () => {
    await processMediaStoragePurgeSweepOnce({} as never);
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockBatch).toHaveBeenCalledWith(
      {},
      { kind: "mock-r2" },
      expect.objectContaining({
        batchSize: 33,
        purgeQueueRowId: undefined,
        now: undefined
      })
    );
  });

  it("forwards purgeQueueRowId, batchSize, and now", async () => {
    const now = new Date("2026-04-01T00:00:00Z");
    await processMediaStoragePurgeSweepOnce({} as never, {
      batchSize: 5,
      purgeQueueRowId: "q-99",
      now
    });
    expect(mockBatch).toHaveBeenCalledWith(
      {},
      { kind: "mock-r2" },
      { batchSize: 5, purgeQueueRowId: "q-99", now }
    );
  });
});
