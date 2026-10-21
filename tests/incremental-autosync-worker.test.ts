import { describe, expect, it, vi } from "vitest";
import {
  incrementalAutosyncRepeatEveryMsFromEnv,
  runIncrementalAutosyncCycle,
  runIncrementalAutosyncOnce,
  shouldScheduleIncrementalAutosyncFromEnv
} from "../src/patreon/incremental-sync-worker.js";
import type { PatreonSyncService } from "../src/patreon/patreon-sync-service.js";
import type { PatreonTokenStore } from "../src/auth/token-store.js";

describe("runIncrementalAutosyncCycle", () => {
  it("keeps shared archive/reconciliation running after a caught-up probe", async () => {
    const scrapeOrSync = vi.fn().mockResolvedValue({ patreon_campaign_id: "camp", posts_fetched: 0, warnings: [] });
    const selectAutosyncCreators = vi.fn().mockResolvedValue(["c2"]);
    const service = { supportsResumablePosts: true, selectAutosyncCreators, scrapeOrSync,
      prepareSyncStateForAutomation: vi.fn().mockResolvedValue({ patreon_campaign_id: "camp", watermark_published_at: "2026-01-01T00:00:00Z", likely_has_newer_posts: false }) } as unknown as PatreonSyncService;
    const result = await runIncrementalAutosyncOnce({ tokenStore: { listCreatorIds: async () => ["c1", "c2"] } as PatreonTokenStore,
      patreonSyncService: service, maxCreatorsPerCycle: 1 });
    expect(selectAutosyncCreators).toHaveBeenCalledWith(["c1", "c2"], 1);
    expect(scrapeOrSync).toHaveBeenCalledWith("c2", expect.any(String), { campaign_id: "camp", max_post_pages: 20 });
    expect(result.creators_skipped_probe).toBe(0); expect(result.creators_succeeded).toBe(1);
  });

  it("rejects hosted autosync without shared canonical/progress stores", async () => {
    await expect(runIncrementalAutosyncOnce({ creatorId: "c1", prisma: {} as never,
      tokenStore: {} as PatreonTokenStore, patreonSyncService: { supportsResumablePosts: false } as PatreonSyncService })).rejects.toThrow("Hosted Patreon autosync requires shared canonical and watermark stores");
  });

  it("invokes scrapeOrSync per creator with incremental options", async () => {
    const scrapeOrSync = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      posts_fetched: 0,
      warnings: [],
      apply_result: { posts_written: 0 }
    });
    const prepareSyncStateForAutomation = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      watermark_published_at: null,
      likely_has_newer_posts: false
    });
    const sync = { scrapeOrSync, prepareSyncStateForAutomation } as unknown as PatreonSyncService;
    const tokenStore = {
      listCreatorIds: async () => ["c1", "c2"],
      getByCreatorId: vi.fn()
    } as unknown as PatreonTokenStore;

    const r = await runIncrementalAutosyncCycle({
      tokenStore,
      patreonSyncService: sync,
      concurrency: 1,
      maxPostPages: 5
    });

    expect(r.creators_attempted).toBe(2);
    expect(r.creators_succeeded).toBe(2);
    expect(prepareSyncStateForAutomation).toHaveBeenCalled();
    expect(scrapeOrSync).toHaveBeenCalledTimes(2);
    expect(scrapeOrSync.mock.calls[0]![2]).toEqual({
      campaign_id: "camp",
      max_post_pages: 5
    });
  });

  it("skips unhealthy creators when skipUnhealthy is true", async () => {
    const scrapeOrSync = vi.fn().mockResolvedValue({});
    const sync = { scrapeOrSync } as unknown as PatreonSyncService;
    const tokenStore = {
      listCreatorIds: async () => ["bad", "good"],
      getByCreatorId: vi.fn(async (id: string) =>
        id === "bad"
          ? {
              creator_id: id,
              access_token: "a",
              refresh_token: "r",
              access_token_expires_at: new Date().toISOString(),
              credential_health_status: "refresh_failed" as const
            }
          : {
              creator_id: id,
              access_token: "a",
              refresh_token: "r",
              access_token_expires_at: new Date().toISOString(),
              credential_health_status: "healthy" as const
            }
      )
    } as unknown as PatreonTokenStore;

    const prepareSyncStateForAutomation = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      watermark_published_at: null,
      likely_has_newer_posts: false
    });
    const syncWithProbe = { scrapeOrSync, prepareSyncStateForAutomation } as unknown as PatreonSyncService;

    const r = await runIncrementalAutosyncCycle({
      tokenStore,
      patreonSyncService: syncWithProbe,
      skipUnhealthy: true,
      concurrency: 1
    });

    expect(r.creators_skipped_unhealthy).toBe(1);
    expect(scrapeOrSync).toHaveBeenCalledTimes(1);
    expect(scrapeOrSync.mock.calls[0]![0]).toBe("good");
  });

  it("skips scrape when probe says caught up (watermark + no newer posts)", async () => {
    const scrapeOrSync = vi.fn().mockResolvedValue({});
    const prepareSyncStateForAutomation = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      watermark_published_at: "2026-01-01T00:00:00.000Z",
      likely_has_newer_posts: false
    });
    const sync = { scrapeOrSync, prepareSyncStateForAutomation } as unknown as PatreonSyncService;
    const tokenStore = {
      listCreatorIds: async () => ["c1"],
      getByCreatorId: vi.fn()
    } as unknown as PatreonTokenStore;

    const r = await runIncrementalAutosyncCycle({
      tokenStore,
      patreonSyncService: sync,
      concurrency: 1,
      probeSkipWhenCaughtUp: true
    });

    expect(r.creators_skipped_probe).toBe(1);
    expect(r.creators_succeeded).toBe(0);
    expect(scrapeOrSync).not.toHaveBeenCalled();
  });

  it("two consecutive cycles stay idempotent when probe says caught up (no duplicate scrape)", async () => {
    const scrapeOrSync = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      posts_fetched: 0,
      warnings: [],
      apply_result: { posts_written: 0 }
    });
    const prepareSyncStateForAutomation = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      watermark_published_at: "2026-01-01T00:00:00.000Z",
      likely_has_newer_posts: false
    });
    const sync = { scrapeOrSync, prepareSyncStateForAutomation } as unknown as PatreonSyncService;
    const tokenStore = {
      listCreatorIds: async () => ["c1"],
      getByCreatorId: vi.fn()
    } as unknown as PatreonTokenStore;

    await runIncrementalAutosyncCycle({
      tokenStore,
      patreonSyncService: sync,
      concurrency: 1,
      probeSkipWhenCaughtUp: true
    });
    await runIncrementalAutosyncCycle({
      tokenStore,
      patreonSyncService: sync,
      concurrency: 1,
      probeSkipWhenCaughtUp: true
    });

    expect(scrapeOrSync).not.toHaveBeenCalled();
    expect(prepareSyncStateForAutomation).toHaveBeenCalledTimes(2);
  });
});

