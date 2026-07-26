import { describe, expect, it } from "vitest";
import {
  describeRelayCrossPostExtensionFailure,
  describeRelayCrossPostFailure,
  isRelayCrossPostSuccess
} from "./relay-extension-messaging";

describe("isRelayCrossPostSuccess", () => {
  it("accepts extension success payloads", () => {
    expect(isRelayCrossPostSuccess({ ok: true, tab_id: 12, relay_post_id: "post_1" })).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(isRelayCrossPostSuccess({ ok: true, tab_id: "12", relay_post_id: "post_1" })).toBe(false);
    expect(isRelayCrossPostSuccess({ ok: false, reason: "not_connected" })).toBe(false);
    expect(isRelayCrossPostSuccess(null)).toBe(false);
  });
});

describe("describeRelayCrossPostFailure", () => {
  it("maps local preflight failures", () => {
    expect(describeRelayCrossPostFailure({ ok: false, reason: "no_runtime" })).toMatch(
      /Chrome or Firefox/i
    );
  });
});

describe("describeRelayCrossPostExtensionFailure", () => {
  it("maps extension not_connected", () => {
    expect(describeRelayCrossPostExtensionFailure({ ok: false, reason: "not_connected" })).toMatch(
      /Connect the Relay extension/i
    );
  });
});
