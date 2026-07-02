/** @vitest-environment happy-dom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PerformanceWorkBundleData } from "@/lib/relay-api";
import { WorkDrilldownView } from "../../web/app/studio/analytics/WorkDrilldownView";

const noop = () => {};

function sampleBundle(): PerformanceWorkBundleData {
  return {
    creative_work_id: "work_alpha",
    title: "Alpha Bundle",
    description: "Bundle description",
    analytics_campaign_label: "Launch",
    tags: ["fantasy"],
    is_default_bundle: false,
    as_of: "2026-06-30T12:00:00.000Z",
    range: "30d",
    time_range: {
      start: "2026-05-31T00:00:00.000Z",
      end: "2026-06-30T12:00:00.000Z"
    },
    totals: {
      impressions: 3000,
      seen: 900,
      likes: 40,
      comments: 6,
      views: 0
    },
    by_destination: [
      {
        destination: "patreon",
        impressions: 3000,
        seen: 900,
        likes: 40,
        comments: 6,
        views: 0
      },
      {
        destination: "relay",
        impressions: 0,
        seen: 0,
        likes: 0,
        comments: 0,
        views: 240
      }
    ],
    daily_series: [
      { day: "2026-06-28", impressions: 800, seen: 200, likes: 8, comments: 1, views: 0 },
      { day: "2026-06-29", impressions: 1200, seen: 350, likes: 12, comments: 2, views: 0 }
    ],
    total_reach: 4140,
    variants: [
      {
        post_id: "post_alpha",
        title: "Alpha Post",
        variant_role: "primary",
        total_reach: 3900,
        totals: {
          impressions: 3000,
          seen: 900,
          likes: 40,
          comments: 6,
          views: 0
        },
        by_destination: [
          {
            destination: "patreon",
            impressions: 3000,
            seen: 900,
            likes: 40,
            comments: 6,
            views: 0
          }
        ],
        platform_instances: [
          {
            platform_instance_id: "pi_alpha",
            destination: "patreon",
            external_url: "https://patreon.com/posts/alpha",
            external_id: "alpha",
            attempt_id: "att_alpha",
            link_source: "distribution",
            status: "active",
            refresh_policy: "conservative",
            linked_at: "2026-06-01T00:00:00.000Z",
            last_refreshed_at: "2026-06-30T08:00:00.000Z"
          }
        ]
      }
    ],
    freshness: {
      rollup_computed_at: "2026-06-30T10:00:00.000Z",
      stale: false,
      stale_after_hours: 48
    },
    source_summary: [{ destination: "patreon", source: "rollup", confidence: "high" }],
    crosspost_gaps: {
      present_destinations: ["patreon"],
      missing_destinations: ["x", "deviantart", "bluesky"],
      missing_teaser_destinations: [],
      suggested_source_post_id: "post_alpha"
    }
  };
}

describe("<WorkDrilldownView />", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders summary, platform breakdown, trend, variants, and actions", () => {
    render(
      <WorkDrilldownView
        bundle={sampleBundle()}
        performanceRange="30d"
        onPerformanceRangeChange={noop}
        suggestedActions={[
          {
            id: "action-1",
            title: "Double down on Alpha Post",
            body: "This variant drove most of the reach.",
            tone: "growth",
            href: "/studio/preview?post_id=post_alpha"
          }
        ]}
        refreshBusyId={null}
        refreshMessage={null}
        onRefreshInstance={noop}
      />
    );

    expect(screen.getByTestId("work-drilldown-view")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Alpha Bundle" })).toBeTruthy();
    expect(screen.getByTestId("work-drilldown-platform-breakdown").textContent).toContain("Patreon");
    expect(screen.getByTestId("work-drilldown-trend")).toBeTruthy();
    expect(screen.getByTestId("work-drilldown-best-performer").textContent).toContain("Alpha Post");
    expect(screen.getByTestId("work-drilldown-actions").textContent).toContain("Double down");
    expect(screen.getByTestId("work-drilldown-variants").textContent).toContain("Alpha Post");
    expect(screen.getByTestId("work-drilldown-instance-pi_alpha")).toBeTruthy();
  });

  it("calls refresh handler for a platform instance", () => {
    const onRefreshInstance = vi.fn();
    render(
      <WorkDrilldownView
        bundle={sampleBundle()}
        performanceRange="30d"
        onPerformanceRangeChange={noop}
        suggestedActions={[]}
        refreshBusyId={null}
        refreshMessage={null}
        onRefreshInstance={onRefreshInstance}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    expect(onRefreshInstance).toHaveBeenCalledWith("pi_alpha");
  });

  it("changes performance range via range controls", () => {
    const onPerformanceRangeChange = vi.fn();
    render(
      <WorkDrilldownView
        bundle={sampleBundle()}
        performanceRange="30d"
        onPerformanceRangeChange={onPerformanceRangeChange}
        suggestedActions={[]}
        refreshBusyId={null}
        refreshMessage={null}
        onRefreshInstance={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    expect(onPerformanceRangeChange).toHaveBeenCalledWith("7d");
  });
});
