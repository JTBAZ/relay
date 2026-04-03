import { describe, expect, it } from "vitest";
import { extractCampaignDisplayFromCampaignsDoc } from "../src/patreon/map-patreon-to-ingest.js";
import type { JsonApiDocument } from "../src/patreon/jsonapi-types.js";

describe("extractCampaignDisplayFromCampaignsDoc", () => {
  it("returns image URLs and patron_count when present", () => {
    const doc: JsonApiDocument = {
      data: [
        {
          type: "campaign",
          id: "123",
          attributes: {
            vanity: "SomeCreator",
            patron_count: 99,
            image_url: "https://x/banner.png",
            image_small_url: "https://x/small.png"
          }
        }
      ]
    };
    const out = extractCampaignDisplayFromCampaignsDoc(doc, "123");
    expect(out).toEqual({
      patreon_campaign_id: "123",
      patreon_name: "somecreator",
      patron_count: 99,
      image_url: "https://x/banner.png",
      image_small_url: "https://x/small.png"
    });
  });

  it("omits optional fields when absent", () => {
    const doc: JsonApiDocument = {
      data: [{ type: "campaign", id: "1", attributes: {} }]
    };
    const out = extractCampaignDisplayFromCampaignsDoc(doc, "1");
    expect(out).toEqual({ patreon_campaign_id: "1" });
  });

  it("returns null when campaign id not in doc", () => {
    const doc: JsonApiDocument = {
      data: [{ type: "campaign", id: "2", attributes: { patron_count: 1 } }]
    };
    expect(extractCampaignDisplayFromCampaignsDoc(doc, "9")).toBeNull();
  });
});
