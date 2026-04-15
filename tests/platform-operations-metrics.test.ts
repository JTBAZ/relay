import { describe, expect, it, vi } from "vitest";
import { CredentialHealth, OAuthPurpose } from "@prisma/client";
import { evaluatePlatformOperationsHealth } from "../src/health/platform-operations-metrics.js";

describe("evaluatePlatformOperationsHealth (MIG-51)", () => {
  it("returns limited status without prisma", async () => {
    const h = await evaluatePlatformOperationsHealth(undefined);
    expect(h.status).toBe("limited");
    expect(h.database.prisma_configured).toBe(false);
    expect(h.auth_routes.supabase_sync_attempts_total).toBe(0);
  });

  it("aggregates DB, OAuth counts, snapshots, and alerts", async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ c: 3 }])
        .mockResolvedValueOnce([{ setting: "100" }]),
      oAuthCredential: {
        count: vi.fn().mockResolvedValue(1)
      },
      patronOAuthCredential: {
        count: vi.fn().mockResolvedValue(0)
      },
      patronEntitlementSnapshot: {
        count: vi
          .fn()
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(2),
        findFirst: vi.fn().mockResolvedValue({
          asOf: new Date("2025-01-01T00:00:00.000Z")
        })
      }
    };
    const h = await evaluatePlatformOperationsHealth(prisma as never);
    expect(h.status).toBe("degraded");
    expect(h.database.backend_connections).toBe(3);
    expect(h.database.max_connections).toBe(100);
    expect(h.patreon_oauth.creator_credentials_unhealthy).toBe(1);
    expect(h.patron_entitlements.snapshot_row_count).toBe(10);
    expect(h.patron_entitlements.snapshots_past_stale_after).toBe(2);
    expect(h.alerts.some((a) => a.includes("patron_entitlement"))).toBe(true);
    expect(prisma.oAuthCredential.count).toHaveBeenCalledWith({
      where: {
        purpose: OAuthPurpose.creator_ingest,
        healthStatus: { not: CredentialHealth.healthy }
      }
    });
  });
});
