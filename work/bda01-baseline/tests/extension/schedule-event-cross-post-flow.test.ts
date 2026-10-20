import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchPackage: vi.fn(), openTab: vi.fn(), waitReady: vi.fn(), inject: vi.fn(),
}));
vi.mock("../../extension/src/lib/cross-post-fetch", () => ({ fetchAndStoreCrossPostPackageFromMessage: mocks.fetchPackage }));
vi.mock("../../extension/src/lib/cross-post-tab-inject", () => ({
  openCrossPostTab: mocks.openTab, waitForCrossPostTabReady: mocks.waitReady, injectCrossPostFillScript: mocks.inject,
}));

import { runRelayCrossPostFlow } from "../../extension/src/lib/cross-post-flow";

const eventId = `bench_event_${"d".repeat(64)}`;

describe("schedule-event X compose flow", () => {
  it("refuses a response for a different event before opening or injecting a tab", async () => {
    mocks.fetchPackage.mockResolvedValue({ ok: true, schedule_event_id: `bench_event_${"e".repeat(64)}`, relay_post_id: "post-1", destination: "x" });
    const result = await runRelayCrossPostFlow({ type: "RELAY_CROSS_POST", schedule_event_id: eventId, destination: "x" });
    expect(result).toEqual({ ok: false, reason: "package_fetch_failed", detail: "event_mismatch" });
    expect(mocks.openTab).not.toHaveBeenCalled();
    expect(mocks.waitReady).not.toHaveBeenCalled();
    expect(mocks.inject).not.toHaveBeenCalled();
  });
});
