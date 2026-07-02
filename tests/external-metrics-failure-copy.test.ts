import { describe, expect, it } from "vitest";
import { describeExternalMetricsRefreshFailure } from "../extension/src/lib/external-metrics-failure-copy.js";
import { describeRelayExternalMetricsRefreshExtensionFailure } from "../web/lib/relay-extension-messaging.js";

describe("external metrics failure copy", () => {
  it("maps extension refresh reasons to user-facing detail", () => {
    expect(
      describeExternalMetricsRefreshFailure({ ok: false, reason: "not_connected" })
    ).toContain("Connect the Relay extension");
    expect(
      describeExternalMetricsRefreshFailure({
        ok: false,
        reason: "metrics_post_failed",
        detail: "Custom detail"
      })
    ).toBe("Custom detail");
  });

  it("maps extension response objects to user-facing detail", () => {
    expect(
      describeRelayExternalMetricsRefreshExtensionFailure({
        ok: false,
        reason: "inject_failed"
      })
    ).toContain("inject");
    expect(
      describeRelayExternalMetricsRefreshExtensionFailure({
        ok: false,
        reason: "metrics_post_failed",
        detail: "Relay could not save stats (HTTP 401)."
      })
    ).toBe("Relay could not save stats (HTTP 401).");
  });
});
