import { describe, expect, it } from "vitest";
import { mapCookiePostToIngest } from "../src/patreon/cookie-scraper.js";
import type { JsonApiResource } from "../src/patreon/jsonapi-types.js";

describe("mapCookiePostToIngest cover + attachment collapse", () => {
  it("keeps one media row when cover URL matches attachment (normalized)", () => {
    const shared =
      "https://c10.patreonusercontent.com/3/abcdef123/e.png?token=abc&w=800";
    const attachmentUrl =
      "https://c10.patreonusercontent.com/3/abcdef123/e.png?token=abc&w=400";

    const post: JsonApiResource = {
      type: "post",
      id: "42",
      attributes: {
        title: "Post",
        published_at: "2024-06-01T12:00:00.000Z",
        image: { url: shared, large_url: shared }
      },
      relationships: {
        attachments_media: {
          data: [{ type: "media", id: "m1" }]
        }
      }
    };

    const mediaRes: JsonApiResource = {
      type: "media",
      id: "m1",
      attributes: {
        mimetype: "image/png",
        image_urls: { url: attachmentUrl }
      }
    };

    const included = new Map<string, JsonApiResource>([
      ["media:m1", mediaRes]
    ]);

    const ingest = mapCookiePostToIngest(post, included);
    expect(ingest.media).toHaveLength(1);
    expect(ingest.media[0]!.role).toBe("cover");
  });
});
