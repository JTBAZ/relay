/** @vitest-environment happy-dom */

/**
 * Surgical unblock regression — all-locked batch with effectivePromo uses LockedPromoOverlay.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VisitorBatchSlideMedia } from "../../web/app/components/VisitorBatchSlideMedia";
import type { GalleryItem } from "../../web/lib/relay-api";
import type { EffectivePromo } from "../../web/lib/effective-promo";

function lockedItem(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    media_id: "media_locked_1",
    post_id: "post_locked_1",
    title: "Locked drop",
    published_at: "2026-07-01T00:00:00.000Z",
    tag_ids: [],
    tier_ids: ["tier_supporter"],
    mime_type: "image/png",
    has_export: true,
    processing_status: "ready",
    export_status: "ready",
    content_url_path: "",
    preview_url_path: "/api/v1/export/media/cr/media_locked_1/preview",
    thumb_url_path: "",
    visibility: "patrons",
    collection_ids: [],
    collection_theme_tag_ids: [],
    ...overrides
  };
}

const PROMO: EffectivePromo = {
  headline: "Unlock with SUMMER20",
  cta_text: "Get 20% off",
  code: "SUMMER20",
  percent_off: 20,
  tracked_url: "/go/summer20",
  source: "explicit"
};

describe("VisitorBatchSlideMedia locked promo overlay", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders LockedPromoOverlay when all assets are tier-gated and a promo resolves", () => {
    const { container } = render(
      <VisitorBatchSlideMedia
        items={[lockedItem()]}
        resetKey="post_locked_1"
        imgClass="aspect-square"
        showTierBadges={false}
        tierFacets={[]}
        tierTitleById={{}}
        onActivateItem={() => {}}
        effectivePromo={PROMO}
        accentColor="#00aa6f"
      />
    );

    expect(container.querySelector("[data-locked-promo-overlay]")).toBeTruthy();
    expect(container.querySelector("[data-locked-promo-cta]")?.textContent).toBe("Get 20% off");
  });
});
