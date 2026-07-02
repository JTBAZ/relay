import { describe, expect, it } from "vitest";
import {
  parsePatreonPostMetricsApiPayload
} from "../extension/src/lib/patreon-post-metrics-fetch.js";

const FIXTURE_WITH_POST_INSIGHTS = {
  data: {
    id: "162544992",
    type: "post",
    attributes: {
      title: "Relay test post",
      published_at: "2026-06-30T12:00:00.000Z",
      like_count: 12,
      comment_count: 3,
      view_count: 45,
      insights_last_updated_at: "2026-06-30T13:00:00.000Z"
    },
    relationships: {
      campaign: {
        data: { id: "15782831", type: "campaign" }
      }
    }
  },
  included: [
    {
      id: "insight-1",
      type: "post_insights",
      attributes: {
        impressions: 1200,
        seen: 340,
        likes: 12,
        comments: 3,
        last_updated_at: "2026-06-30T13:00:00.000Z"
      }
    }
  ]
};

describe("parsePatreonPostMetricsApiPayload", () => {
  it("maps post counters and included post_insights reach metrics", () => {
    const result = parsePatreonPostMetricsApiPayload(FIXTURE_WITH_POST_INSIGHTS, "fixture");

    expect(result.ok).toBe(true);
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric_type: "likes", value: 12 }),
        expect.objectContaining({ metric_type: "comments", value: 3 }),
        expect.objectContaining({ metric_type: "impressions", value: 1200 }),
        expect.objectContaining({ metric_type: "seen", value: 340 }),
        expect.objectContaining({
          metric_type: "title",
          raw: expect.objectContaining({ text: "Relay test post" })
        })
      ])
    );
  });

  it("returns empty metrics for invalid payloads", () => {
    const result = parsePatreonPostMetricsApiPayload(null);
    expect(result.ok).toBe(false);
    expect(result.metrics).toEqual([]);
  });
});
