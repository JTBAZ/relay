import { describe, expect, it } from "vitest";
import {
  isSensitivePlainObjectKey,
  redactSensitiveKeysInObject,
  scrubRequestHeaders,
  scrubTokenSubstrings,
  TEST_RAW_TOKEN_LEAK_MARK
} from "../src/lib/pii-scrub.js";

describe("pii-scrub (P2-obs-008)", () => {
  it("scrubTokenSubstrings removes Bearer and access_token= patterns", () => {
    expect(scrubTokenSubstrings("Authorization Bearer abc.def.ghi")).toContain("Bearer [Redacted]");
    expect(
      scrubTokenSubstrings(`prefix access_token=${TEST_RAW_TOKEN_LEAK_MARK} suffix`)
    ).not.toContain(TEST_RAW_TOKEN_LEAK_MARK);
  });

  it("isSensitivePlainObjectKey matches hyphenated OAuth-style keys", () => {
    expect(isSensitivePlainObjectKey("access_token")).toBe(true);
    expect(isSensitivePlainObjectKey("access-token")).toBe(true);
    expect(isSensitivePlainObjectKey("trace_id")).toBe(false);
    expect(isSensitivePlainObjectKey("userEmail")).toBe(true);
  });

  it("redactSensitiveKeysInObject deep-redacts and scrubs strings", () => {
    const out = redactSensitiveKeysInObject({
      safe: "ok",
      nested: { access_token: "secret", note: `Bearer ${TEST_RAW_TOKEN_LEAK_MARK}` }
    }) as Record<string, unknown>;
    expect(out.nested).toEqual({
      access_token: "[Redacted]",
      note: "Bearer [Redacted]"
    });
  });
});

describe("scrubRequestHeaders", () => {
  it("redacts forwarding and auth headers", () => {
    const h = scrubRequestHeaders({
      authorization: "Bearer x",
      "X-Forwarded-For": "203.0.113.9",
      host: "localhost"
    });
    expect(h.authorization).toBe("[Redacted]");
    expect(h["X-Forwarded-For"]).toBe("[Redacted]");
    expect(h.host).toBe("localhost");
  });
});
