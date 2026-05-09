import { describe, expect, it } from "vitest";
import {
  formatSyncHealthRollupBanner,
  shouldShowSyncHealthBanner,
  type PatreonSyncStateData
} from "@/lib/relay-api";

const baseSyncState = (): PatreonSyncStateData => ({
  creator_id: "c",
  patreon_campaign_id: "9",
  watermark_published_at: null,
  watermark_updated_at: null,
  has_cookie_session: false,
  oauth: {
    credential_health_status: "healthy",
    access_token_expires_at: "2026-06-01T00:00:00.000Z",
    access_token_expired: false,
    access_token_expires_soon: false
  },
  last_post_scrape: null,
  last_member_sync: null,
  sync_health: {
    status: "unknown",
    last_success_at: null,
    last_error: null,
    campaign_id: null,
    message_key: "sync_health.unknown"
  },
  campaign_display: null
});

describe("shouldShowSyncHealthBanner (P5-sync-003)", () => {
  it("hides when rollup is healthy", () => {
    const s = baseSyncState();
    s.sync_health = {
      status: "healthy",
      last_success_at: "2026-01-01T00:00:00.000Z",
      last_error: null,
      campaign_id: "9",
      message_key: "sync_health.healthy"
    };
    expect(shouldShowSyncHealthBanner(s)).toBe(false);
  });

  it("shows for failed, degraded, and unknown", () => {
    for (const status of ["failed", "degraded", "unknown"] as const) {
      const s = baseSyncState();
      s.sync_health.status = status;
      expect(shouldShowSyncHealthBanner(s)).toBe(true);
    }
  });
});

describe("formatSyncHealthRollupBanner (P5-sync-003)", () => {
  it("prefers legacy OAuth/session copy when present", () => {
    const s = baseSyncState();
    s.oauth.access_token_expired = true;
    s.sync_health = {
      status: "failed",
      last_success_at: null,
      last_error: null,
      campaign_id: "9",
      message_key: "sync_health.post_scrape_failed"
    };
    expect(formatSyncHealthRollupBanner(s)).toContain("expired");
  });

  it("maps post_scrape_warnings when legacy banner is null", () => {
    const s = baseSyncState();
    s.sync_health = {
      status: "degraded",
      last_success_at: "2026-01-01T00:00:00.000Z",
      last_error: null,
      campaign_id: "9",
      message_key: "sync_health.post_scrape_warnings"
    };
    expect(formatSyncHealthRollupBanner(s)).toContain("warnings");
  });

  it("falls back for unknown message key", () => {
    const s = baseSyncState();
    expect(formatSyncHealthRollupBanner(s)).toContain("not recorded");
  });
});
