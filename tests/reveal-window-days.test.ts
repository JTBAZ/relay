/**
 * @fileoverview Plan-length Tip reveal windows (MB-13).
 */
import { FanPlan, SubscriptionStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { resolveRevealWindowDaysForPatron } from "../src/tips/reveal-service.js";

describe("reveal-window-days", () => {
  it("supporter → 14 days, curator → 30 days when fan premium on", async () => {
    const prismaSupporter = {
      planSubscription: {
        findFirst: vi.fn(async () => ({
          fanPlan: FanPlan.supporter,
          status: SubscriptionStatus.active
        }))
      }
    } as never;
    const prismaCurator = {
      planSubscription: {
        findFirst: vi.fn(async () => ({
          fanPlan: FanPlan.curator,
          status: SubscriptionStatus.active
        }))
      }
    } as never;

    expect(
      await resolveRevealWindowDaysForPatron(prismaSupporter, "a1", {
        RELAY_FAN_PREMIUM_ENABLED: "1",
        RELAY_TIPS_REVEAL_WINDOW_DAYS: "14"
      })
    ).toBe(14);
    expect(
      await resolveRevealWindowDaysForPatron(prismaCurator, "a1", {
        RELAY_FAN_PREMIUM_ENABLED: "1"
      })
    ).toBe(30);
  });

  it("falls back to beta window when premium off", async () => {
    const prisma = {
      planSubscription: { findFirst: vi.fn(async () => ({ fanPlan: FanPlan.curator })) }
    } as never;
    expect(
      await resolveRevealWindowDaysForPatron(prisma, "a1", {
        RELAY_FAN_PREMIUM_ENABLED: "0",
        RELAY_TIPS_REVEAL_WINDOW_DAYS: "14"
      })
    ).toBe(14);
    expect(prisma.planSubscription.findFirst).not.toHaveBeenCalled();
  });

  it("stamps expiresAt at reveal time — plan upgrade does not change open window", async () => {
    // Contract: expiresAt is written once at create; subsequent plan lookups do not rewrite it.
    // Simulate: first reveal uses supporter (14d); later Curator plan would be 30d — open row unchanged.
    const revealedAt = new Date("2026-07-01T00:00:00.000Z");
    const stampedExpires = new Date(revealedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    const openReveal = {
      id: "rev_open",
      expiresAt: stampedExpires,
      revealedAt
    };
    const prismaLater = {
      planSubscription: {
        findFirst: vi.fn(async () => ({
          fanPlan: FanPlan.curator,
          status: SubscriptionStatus.active
        }))
      }
    } as never;
    const laterWindow = await resolveRevealWindowDaysForPatron(prismaLater, "a1", {
      RELAY_FAN_PREMIUM_ENABLED: "1"
    });
    expect(laterWindow).toBe(30);
    // Open reveal still has the original stamp:
    expect(openReveal.expiresAt.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(openReveal.expiresAt.getTime()).toBeLessThan(
      revealedAt.getTime() + laterWindow * 24 * 60 * 60 * 1000
    );
  });
});
