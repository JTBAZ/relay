/**
 * @fileoverview Creator plan entitlement resolution + gates (MB-3).
 */
import { CreatorPlan } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  getCreatorPlanEntitlement,
  grantOperatorCreatorPlan,
  isAutopostBetterAllowed,
  planMeetsMinimum,
  requireCreatorPlanAtLeast,
  resolveCreatorPlan
} from "../src/billing/creator-plan-entitlement-service.js";

describe("creator-plan-entitlement-service", () => {
  it("planMeetsMinimum ranks studio_core < autopost < growth_engine", () => {
    expect(planMeetsMinimum(null, CreatorPlan.autopost)).toBe(false);
    expect(planMeetsMinimum(CreatorPlan.studio_core, CreatorPlan.autopost)).toBe(false);
    expect(planMeetsMinimum(CreatorPlan.autopost, CreatorPlan.autopost)).toBe(true);
    expect(planMeetsMinimum(CreatorPlan.growth_engine, CreatorPlan.autopost)).toBe(true);
  });

  it("resolveCreatorPlan prefers non-expired operator_grant over stripe", async () => {
    const prisma = {
      creatorPlanEntitlement: {
        findUnique: vi.fn().mockResolvedValue({
          creatorId: "cr1",
          plan: CreatorPlan.autopost,
          source: "operator_grant",
          expiresAt: null,
          effectiveAt: new Date()
        })
      },
      account: { findFirst: vi.fn() },
      planSubscription: { findFirst: vi.fn() }
    } as never;

    const result = await resolveCreatorPlan(prisma, "cr1");
    expect(result).toEqual({ plan: CreatorPlan.autopost, source: "operator_grant" });
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
  });

  it("resolveCreatorPlan reads Postgres only (no Stripe client)", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      creatorPlanEntitlement: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert,
        delete: vi.fn()
      },
      account: {
        findFirst: vi.fn().mockResolvedValue({ id: "acc1" })
      },
      planSubscription: {
        findFirst: vi.fn().mockResolvedValue({
          creatorPlan: CreatorPlan.studio_core
        })
      }
    } as never;

    const result = await resolveCreatorPlan(prisma, "cr1");
    expect(result).toEqual({ plan: CreatorPlan.studio_core, source: "stripe" });
    expect(upsert).toHaveBeenCalled();
  });

  it("getCreatorPlanEntitlement returns null for expired snapshot", async () => {
    const prisma = {
      creatorPlanEntitlement: {
        findUnique: vi.fn().mockResolvedValue({
          plan: CreatorPlan.autopost,
          source: "operator_grant",
          expiresAt: new Date("2000-01-01T00:00:00.000Z")
        })
      }
    } as never;
    await expect(getCreatorPlanEntitlement(prisma, "cr1")).resolves.toBeNull();
  });

  it("requireCreatorPlanAtLeast returns plan_required when unmet", async () => {
    const prisma = {
      creatorPlanEntitlement: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      account: { findFirst: vi.fn().mockResolvedValue(null) },
      planSubscription: { findFirst: vi.fn() }
    } as never;

    const gate = await requireCreatorPlanAtLeast(prisma, "cr1", CreatorPlan.autopost);
    expect(gate).toEqual({
      ok: false,
      error: "plan_required",
      required_plan: CreatorPlan.autopost
    });
  });

  it("isAutopostBetterAllowed is true with legacy posting_assistant flag", async () => {
    const prisma = {
      creatorPlanEntitlement: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      account: { findFirst: vi.fn().mockResolvedValue(null) },
      planSubscription: { findFirst: vi.fn() },
      creatorFeatureFlag: {
        findUnique: vi.fn().mockResolvedValue({ postingAssistantEnabled: true })
      }
    } as never;

    await expect(isAutopostBetterAllowed(prisma, "cr1")).resolves.toBe(true);
  });

  it("isAutopostBetterAllowed is false with neither plan nor flag", async () => {
    const prisma = {
      creatorPlanEntitlement: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      account: { findFirst: vi.fn().mockResolvedValue(null) },
      planSubscription: { findFirst: vi.fn() },
      creatorFeatureFlag: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    } as never;

    await expect(isAutopostBetterAllowed(prisma, "cr1")).resolves.toBe(false);
  });

  it("grantOperatorCreatorPlan upserts entitlement", async () => {
    const upsert = vi.fn().mockResolvedValue({
      creatorId: "cr1",
      plan: CreatorPlan.growth_engine,
      source: "operator_grant",
      expiresAt: null
    });
    const prisma = { creatorPlanEntitlement: { upsert } } as never;
    const row = await grantOperatorCreatorPlan(prisma, {
      creatorId: "cr1",
      plan: CreatorPlan.growth_engine
    });
    expect(row.plan).toBe(CreatorPlan.growth_engine);
    expect(row.source).toBe("operator_grant");
    expect(upsert).toHaveBeenCalled();
  });
});
