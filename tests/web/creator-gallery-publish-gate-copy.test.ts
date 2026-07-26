import { describe, expect, it } from "vitest";
import {
  describeCreatorGalleryPublishBlock,
  describeSyncHealthPublishBlock
} from "../../web/lib/relay-api";

describe("describeCreatorGalleryPublishBlock (P4-onb-008)", () => {
  it("returns null when step is published and scrape not failed", () => {
    expect(
      describeCreatorGalleryPublishBlock({
        creator_id: "c",
        step: "published",
        metadata: null,
        updated_at: "2026-01-01T00:00:00.000Z",
        import_progress: { last_post_scrape_finished_at: null, last_post_scrape_ok: true, last_post_scrape_posts_written: null },
        sync_health: {
          status: "healthy",
          last_success_at: "2026-01-01T00:00:00.000Z",
          last_error: null,
          campaign_id: "9",
          message_key: "sync_health.healthy"
        }
      })
    ).toBeNull();
  });

  it("blocks when step is organized", () => {
    const msg = describeCreatorGalleryPublishBlock({
      creator_id: "c",
      step: "organized",
      metadata: null,
      updated_at: "2026-01-01T00:00:00.000Z",
      import_progress: null,
      sync_health: {
        status: "unknown",
        last_success_at: null,
        last_error: null,
        campaign_id: null,
        message_key: "sync_health.unknown"
      }
    });
    expect(msg).toBeTruthy();
    expect(msg).toContain("Mark ready");
  });

  it("blocks when sync_health is failed even if step published", () => {
    const msg = describeCreatorGalleryPublishBlock({
      creator_id: "c",
      step: "published",
      metadata: null,
      updated_at: "2026-01-01T00:00:00.000Z",
      import_progress: {
        last_post_scrape_finished_at: "2026-01-01",
        last_post_scrape_ok: false,
        last_post_scrape_posts_written: null
      },
      sync_health: {
        status: "failed",
        last_success_at: null,
        last_error: null,
        campaign_id: "9",
        message_key: "sync_health.post_scrape_failed"
      }
    });
    expect(msg).toContain("sync failed");
  });

  it("blocks when sync_health is degraded", () => {
    expect(
      describeSyncHealthPublishBlock({
        status: "degraded",
        last_success_at: "2026-01-01T00:00:00.000Z",
        last_error: null,
        campaign_id: "9",
        message_key: "sync_health.post_scrape_warnings"
      })
    ).toContain("degraded");
  });

  it("blocks when last scrape ok is false without sync_health (legacy fallback)", () => {
    const msg = describeCreatorGalleryPublishBlock({
      creator_id: "c",
      step: "published",
      metadata: null,
      updated_at: "2026-01-01T00:00:00.000Z",
      import_progress: {
        last_post_scrape_finished_at: "2026-01-01",
        last_post_scrape_ok: false,
        last_post_scrape_posts_written: null
      },
      sync_health: {
        status: "healthy",
        last_success_at: "2026-01-01T00:00:00.000Z",
        last_error: null,
        campaign_id: "9",
        message_key: "sync_health.healthy"
      }
    });
    expect(msg).toContain("Patreon");
  });
});
