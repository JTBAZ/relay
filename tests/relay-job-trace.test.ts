import { describe, expect, it } from "vitest";
import {
  newRelayJobTraceId,
  relayJobTraceIdForProcessing
} from "../src/jobs/relay-job-trace.js";

describe("newRelayJobTraceId", () => {
  it("uses job_ prefix and UUID shape", () => {
    const id = newRelayJobTraceId();
    expect(id).toMatch(/^job_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

describe("relayJobTraceIdForProcessing", () => {
  it("returns trimmed traceId when payload sets it", () => {
    expect(
      relayJobTraceIdForProcessing({ traceId: "  upstream-1  " })
    ).toBe("upstream-1");
  });

  it("synthesizes when missing or blank", () => {
    const a = relayJobTraceIdForProcessing({});
    expect(a).toMatch(/^job_/);
    expect(relayJobTraceIdForProcessing({ traceId: "" })).toMatch(/^job_/);
    expect(relayJobTraceIdForProcessing({ traceId: "   " })).toMatch(/^job_/);
    expect(relayJobTraceIdForProcessing(undefined)).toMatch(/^job_/);
  });
});
