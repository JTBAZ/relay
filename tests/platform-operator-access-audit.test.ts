import { describe, expect, it, vi } from "vitest";
import {
  PLATFORM_OPERATOR_AUDIT_ACTIONS,
  countPlatformOperatorAccessAudits,
  getLatestPlatformOperatorAccessAuditAt,
  recordPlatformOperatorAccessAudit
} from "../src/platform-metrics/platform-operator-access-audit.js";

describe("platform operator access audit (PMD-071)", () => {
  it("persists append-only audit rows", async () => {
    const create = vi.fn().mockResolvedValue({ id: "audit_1" });
    const prisma = { platformOperatorAccessAudit: { create } } as never;

    await recordPlatformOperatorAccessAudit({
      prisma,
      action: PLATFORM_OPERATOR_AUDIT_ACTIONS.registryRead,
      outcome: "allowed",
      reason: "account_allowlist",
      accountId: "acc_operator",
      traceId: "trace_1",
      route: "/api/v1/platform-metrics/registry",
      method: "GET"
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        action: "platform_metrics.registry.read",
        outcome: "allowed",
        reason: "account_allowlist",
        accountId: "acc_operator",
        traceId: "trace_1",
        route: "/api/v1/platform-metrics/registry",
        method: "GET"
      }
    });
  });

  it("reads latest audit timestamp", async () => {
    const createdAt = new Date("2026-05-25T12:00:00.000Z");
    const prisma = {
      platformOperatorAccessAudit: {
        findFirst: vi.fn().mockResolvedValue({ createdAt }),
        count: vi.fn()
      }
    } as never;

    const latest = await getLatestPlatformOperatorAccessAuditAt(prisma);
    expect(latest?.toISOString()).toBe(createdAt.toISOString());
  });

  it("counts audit rows", async () => {
    const prisma = {
      platformOperatorAccessAudit: {
        count: vi.fn().mockResolvedValue(7)
      }
    } as never;
    expect(await countPlatformOperatorAccessAudits(prisma)).toBe(7);
  });
});
