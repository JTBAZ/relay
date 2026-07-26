import { describe, expect, it } from "vitest";
import { pickHottestFromPostPerformance } from "./analytics-pulse";
import type { CreatorPostPerformanceData } from "./relay-api";

function report(rows: CreatorPostPerformanceData["rows"]): CreatorPostPerformanceData {
  return {
    as_of: "2026-01-15T12:00:00.000Z",
    import_id: "imp1",
    import_uploaded_at: "2026-01-14T00:00:00.000Z",
    import_label: null,
    rows,
    relay_only_count: 0,
    relay_only_truncated: false,
    note: ""
  };
}

describe("pickHottestFromPostPerformance", () => {
  const now = new Date("2026-01-15T12:00:00.000Z").getTime();

  it("picks higher seen per hour", () => {
    const hot = pickHottestFromPostPerformance(
      report([
        {
          patreon_post_id: "patreon_post_1",
          post_id: "patreon_post_1",
          insights: { impressions: 100, seen: 100, likes: 0, comments: 0, as_of: null },
          relay: {
            title: "Older",
            published_at: "2026-01-13T12:00:00.000Z",
            source: "PATREON",
            upstream_status: "active",
            is_public: true
          },
          gap: "none"
        },
        {
          patreon_post_id: "patreon_post_2",
          post_id: "patreon_post_2",
          insights: { impressions: 200, seen: 400, likes: 0, comments: 0, as_of: null },
          relay: {
            title: "Fresher",
            published_at: "2026-01-15T06:00:00.000Z",
            source: "PATREON",
            upstream_status: "active",
            is_public: true
          },
          gap: "none"
        }
      ]),
      now
    );
    expect(hot?.patreon_post_id).toBe("patreon_post_2");
    expect(hot?.score_label).toBe("seen_per_hour");
  });

  it("uses engagement per hour when seen is zero but likes exist", () => {
    const hot = pickHottestFromPostPerformance(
      report([
        {
          patreon_post_id: "patreon_post_x",
          post_id: "patreon_post_x",
          insights: { impressions: 10, seen: 0, likes: 24, comments: 0, as_of: null },
          relay: {
            title: "Liked",
            published_at: "2026-01-15T00:00:00.000Z",
            source: "PATREON",
            upstream_status: "active",
            is_public: true
          },
          gap: "none"
        }
      ]),
      now
    );
    expect(hot?.score_label).toBe("engagement_per_hour");
    expect(hot?.score_per_hour).toBeGreaterThan(0);
  });

  it("returns null without publish time", () => {
    expect(
      pickHottestFromPostPerformance(
        report([
          {
            patreon_post_id: "p",
            post_id: null,
            insights: { impressions: 1, seen: 999, likes: 0, comments: 0, as_of: null },
            relay: null,
            gap: "metrics_without_relay"
          }
        ]),
        now
      )
    ).toBeNull();
  });
});
