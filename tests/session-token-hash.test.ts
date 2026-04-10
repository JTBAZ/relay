import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashOpaqueSessionToken } from "../src/identity/session-token-hash.js";

describe("hashOpaqueSessionToken", () => {
  it("matches SHA-256 hex of utf8 token", () => {
    const t = "sess_test_opaque";
    expect(hashOpaqueSessionToken(t)).toBe(
      createHash("sha256").update(t, "utf8").digest("hex")
    );
  });
});
