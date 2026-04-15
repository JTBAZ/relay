import { describe, expect, it } from "vitest";
import { buildPatronEntitlementHealthPayload } from "../src/gallery/entitlement-degraded.js";

describe("buildPatronEntitlementHealthPayload (MIG-42)", () => {
  it("file storage explains session-only semantics", () => {
    const p = buildPatronEntitlementHealthPayload({ storage: "file", row: null });
    expect(p.storage).toBe("file");
    expect(p.degraded).toBe(false);
    expect(p.patron_entitlement).toBeNull();
    expect(p.messaging).toMatch(/session/i);
  });

  it("postgres without row is degraded (missing snapshot)", () => {
    const p = buildPatronEntitlementHealthPayload({ storage: "postgres", row: null });
    expect(p.degraded).toBe(true);
    expect(p.degraded_reason).toBe("missing_snapshot");
  });

  it("postgres fresh row is not degraded", () => {
    const asOf = new Date("2026-06-01T12:00:00.000Z");
    const staleAfter = new Date("2026-06-02T12:00:00.000Z");
    const p = buildPatronEntitlementHealthPayload({
      storage: "postgres",
      row: { asOf, staleAfter },
      now: new Date("2026-06-01T18:00:00.000Z")
    });
    expect(p.degraded).toBe(false);
    expect(p.patron_entitlement?.as_of).toBe(asOf.toISOString());
    expect(p.degraded_reason).toBeNull();
  });

  it("postgres stale snapshot is degraded", () => {
    const p = buildPatronEntitlementHealthPayload({
      storage: "postgres",
      row: {
        asOf: new Date("2026-06-01T12:00:00.000Z"),
        staleAfter: new Date("2026-06-01T13:00:00.000Z")
      },
      now: new Date("2026-06-02T00:00:00.000Z")
    });
    expect(p.degraded).toBe(true);
    expect(p.degraded_reason).toBe("stale_snapshot");
  });
});
