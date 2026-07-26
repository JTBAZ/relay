/**
 * @fileoverview Tip reveal unlocks viewer entitlement (MB-6 vessel).
 */
import { describe, expect, it, vi } from "vitest";
import { computeViewerEntitlementForPost } from "../src/patron/viewer-entitlement.js";

vi.mock("../src/tips/open-tip-reveal.js", () => ({
  hasOpenTipReveal: vi.fn(async () => true),
  openTipRevealPostIds: vi.fn(async () => new Set<string>())
}));

import { hasOpenTipReveal } from "../src/tips/open-tip-reveal.js";

describe("tip-reveal-entitlement", () => {
  it("marks locked posts visible when an open TipReveal exists", async () => {
    const prisma = {
      post: {
        findFirst: vi.fn(async () => ({
          isPublic: false,
          versions: [{ tierIds: ["tier_paid"] }]
        }))
      },
      tenantMembership: {
        findMany: vi.fn(async () => [{ id: "tm1" }])
      },
      patronEntitlementSnapshot: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => [])
      },
      tier: {
        findMany: vi.fn(async () => [])
      }
    } as never;

    const decision = await computeViewerEntitlementForPost({
      prisma,
      viewer_account_id: "acc1",
      source_creator_id: "cr1",
      source_post_id: "post1"
    });

    expect(hasOpenTipReveal).toHaveBeenCalled();
    expect(decision.state).toBe("visible");
    expect(decision.source).toBe("tip_reveal");
  });
});
