import { describe, expect, it } from "vitest";
import {
  creatorSyncHealthStateToWebDto,
  type SyncHealthWebDto
} from "../src/patreon/sync-health-web-dto.js";
import type { CreatorSyncHealthState } from "../src/patreon/patreon-sync-health-store.js";

describe("creatorSyncHealthStateToWebDto (P5-sync-001)", () => {
  it("unknown → empty dto", () => {
    expect(creatorSyncHealthStateToWebDto(null)).toEqual<SyncHealthWebDto>({
      status: "unknown",
      last_success_at: null,
      last_error: null,
      campaign_id: null,
      message_key: "sync_health.unknown"
    });
    expect(creatorSyncHealthStateToWebDto({})).toEqual(
      expect.objectContaining({ status: "unknown", message_key: "sync_health.unknown" })
    );
  });

  it("healthy post scrape, no warnings", () => {
    const state: CreatorSyncHealthState = {
      last_post_scrape: {
        finished_at: "2026-05-08T10:00:00.000Z",
        ok: true,
        patreon_campaign_id: "cmp_1",
        posts_fetched: 5,
        posts_written: 5
      }
    };
    expect(creatorSyncHealthStateToWebDto(state)).toEqual<SyncHealthWebDto>({
      status: "healthy",
      last_success_at: "2026-05-08T10:00:00.000Z",
      last_error: null,
      campaign_id: "cmp_1",
      message_key: "sync_health.healthy"
    });
  });

  it("failed post scrape takes precedence", () => {
    const state: CreatorSyncHealthState = {
      last_post_scrape: {
        finished_at: "2026-05-08T11:00:00.000Z",
        ok: false,
        patreon_campaign_id: "cmp_1",
        error: { code: "UPSTREAM", message: "bad", hint: "retry" }
      },
      last_member_sync: {
        finished_at: "2026-05-08T09:00:00.000Z",
        ok: true,
        members_synced: 10
      }
    };
    const out = creatorSyncHealthStateToWebDto(state);
    expect(out.status).toBe("failed");
    expect(out.last_success_at).toBe("2026-05-08T09:00:00.000Z");
    expect(out.last_error).toEqual({
      code: "UPSTREAM",
      message: "bad",
      hint: "retry",
      source: "post_scrape"
    });
    expect(out.message_key).toBe("sync_health.post_scrape_failed");
  });

  it("degraded when post ok with warnings", () => {
    const state: CreatorSyncHealthState = {
      last_post_scrape: {
        finished_at: "2026-05-08T10:00:00.000Z",
        ok: true,
        patreon_campaign_id: "cmp_1",
        warning_snippets: ["one"]
      }
    };
    const out = creatorSyncHealthStateToWebDto(state);
    expect(out.status).toBe("degraded");
    expect(out.message_key).toBe("sync_health.post_scrape_warnings");
  });

  it("degraded when member sync failed but post ok", () => {
    const state: CreatorSyncHealthState = {
      last_post_scrape: {
        finished_at: "2026-05-08T10:00:00.000Z",
        ok: true,
        patreon_campaign_id: "cmp_1"
      },
      last_member_sync: {
        finished_at: "2026-05-08T10:01:00.000Z",
        ok: false,
        error: { code: "MEM", message: "x", hint: "y" }
      }
    };
    const out = creatorSyncHealthStateToWebDto(state);
    expect(out.status).toBe("degraded");
    expect(out.last_error?.source).toBe("member_sync");
    expect(out.message_key).toBe("sync_health.member_sync_failed");
  });

  it("last_success_at is max of successful runs", () => {
    const state: CreatorSyncHealthState = {
      last_post_scrape: {
        finished_at: "2026-05-08T08:00:00.000Z",
        ok: true,
        patreon_campaign_id: "cmp_1"
      },
      last_member_sync: {
        finished_at: "2026-05-08T09:00:00.000Z",
        ok: true,
        members_synced: 3
      }
    };
    expect(creatorSyncHealthStateToWebDto(state).last_success_at).toBe("2026-05-08T09:00:00.000Z");
  });
});
