import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InProcessAccountDeletionRunner } from "../../src/patron/account-deletion-worker.js";

vi.mock("../../src/patron/account-deletion-service.js", () => ({
  listDueDeletions: vi.fn(),
  executeDeletion: vi.fn()
}));

import {
  executeDeletion,
  listDueDeletions
} from "../../src/patron/account-deletion-service.js";

describe("InProcessAccountDeletionRunner.processOnce", () => {
  beforeEach(() => {
    vi.mocked(listDueDeletions).mockReset();
    vi.mocked(executeDeletion).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns zero stats when nothing is due", async () => {
    vi.mocked(listDueDeletions).mockResolvedValue([]);
    const runner = new InProcessAccountDeletionRunner({
      prisma: {} as never,
      pollIntervalMs: 1_000_000
    });
    const stats = await runner.processOnce();
    expect(stats).toEqual({ scanned: 0, executed: 0, failed: 0 });
    expect(executeDeletion).not.toHaveBeenCalled();
  });

  it("invokes executeDeletion for every due row + counts executed", async () => {
    vi.mocked(listDueDeletions).mockResolvedValue([
      { id: "del-1", accountId: "acc-1" },
      { id: "del-2", accountId: "acc-2" }
    ]);
    vi.mocked(executeDeletion).mockResolvedValue({
      record: {
        id: "del",
        accountId: "acc",
        status: "executed",
        requestedAt: new Date(),
        scheduledFor: new Date(),
        executedAt: new Date(),
        cancelledAt: null,
        reason: null
      },
      counts: {
        favorites: 0,
        collections: 0,
        collectionEntries: 0,
        comments: 0,
        commentReactions: 0,
        contentReports: 0,
        moderationActionsAuthored: 0,
        accountBlocks: 0,
        accountFollows: 0,
        memberships: 0
      }
    });
    const runner = new InProcessAccountDeletionRunner({
      prisma: {} as never,
      pollIntervalMs: 1_000_000
    });
    const stats = await runner.processOnce();
    expect(stats.scanned).toBe(2);
    expect(stats.executed).toBe(2);
    expect(stats.failed).toBe(0);
    expect(executeDeletion).toHaveBeenCalledTimes(2);
  });

  it("isolates per-row failures; one bad row doesn't stall the batch", async () => {
    vi.mocked(listDueDeletions).mockResolvedValue([
      { id: "del-good", accountId: "acc-good" },
      { id: "del-bad", accountId: "acc-bad" }
    ]);
    vi.mocked(executeDeletion).mockImplementation(async (_prisma, id) => {
      if (id === "del-bad") throw new Error("DB blip");
      return {
        record: {
          id,
          accountId: "acc",
          status: "executed",
          requestedAt: new Date(),
          scheduledFor: new Date(),
          executedAt: new Date(),
          cancelledAt: null,
          reason: null
        },
        counts: {
          favorites: 0,
          collections: 0,
          collectionEntries: 0,
          comments: 0,
          commentReactions: 0,
          contentReports: 0,
          moderationActionsAuthored: 0,
          accountBlocks: 0,
          accountFollows: 0,
          memberships: 0
        }
      };
    });
    const log = vi.fn();
    const runner = new InProcessAccountDeletionRunner({
      prisma: {} as never,
      pollIntervalMs: 1_000_000,
      log
    });
    const stats = await runner.processOnce();
    expect(stats.scanned).toBe(2);
    expect(stats.executed).toBe(1);
    expect(stats.failed).toBe(1);
    expect(log).toHaveBeenCalledWith(
      "account-deletion-sweep: row failed",
      expect.objectContaining({ deletionId: "del-bad" })
    );
  });
});
