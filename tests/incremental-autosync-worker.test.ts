import { describe, expect, it, vi } from "vitest";
import { runIncrementalAutosyncCycle } from "../src/patreon/incremental-sync-worker.js";
import type { PatreonSyncService } from "../src/patreon/patreon-sync-service.js";
import type { PatreonTokenStore } from "../src/auth/token-store.js";

describe("runIncrementalAutosyncCycle", () => {
  it("invokes scrapeOrSync per creator with incremental options", async () => {
    const scrapeOrSync = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      posts_fetched: 0,
      warnings: [],
      apply_result: { posts_written: 0 }
    });
    const getSyncState = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      watermark_published_at: null,
      likely_has_newer_posts: false
    });
    const sync = { scrapeOrSync, getSyncState } as unknown as PatreonSyncService;
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
    expect(getSyncState).toHaveBeenCalled();
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

    const getSyncState = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      watermark_published_at: null,
      likely_has_newer_posts: false
    });
    const syncWithProbe = { scrapeOrSync, getSyncState } as unknown as PatreonSyncService;

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
    const getSyncState = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      watermark_published_at: "2026-01-01T00:00:00.000Z",
      likely_has_newer_posts: false
    });
    const sync = { scrapeOrSync, getSyncState } as unknown as PatreonSyncService;
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
    const getSyncState = vi.fn().mockResolvedValue({
      patreon_campaign_id: "camp",
      watermark_published_at: "2026-01-01T00:00:00.000Z",
      likely_has_newer_posts: false
    });
    const sync = { scrapeOrSync, getSyncState } as unknown as PatreonSyncService;
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
    expect(getSyncState).toHaveBeenCalledTimes(2);
  });
});
