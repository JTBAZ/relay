import { describe, expect, it } from "vitest";
import { computeWorkCrosspostGaps } from "../src/analytics/work-crosspost-gaps.js";

describe("computeWorkCrosspostGaps", () => {
  it("detects missing destinations when work is posted to patreon and deviantart but not x", () => {
    const gaps = computeWorkCrosspostGaps(
      [
        { postId: "post_full", variantRole: "full" },
        { postId: "post_teaser", variantRole: "teaser" }
      ],
      [
        {
          postId: "post_full",
          destination: "patreon",
          status: "active",
          externalUrl: "https://patreon.com/posts/1"
        },
        {
          postId: "post_teaser",
          destination: "deviantart",
          status: "active",
          externalUrl: "https://www.deviantart.com/artist/art/Piece-1"
        }
      ]
    );

    expect(gaps.present_destinations).toEqual(["deviantart", "patreon"]);
    expect(gaps.missing_destinations).toEqual(["x", "bluesky"]);
    expect(gaps.suggested_source_post_id).toBe("post_full");
  });

  it("flags missing teaser destinations when promo members exist but are not on every platform", () => {
    const gaps = computeWorkCrosspostGaps(
      [
        { postId: "post_full", variantRole: "full" },
        { postId: "post_teaser", variantRole: "teaser" }
      ],
      [
        {
          postId: "post_full",
          destination: "patreon",
          status: "active",
          externalUrl: "https://patreon.com/posts/1"
        },
        {
          postId: "post_teaser",
          destination: "deviantart",
          status: "active",
          externalUrl: "https://www.deviantart.com/artist/art/Teaser-1"
        }
      ]
    );

    expect(gaps.missing_teaser_destinations).toEqual(["patreon", "x", "bluesky"]);
  });

  it("treats instance contentVariantRole promo over member full for teaser gaps", () => {
    const gaps = computeWorkCrosspostGaps(
      [{ postId: "post_standalone", variantRole: "standalone" }],
      [
        {
          postId: "post_standalone",
          destination: "patreon",
          status: "active",
          externalUrl: "https://patreon.com/posts/1"
        },
        {
          postId: "post_standalone",
          destination: "x",
          status: "active",
          externalUrl: "https://x.com/handle/status/1",
          contentVariantRole: "promo"
        }
      ]
    );

    expect(gaps.present_destinations).toEqual(["patreon", "x"]);
    expect(gaps.missing_teaser_destinations).toEqual(["patreon", "deviantart", "bluesky"]);
  });

  it("ignores unlinked instances and relay-only rows for distribution gaps", () => {
    const gaps = computeWorkCrosspostGaps(
      [{ postId: "post_a", variantRole: "standalone" }],
      [
        {
          postId: "post_a",
          destination: "relay",
          status: "active",
          externalUrl: null
        },
        {
          postId: "post_a",
          destination: "x",
          status: "unlinked",
          externalUrl: "https://x.com/handle/status/1"
        }
      ]
    );

    expect(gaps.present_destinations).toEqual([]);
    expect(gaps.missing_destinations).toEqual(["patreon", "x", "deviantart", "bluesky"]);
    expect(gaps.missing_teaser_destinations).toEqual([]);
  });
});
