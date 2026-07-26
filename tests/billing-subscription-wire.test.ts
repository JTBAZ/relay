/**
 * @fileoverview Unit tests for getCreatorSubscriptionWire (MB-2 contract).
 */
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getCreatorSubscriptionWire } from "../src/billing/subscription-sync.js";

describe("getCreatorSubscriptionWire", () => {
  it("returns { plan: null } when the account has no subscription", async () => {
    const prisma = {
      planSubscription: {
        findFirst: vi.fn(async () => null)
      }
    } as unknown as PrismaClient;
    const wire = await getCreatorSubscriptionWire(prisma, "acct_none");
    expect(wire).toEqual({ plan: null });
  });

  it("returns subscription mirror fields when a row exists", async () => {
    const end = new Date("2026-08-01T00:00:00.000Z");
    const prisma = {
      planSubscription: {
        findFirst: vi.fn(async () => ({
          scope: "creator",
          creatorPlan: "autopost",
          status: "active",
          currentPeriodEnd: end,
          cancelAtPeriodEnd: false
        }))
      }
    } as unknown as PrismaClient;
    const wire = await getCreatorSubscriptionWire(prisma, "acct_1");
    expect(wire).toEqual({
      scope: "creator",
      plan: "autopost",
      status: "active",
      current_period_end: end.toISOString(),
      cancel_at_period_end: false
    });
  });
});