describe("runIncrementalAutosyncOnce", () => {
  it("is the same function as runIncrementalAutosyncCycle (backward-compatible alias)", () => {
    expect(runIncrementalAutosyncOnce).toBe(runIncrementalAutosyncCycle);
  });

  it("when creatorId is set, does not use listCreatorIds length and syncs only that creator", async () => {
    const scrapeOrSync = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      posts_fetched: 0,
      warnings: [],
      apply_result: { posts_written: 0 }
    });
    const prepareSyncStateForAutomation = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      watermark_published_at: null,
      likely_has_newer_posts: false
    });
    const sync = { scrapeOrSync, prepareSyncStateForAutomation } as unknown as PatreonSyncService;
    const listCreatorIds = vi.fn().mockResolvedValue(["c1", "c2", "c3"]);
    const tokenStore = {
      listCreatorIds,
      getByCreatorId: vi.fn()
    } as unknown as PatreonTokenStore;

    const r = await runIncrementalAutosyncOnce({
      tokenStore,
      patreonSyncService: sync,
      creatorId: "  only_me ",
      concurrency: 1,
      maxPostPages: 5
    });

    expect(listCreatorIds).not.toHaveBeenCalled();
    expect(r.creators_attempted).toBe(1);
    expect(scrapeOrSync).toHaveBeenCalledTimes(1);
    expect(scrapeOrSync.mock.calls[0]![0]).toBe("only_me");
  });
});

describe("shouldScheduleIncrementalAutosyncFromEnv / incrementalAutosyncRepeatEveryMsFromEnv", () => {
  it("enables schedule when RELAY_AUTOSYNC_ENABLED=1", () => {
    expect(
      shouldScheduleIncrementalAutosyncFromEnv({ RELAY_AUTOSYNC_ENABLED: "1" })
    ).toBe(true);
  });

  it("disables when no env signal", () => {
    expect(shouldScheduleIncrementalAutosyncFromEnv({})).toBe(false);
    expect(incrementalAutosyncRepeatEveryMsFromEnv({})).toBe(null);
  });

  it("repeat every uses Patreon MS when >= 10s", () => {
    expect(
      incrementalAutosyncRepeatEveryMsFromEnv({
        RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS: "120000"
      })
    ).toBe(120_000);
  });

  it("when enabled via flag only, uses autosync interval fallback", () => {
    expect(
      incrementalAutosyncRepeatEveryMsFromEnv({
        RELAY_AUTOSYNC_ENABLED: "1"
      })
    ).toBe(900_000);
  });
});
