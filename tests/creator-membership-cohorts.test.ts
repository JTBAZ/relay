import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { CreatorMembershipEventType } from "@prisma/client";
import { createApp } from "../src/server.js";
import {
  getCreatorMembershipCohortRetention,
  paidAtLedgerEnd
} from "../src/analytics/creator-membership-cohorts.js";

describe("paidAtLedgerEnd", () => {
  it("tracks join, cancel, rejoin", () => {
    const endMarch = new Date(Date.UTC(2025, 3, 0, 23, 59, 59, 999));
    const evs = [
      {
        type: CreatorMembershipEventType.join,
        at: new Date("2025-01-10T00:00:00Z")
      },
      {
        type: CreatorMembershipEventType.cancel,
        at: new Date("2025-02-10T00:00:00Z")
      },
      {
        type: CreatorMembershipEventType.rejoin,
        at: new Date("2025-02-20T00:00:00Z")
      }
    ];
    expect(paidAtLedgerEnd(evs, new Date("2025-01-31T23:59:59Z"))).toBe(true);
    expect(paidAtLedgerEnd(evs, new Date("2025-02-15T00:00:00Z"))).toBe(false);
    expect(paidAtLedgerEnd(evs, endMarch)).toBe(true);
  });
});

describe("getCreatorMembershipCohortRetention (golden)", () => {
  it("computes retention for two-member January cohort", async () => {
    const asOf = new Date("2025-06-15T12:00:00Z");
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "ten" }) },
      creatorMembershipEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            patreonMemberId: "m_a",
            eventType: CreatorMembershipEventType.join,
            occurredAt: new Date("2025-01-10T12:00:00Z")
          },
          {
            patreonMemberId: "m_b",
            eventType: CreatorMembershipEventType.join,
            occurredAt: new Date("2025-01-20T12:00:00Z")
          },
          {
            patreonMemberId: "m_b",
            eventType: CreatorMembershipEventType.cancel,
            occurredAt: new Date("2025-03-10T12:00:00Z")
          }
        ])
      }
    };

    const report = await getCreatorMembershipCohortRetention(
      prisma as never,
      "relay_x",
      12,
      12,
      { asOf }
    );
    expect(report).not.toBeNull();
    expect(report!.cohorts).toHaveLength(1);
    const block = report!.cohorts[0]!;
    expect(block.cohort_month).toBe("2025-01");
    expect(block.cohort_size).toBe(2);
    const k0 = block.retention.find((r) => r.months_since_join === 0);
    const k2 = block.retention.find((r) => r.months_since_join === 2);
    expect(k0?.retained_count).toBe(2);
    expect(k0?.retained_pct).toBe(1);
    expect(k2?.retained_count).toBe(1);
    expect(k2?.retained_pct).toBe(0.5);
  });

  it("returns null when tenant missing", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) }
    };
    await expect(
      getCreatorMembershipCohortRetention(prisma as never, "x", 12, 12, {
        asOf: new Date("2025-06-01T00:00:00Z")
      })
    ).resolves.toBeNull();
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

describe("GET /api/v1/creator/analytics/membership-cohorts", () => {
  it("returns 503 when Prisma is not wired", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-cohort-"));
    const { app } = createApp(bareConfig(tempDir));
    const res = await request(app).get("/api/v1/creator/analytics/membership-cohorts");
    expect(res.status).toBe(503);
  });
});
