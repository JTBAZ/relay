import { describe, expect, it } from "vitest";
import { validateSubscribeStarIngestWire } from "../src/subscribestar/validate-subscribestar-ingest-wire.js";

describe("validateSubscribeStarIngestWire", () => {
  it("accepts minimal valid body", () => {
    const parsed = validateSubscribeStarIngestWire({
      creator_id: "c1",
      campaign: { external_campaign_id: "9", name: "Page" },
      posts: [
        {
          external_post_id: "1",
          title: "Hi",
          published_at: "2026-01-01T00:00:00.000Z",
          upstream_revision: "r"
        }
      ]
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.wire.creator_id).toBe("c1");
      expect(parsed.wire.campaign.external_campaign_id).toBe("9");
      expect(parsed.wire.posts).toHaveLength(1);
    }
  });

  it("rejects empty posts", () => {
    const parsed = validateSubscribeStarIngestWire({
      creator_id: "c1",
      campaign: { external_campaign_id: "9", name: "Page" },
      posts: []
    });
    expect(parsed.ok).toBe(false);
  });
});
