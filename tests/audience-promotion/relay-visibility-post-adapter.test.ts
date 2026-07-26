/**
 * Slice 2 Batch 1 — single-post Layer C adapter covers every post item.
 */
import { describe, expect, it } from "vitest";
import type { GalleryItem } from "../../web/lib/relay-api";
import {
  axisActionFromHiddenToggle,
  axisActionFromMatureToggle,
  planPostVisibilityAxisWrite,
  postVisibilitySwitchState
} from "../../web/lib/relay-visibility-post-adapter";

function galleryItem(
  overrides: Partial<GalleryItem> & Pick<GalleryItem, "media_id" | "post_id" | "visibility">
): GalleryItem {
  return {
    title: "t",
    description: "",
    published_at: "2026-01-01T00:00:00.000Z",
    tag_ids: [],
    tier_ids: [],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "/x",
    preview_url_path: "/p",
    thumb_url_path: "/th",
    collection_ids: [],
    collection_theme_tag_ids: [],
    ...overrides
  };
}

describe("postVisibilitySwitchState", () => {
  it("aggregates hidden/mature across all assets and disables adult when all hidden", () => {
    const items = [
      galleryItem({ media_id: "m1", post_id: "p1", visibility: "hidden" }),
      galleryItem({ media_id: "m2", post_id: "p1", visibility: "hidden" })
    ];
    const state = postVisibilitySwitchState(items);
    expect(state.hidden).toBe("on");
    expect(state.mature).toBe("off");
    expect(state.matureDisabled).toBe(true);
  });

  it("reports mixed when assets disagree", () => {
    const items = [
      galleryItem({ media_id: "m1", post_id: "p1", visibility: "visible" }),
      galleryItem({ media_id: "m2", post_id: "p1", visibility: "review" })
    ];
    const state = postVisibilitySwitchState(items);
    expect(state.hidden).toBe("off");
    expect(state.mature).toBe("mixed");
    expect(state.matureDisabled).toBe(false);
  });
});

describe("planPostVisibilityAxisWrite", () => {
  it("includes every media target for the post in visibility bodies", () => {
    const items = [
      galleryItem({ media_id: "m1", post_id: "relay_p_1", visibility: "visible" }),
      galleryItem({ media_id: "m2", post_id: "relay_p_1", visibility: "visible" }),
      galleryItem({ media_id: "m3", post_id: "relay_p_1", visibility: "review" })
    ];
    const plan = planPostVisibilityAxisWrite(
      "creator_1",
      items,
      axisActionFromHiddenToggle(true)
    );
    expect(plan.coveredMediaIds.sort()).toEqual(["m1", "m2", "m3"]);
    const allTargets = plan.requests.flatMap((r) => r.body.media_targets.map((t) => t.media_id));
    expect(allTargets.sort()).toEqual(["m1", "m2", "m3"]);
    for (const req of plan.requests) {
      expect(req.body).not.toHaveProperty("tier_ids");
      expect(req.body.creator_id).toBe("creator_1");
      expect(req.body.visibility).toBe("hidden");
    }
  });

  it("maps adult toggle to set_mature / set_general without tier fields", () => {
    expect(axisActionFromMatureToggle(true)).toBe("set_mature");
    expect(axisActionFromMatureToggle(false)).toBe("set_general");
    const items = [
      galleryItem({ media_id: "m1", post_id: "relay_p_1", visibility: "visible" })
    ];
    const plan = planPostVisibilityAxisWrite(
      "creator_1",
      items,
      axisActionFromMatureToggle(true)
    );
    expect(plan.requests).toHaveLength(1);
    expect(plan.requests[0]!.body.visibility).toBe("review");
    expect(Object.keys(plan.requests[0]!.body).sort()).toEqual([
      "creator_id",
      "media_targets",
      "post_ids",
      "visibility"
    ]);
  });
});
