import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ tokenId: "grant", report: vi.fn(), inject: vi.fn(async () => []), notify: vi.fn() }));
const url = "https://www.patreon.com/posts/123";
vi.mock("../../extension/src/lib/browser", () => ({ default: {
  tabs: { query: async () => [{ id: 1, url: "https://www.patreon.com/posts/123" }], update: async () => ({}), get: async () => ({ status: "complete", url: "https://www.patreon.com/posts/123" }), onUpdated: { addListener: () => {}, removeListener: () => {} } },
  scripting: { executeScript: fixture.inject }
} }));
vi.mock("../../extension/src/lib/storage", () => ({ getGrant: async () => ({ token: "fixture", token_id: fixture.tokenId, relay_creator_id: "creator" }), setPendingExternalMetricsScrape: async () => {} }));
vi.mock("../../extension/src/lib/external-metrics-report", () => ({ reportExternalPostMetrics: fixture.report }));
vi.mock("../../extension/src/lib/relay-tab-notify", () => ({ notifyRelayWebExternalMetricsUpdated: fixture.notify }));
vi.mock("../../extension/src/lib/patreon-post-metrics-fetch", async (original) => ({ ...await original<object>(), fetchPatreonPostMetricsWithSession: async () => ({ ok: false, metrics: [], diagnostics: { reason: "unavailable" } }) }));
import { runExternalMetricsRefreshFlow, handleExternalMetricsResultMessage } from "../../extension/src/lib/external-metrics-refresh-flow";
import { MSG_EXTERNAL_METRICS_RESULT } from "../../extension/src/lib/messages";
import { MSG_RELAY_EXTERNAL_METRICS_REFRESH } from "../../extension/src/lib/external-metrics-types";

const full = ["impressions", "seen", "likes", "comments"].map((metric_type) => ({ metric_type, value: 1 }));
const message = { type: MSG_RELAY_EXTERNAL_METRICS_REFRESH, attempt_id: "attempt", post_id: "patreon_post_123", destination: "patreon" as const, external_url: url };
const result = { ...message, type: MSG_EXTERNAL_METRICS_RESULT, ok: true, attempt_id: "attempt" };
beforeEach(() => { vi.useFakeTimers(); fixture.tokenId = "grant"; fixture.report.mockReset().mockResolvedValue({ ok: true, snapshot_count: 2 }); fixture.inject.mockClear(); fixture.notify.mockClear(); });
afterEach(() => { vi.useRealTimers(); });
describe("PS13 actual metrics refresh outcomes", () => {
  it.each([[true, full.slice(0, 1), "partial"], [false, full, "partial"], [true, [{ metric_type: "title", value: null }], "unavailable"]] as const)("keeps saved observations qualified when panel=%s", async (ok, metrics, coverage) => {
    const pending = runExternalMetricsRefreshFlow(message); await vi.advanceTimersByTimeAsync(1201);
    expect(fixture.inject).toHaveBeenCalledTimes(1);
    await handleExternalMetricsResultMessage({ ...result, ok, metrics: [...metrics] });
    expect(await pending).toMatchObject({ ok: false, reason: "partial_capture", coverage, snapshot_count: 2 });
    expect(fixture.report).toHaveBeenCalledTimes(1); expect(fixture.notify).toHaveBeenCalledTimes(1);
  });
  it("requires all requested counters and a successful panel for complete success", async () => {
    const pending = runExternalMetricsRefreshFlow(message); await vi.advanceTimersByTimeAsync(1201);
    await handleExternalMetricsResultMessage({ ...result, metrics: full });
    expect(await pending).toMatchObject({ ok: true, snapshot_count: 2 });
  });
  it("ignores mismatched targets and switched grants before reporting", async () => {
    const pending = runExternalMetricsRefreshFlow(message); await vi.advanceTimersByTimeAsync(1201);
    await handleExternalMetricsResultMessage({ ...result, post_id: "another-post", metrics: full });
    expect(fixture.report).not.toHaveBeenCalled();
    fixture.tokenId = "new-grant";
    await handleExternalMetricsResultMessage({ ...result, metrics: full }); expect(fixture.report).not.toHaveBeenCalled();
    fixture.tokenId = "grant"; await handleExternalMetricsResultMessage({ ...result, metrics: full }); await pending;
  });
});
