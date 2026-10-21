import { describe, expect, it, vi } from "vitest";
import {
  parsePatreonPostMetricsApiPayload, fetchPatreonPostMetricsWithSession
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
  it("reports one counter and title-only captures as partial/unavailable", () => {
    expect(parsePatreonPostMetricsApiPayload({ data: { type: "post", id: "1", attributes: { title: "Only title", like_count: 1 } } })).toMatchObject({ ok: false, coverage: "partial", missing: ["impressions", "seen", "comments"] });
    expect(parsePatreonPostMetricsApiPayload({ data: { type: "post", id: "1", attributes: { title: "Only title" } } })).toMatchObject({ ok: false, coverage: "unavailable" });
  });
  it("uses browser credentials on one bounded linked-post request", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(FIXTURE_WITH_POST_INSIGHTS)));
    expect(await fetchPatreonPostMetricsWithSession({ postId: "162544992", fetchImpl: fetch })).toMatchObject({ ok: true, coverage: "complete" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", headers: { Accept: "application/json" } });
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("headers.cookie");
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("headers.user-agent");
  });
  it("rejects mismatched post responses and invalid IDs without probing alternate endpoints", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(FIXTURE_WITH_POST_INSIGHTS)));
    expect(await fetchPatreonPostMetricsWithSession({ postId: "1", fetchImpl: fetch })).toMatchObject({ ok: false, diagnostics: { reason: "post_mismatch" } });
    expect(await fetchPatreonPostMetricsWithSession({ postId: "https://other.example", fetchImpl: fetch })).toMatchObject({ ok: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
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
