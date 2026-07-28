import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../extension/src/lib/storage", () => ({
  getGrant: vi.fn()
}));

import {
  isExternalMetricsRefreshMessage,
  isExternalMetricsScrapeMetric,
  MSG_RELAY_EXTERNAL_METRICS_REFRESH
} from "../extension/src/lib/external-metrics-types.js";
import { reportExternalPostMetrics } from "../extension/src/lib/external-metrics-report.js";
import * as storage from "../extension/src/lib/storage.js";

describe("external metrics message contract", () => {
  it("accepts a valid Relay web refresh message", () => {
    expect(
      isExternalMetricsRefreshMessage({
        type: MSG_RELAY_EXTERNAL_METRICS_REFRESH,
        attempt_id: "pda_test",
        post_id: "post_test",
        destination: "patreon",
        external_url: "https://www.patreon.com/RelayTEST/posts/test-162544992"
      })
    ).toBe(true);
  });

  it("rejects refresh messages with missing fields or unsupported destinations", () => {
    expect(
      isExternalMetricsRefreshMessage({
        type: MSG_RELAY_EXTERNAL_METRICS_REFRESH,
        attempt_id: "",
        post_id: "post_test",
        destination: "patreon",
        external_url: "https://www.patreon.com/posts/test-1"
      })
    ).toBe(false);
    expect(
      isExternalMetricsRefreshMessage({
        type: MSG_RELAY_EXTERNAL_METRICS_REFRESH,
        attempt_id: "pda_test",
        post_id: "post_test",
        destination: "bluesky",
        external_url: "https://example.com/post/1"
      })
    ).toBe(false);
  });

  it("accepts instance-scoped refresh messages without attempt_id", () => {
    expect(
      isExternalMetricsRefreshMessage({
        type: MSG_RELAY_EXTERNAL_METRICS_REFRESH,
        platform_instance_id: "pi_manual_patreon_post_1_patreon",
        post_id: "patreon_post_1",
        destination: "patreon",
        external_url: "https://www.patreon.com/posts/1"
      })
    ).toBe(true);
  });

  it("validates scrape metric payloads", () => {
    expect(
      isExternalMetricsScrapeMetric({
        metric_type: "likes",
        value: 12,
        raw: { label: "Likes" }
      })
    ).toBe(true);
    expect(isExternalMetricsScrapeMetric({ metric_type: "likes", value: "12" })).toBe(false);
  });
});

describe("reportExternalPostMetrics", () => {
  beforeEach(() => {
    vi.mocked(storage.getGrant).mockResolvedValue({
      token: "grant_token_test",
      relay_creator_id: "rcx_test",
      token_id: "tok_test",
      expires_at: "2099-01-01T00:00:00.000Z",
      account_id: "acc_test",
      created_at: "2026-06-30T18:00:00.000Z"
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts metrics to the ingest API with the extension grant token", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            snapshots: [{ snapshot_id: "epms_1" }, { snapshot_id: "epms_2" }]
          }
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await reportExternalPostMetrics(
      {
        attempt_id: "pda_test",
        source: "extension_dom",
        metrics: [
          { metric_type: "likes", value: 12 },
          { metric_type: "comments", value: 3 }
        ]
      },
      { relayApiBase: "http://localhost:8787" }
    );

    expect(result).toEqual({ ok: true, snapshot_count: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/api/v1/relay/distribution-attempts/pda_test/metrics",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer grant_token_test"
        })
      })
    );
  });

  it("posts metrics to the platform-instance endpoint when attempt is absent", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: { snapshots: [{ snapshot_id: "epms_1" }] }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await reportExternalPostMetrics(
      {
        platform_instance_id: "pi_manual_1",
        source: "platform_api",
        metrics: [{ metric_type: "comments", value: 2 }]
      },
      { relayApiBase: "http://localhost:8787" }
    );

    expect(result).toEqual({ ok: true, snapshot_count: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/api/v1/creator/analytics/platform-instances/pi_manual_1/metrics",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns ok:false when grant or metrics are missing", async () => {
    vi.mocked(storage.getGrant).mockResolvedValue(undefined);
    const result = await reportExternalPostMetrics({
      attempt_id: "pda_test",
      source: "extension_dom",
      metrics: []
    });
    expect(result).toEqual({ ok: false, snapshot_count: 0 });
  });
});
