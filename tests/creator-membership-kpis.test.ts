import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { getCreatorMembershipKpis } from "../src/analytics/creator-membership-kpis.js";

describe("getCreatorMembershipKpis", () => {
  it("returns null when tenant is missing", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) }
    };
    await expect(
      getCreatorMembershipKpis(prisma as never, "c_missing", 30)
    ).resolves.toBeNull();
  });

  it("computes adds, cancels, net growth, and paying vs free", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "ten_1" }) },
      tenantMembership: {
        findMany: vi.fn().mockResolvedValue([
          { tierIds: ["patreon_tier_gold"] },
          { tierIds: [] }
        ])
      },
      tier: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "row1",
            relayTierId: "patreon_tier_gold",
            title: "Gold",
            amountCents: 500
          }
        ])
      },
      creatorMembershipEvent: {
        count: vi
          .fn()
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(100)
      }
    };

    const r = await getCreatorMembershipKpis(prisma as never, "relay_x", 14);
    expect(r).not.toBeNull();
    expect(r!.adds_in_window).toBe(3);
    expect(r!.cancels_in_window).toBe(1);
    expect(r!.net_growth_events).toBe(2);
    expect(r!.active_paying_members).toBe(1);
    expect(r!.free_patrons).toBe(1);
    expect(r!.total_patrons).toBe(2);
    expect(r!.tier_breakdown).toEqual([
      {
        tier_id: "patreon_tier_gold",
        title: "Gold",
        amount_cents: 500,
        patron_count: 1
      }
    ]);
    expect(r!.estimated_from_sync).toBe(true);
    expect(r!.window.days).toBe(14);
  });
});

function bareConfig(tempDir: string) {
  return {
    patreon_client_id: "c",
    patreon_client_secret: "s",
    relay_token_encryption_key: randomBytes(32).toString("base64"),
    credential_store_path: join(tempDir, "patreon.json"),
    cookie_store_path: join(tempDir, "cookies.json"),
    ingest_canonical_path: join(tempDir, "canonical.json"),
    ingest_dlq_path: join(tempDir, "dlq.json"),
    patreon_sync_watermark_path: join(tempDir, "watermarks.json"),
    patreon_sync_health_path: join(tempDir, "patreon_sync_health.json"),
    creator_campaign_display_path: join(tempDir, "creator_campaign_display.json"),
    export_storage_root: join(tempDir, "exports"),
    gallery_post_overrides_path: join(tempDir, "gallery_overrides.json"),
    gallery_saved_filters_path: join(tempDir, "saved_filters.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  };
}

describe("GET /api/v1/creator/analytics/membership-summary", () => {
  it("returns 503 when Prisma is not wired on AppConfig", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-mship-kpi-"));
    const { app } = createApp(bareConfig(tempDir));

    const res = await request(app).get("/api/v1/creator/analytics/membership-summary");
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
  });
});
