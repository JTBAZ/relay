import { describe, expect, it } from "vitest";
import { describeCreatorGalleryPublishBlock } from "../../web/lib/relay-api";

describe("describeCreatorGalleryPublishBlock (P4-onb-008)", () => {
  it("returns null when step is published and scrape not failed", () => {
    expect(
      describeCreatorGalleryPublishBlock({
        creator_id: "c",
        step: "published",
        metadata: null,
        updated_at: "2026-01-01T00:00:00.000Z",
        import_progress: { last_post_scrape_finished_at: null, last_post_scrape_ok: true, last_post_scrape_posts_written: null }
      })
    ).toBeNull();
  });

  it("blocks when step is organized", () => {
    const msg = describeCreatorGalleryPublishBlock({
      creator_id: "c",
      step: "organized",
      metadata: null,
      updated_at: "2026-01-01T00:00:00.000Z",
      import_progress: null
    });
    expect(msg).toBeTruthy();
    expect(msg).toContain("Mark ready");
  });

  it("blocks when last scrape ok is false even if step published", () => {
    const msg = describeCreatorGalleryPublishBlock({
      creator_id: "c",
      step: "published",
      metadata: null,
      updated_at: "2026-01-01T00:00:00.000Z",
      import_progress: {
        last_post_scrape_finished_at: "2026-01-01",
        last_post_scrape_ok: false,
        last_post_scrape_posts_written: null
      }
    });
    expect(msg).toContain("Patreon");
  });
});
