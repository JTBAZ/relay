import { describe, expect, it, vi } from "vitest";
import {
  emitRateLimit429ForRequest,
  emitUsageEvent,
  registerUsageMeteringPrisma,
  getRegisteredUsagePrisma,
  resolveTenantIdForRelayCreator
} from "../src/usage/usage-events.js";

describe("usage events (M1-lite)", () => {
  it("resolveTenantIdForRelayCreator returns id when row exists", async () => {
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: "t1" })
      }
    } as never;
    await expect(
      resolveTenantIdForRelayCreator(prisma, "creator_a")
    ).resolves.toBe("t1");
  });

  it("emitUsageEvent resolves tenant from relayCreatorId", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: "tenant_1" })
      },
      usageEvent: { create }
    } as never;

    await emitUsageEvent(prisma, {
      relayCreatorId: "cr_x",
      metric: "test.metric",
      quantity: 5
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        metric: "test.metric",
        quantity: 5n,
        meta: undefined,
        occurredAt: undefined
      })
    });
  });

  it("emitRateLimit429ForRequest links account relay key to tenant", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      account: {
        findUnique: vi.fn().mockResolvedValue({ primaryRelayCreatorId: "cr99" })
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: "t99" })
      },
      usageEvent: { create }
    } as never;

    const req = {
      path: "/api/v1/patron/x",
      method: "POST",
      relayRateLimitKey: "acc_1"
    } as never;

    await emitRateLimit429ForRequest(prisma, req);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t99",
        metric: "api.rate_limited",
        quantity: 1n,
        meta: { path: "/api/v1/patron/x", method: "POST" }
      })
    });
  });

  it("registerUsageMeteringPrisma wires getter for rate-limit handler", () => {
    const fake = {} as never;
    registerUsageMeteringPrisma(() => fake);
    expect(getRegisteredUsagePrisma()).toBe(fake);
  });
});
