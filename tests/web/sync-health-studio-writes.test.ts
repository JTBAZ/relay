import { describe, expect, it } from "vitest";
import { syncHealthBlocksStudioWrites, type PatreonSyncStateData } from "@/lib/relay-api";

const base = (): PatreonSyncStateData => ({
  creator_id: "c",
  patreon_campaign_id: "1",
  watermark_published_at: null,
  watermark_updated_at: null,
  has_cookie_session: false,
  oauth: {
    credential_health_status: "healthy",
    access_token_expires_at: "2026-01-01T00:00:00.000Z",
    access_token_expired: false,
    access_token_expires_soon: false
  },
  last_post_scrape: null,
  last_member_sync: null,
  sync_health: {
    status: "healthy",
    last_success_at: null,
    last_error: null,
    campaign_id: null,
    message_key: "sync_health.healthy"
  },
  campaign_display: null
});

describe("syncHealthBlocksStudioWrites (P5-sync-004)", () => {
  it("is false for healthy and unknown", () => {
    const h = base();
    expect(syncHealthBlocksStudioWrites(h)).toBe(false);
    h.sync_health.status = "unknown";
    h.sync_health.message_key = "sync_health.unknown";
    expect(syncHealthBlocksStudioWrites(h)).toBe(false);
  });

  it("is true for failed and degraded", () => {
    const f = base();
    f.sync_health.status = "failed";
    expect(syncHealthBlocksStudioWrites(f)).toBe(true);
    const d = base();
    d.sync_health.status = "degraded";
    expect(syncHealthBlocksStudioWrites(d)).toBe(true);
  });
});
