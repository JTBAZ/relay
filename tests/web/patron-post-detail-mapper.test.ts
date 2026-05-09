import { describe, expect, it } from "vitest";
import {
  galleryPostDetailToPatronFeedPost,
  stubCreatorFromRelayId,
} from "../../web/lib/patron-post-detail-mapper";
import type { GalleryPostDetail } from "../../web/lib/relay-api";
import type { Creator } from "../../web/lib/relay-fixtures";

describe("galleryPostDetailToPatronFeedPost", () => {
  const creator: Creator = stubCreatorFromRelayId("rc_x");

  it("maps media and absolutizes /api paths", () => {
    const detail: GalleryPostDetail = {
      post_id: "p1",
      title: "Hello",
      description: "<p>Hi</p>",
      published_at: "2026-01-01T00:00:00.000Z",
      tag_ids: ["t1"],
      tiers: [{ tier_id: "relay_tier_public", title: "Public" }],
      media: [
        {
          media_id: "m1",
          post_id: "p1",
          title: "a",
          published_at: "2026-01-01T00:00:00.000Z",
          tag_ids: [],
          tier_ids: [],
          mime_type: "image/png",
          has_export: true,
          processing_status: "READY",
          export_status: "ready",
          content_url_path: "/api/v1/export/media/rc_x/m1/content",
          preview_url_path: "/api/v1/export/media/rc_x/m1/preview",
          thumb_url_path: "",
          visibility: "visible",
          collection_ids: [],
          collection_theme_tag_ids: [],
        },
      ],
    };
    const post = galleryPostDetailToPatronFeedPost("rc_x", detail, creator);
    expect(post.id).toBe("p1");
    expect(post.highResImageUrl).toMatch(/\/api\/v1\/export\/media/);
    expect(post.excerpt).toMatch(/Hi/i);
  });

  it("uses writing when there is no media", () => {
    const detail: GalleryPostDetail = {
      post_id: "p2",
      title: "Essay",
      published_at: "2026-01-01T00:00:00.000Z",
      tag_ids: [],
      tiers: [],
      media: [],
    };
    const post = galleryPostDetailToPatronFeedPost("rc_x", detail, creator);
    expect(post.mediaType).toBe("writing");
  });
});
