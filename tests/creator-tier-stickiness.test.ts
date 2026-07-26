import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { CreatorMembershipEventType } from "@prisma/client";
import { createApp } from "../src/server.js";
import {
  getCreatorTierStickiness,
  replayMemberTierLedger
} from "../src/analytics/creator-tier-stickiness.js";

describe("replayMemberTierLedger", () => {
  const t = (ms: number) => new Date(ms);

  it("tracks join tier and tenure start", () => {
    const { paid, tierIds, lastEnteredAt } = replayMemberTierLedger(
      [
        {
          eventType: CreatorMembershipEventType.join,
          occurredAt: t(1_000_000),
          tierId: "tier_a",
          payload: null
        }
      ],
      2_000_000
    );
    expect(paid).toBe(true);
    expect([...tierIds].sort()).toEqual(["tier_a"]);
    expect(lastEnteredAt.get("tier_a")).toBe(1_000_000);
  });

  it("does not reset tenure on the same tier when upgrading to the same plus another tier", () => {
    const { tierIds, lastEnteredAt } = replayMemberTierLedger(
      [
        {
          eventType: CreatorMembershipEventType.join,
          occurredAt: t(0),
          tierId: "tier_a",
          payload: null
        },
        {
          eventType: CreatorMembershipEventType.upgrade,
          occurredAt: t(10_000),
          tierId: null,
          payload: { to_tiers: ["tier_a", "tier_b"] }
        }
      ],
      100_000
    );
    expect([...tierIds].sort()).toEqual(["tier_a", "tier_b"]);
    expect(lastEnteredAt.get("tier_a")).toBe(0);
    expect(lastEnteredAt.get("tier_b")).toBe(10_000);
  });

  it("clears state on cancel", () => {
    const { paid, tierIds } = replayMemberTierLedger(
      [
        {
          eventType: CreatorMembershipEventType.join,
          occurredAt: t(0),
          tierId: "tier_a",
          payload: null
        },
        {
          eventType: CreatorMembershipEventType.cancel,
          occurredAt: t(5_000),
          tierId: null,
          payload: { prior_tiers: ["tier_a"] }
        }
      ],
      20_000
    );
    expect(paid).toBe(false);
    expect(tierIds.size).toBe(0);
  });

  it("ignores events after asOf", () => {
    const { tierIds } = replayMemberTierLedger(
      [
        {
          eventType: CreatorMembershipEventType.join,
          occurredAt: t(100),
          tierId: "tier_a",
          payload: null
        },
        {
          eventType: CreatorMembershipEventType.upgrade,
          occurredAt: t(200),
          tierId: null,
          payload: { to_tiers: ["tier_b"] }
        }
      ],
      150
    );
    expect([...tierIds]).toEqual(["tier_a"]);
  });
});

describe("getCreatorTierStickiness", () => {
  it("returns null when tenant is missing", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) }
    };
    await expect(
      getCreatorTierStickiness(prisma as never, "c_missing", 30, {
        asOf: new Date("2026-01-10T12:00:00.000Z")
      })
    ).resolves.toBeNull();
  });

  it("aggregates member counts, median tenure, and cancel-weighted churn proxy", async () => {
    const asOf = new Date("2026-01-10T12:00:00.000Z");
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "ten_1" }) },
      tier: {
        findMany: vi.fn().mockResolvedValue([
          {
            relayTierId: "patreon_tier_a",
            title: "Tier A",
            amountCents: 500
          },
          {
            relayTierId: "patreon_tier_b",
            title: "Tier B",
            amountCents: 900
          }
        ])
      },
      creatorMembershipEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            patreonMemberId: "m1",
            eventType: CreatorMembershipEventType.join,
            occurredAt: new Date("2026-01-01T00:00:00.000Z"),
            tierId: "patreon_tier_a",
            payload: null
          },
          {
            patreonMemberId: "m2",
            eventType: CreatorMembershipEventType.join,
            occurredAt: new Date("2026-01-05T00:00:00.000Z"),
            tierId: "patreon_tier_a",
            payload: null
          },
          {
            patreonMemberId: "m2",
            eventType: CreatorMembershipEventType.upgrade,
            occurredAt: new Date("2026-01-07T00:00:00.000Z"),
            tierId: null,
            payload: { to_tiers: ["patreon_tier_b"] }
          },
          {
            patreonMemberId: "m3",
            eventType: CreatorMembershipEventType.join,
            occurredAt: new Date("2025-12-01T00:00:00.000Z"),
            tierId: "patreon_tier_a",
            payload: null
          },
          {
            patreonMemberId: "m3",
            eventType: CreatorMembershipEventType.cancel,
            occurredAt: new Date("2026-01-09T00:00:00.000Z"),
            tierId: null,
            payload: { prior_tiers: ["patreon_tier_a"] }
          }
        ]),
        count: vi.fn().mockResolvedValue(5)
      }
    };

    const r = await getCreatorTierStickiness(prisma as never, "relay_x", 30, { asOf });
    expect(r).not.toBeNull();
    expect(r!.window_days).toBe(30);
    expect(r!.estimated_from_sync).toBe(true);

    const rowA = r!.tiers.find((x) => x.tier_id === "patreon_tier_a")!;
    const rowB = r!.tiers.find((x) => x.tier_id === "patreon_tier_b")!;

    expect(rowA.member_count).toBe(1);
    expect(rowB.member_count).toBe(1);
    /* m1 only on A since Jan 1 → ~9.5d median is just m1 */
    expect(rowA.median_tenure_days).toBeGreaterThan(9);
    expect(rowA.median_tenure_days).toBeLessThan(10);
    expect(rowB.median_tenure_days).toBeGreaterThan(2);
    expect(rowB.median_tenure_days).toBeLessThan(4);

    expect(rowA.cancel_events_in_window).toBe(1);
    /* churn_proxy = 1 / (1 + 1) */
    expect(rowA.churn_proxy).toBe(0.5);
    expect(rowB.cancel_events_in_window).toBe(0);
    expect(rowB.churn_proxy).toBe(0);
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

describe("GET /api/v1/creator/analytics/tier-stickiness", () => {
  it("returns 503 when Prisma is not wired on AppConfig", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-tier-stick-"));
    const { app } = createApp(bareConfig(tempDir));

    const res = await request(app).get("/api/v1/creator/analytics/tier-stickiness");
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
  });
});
