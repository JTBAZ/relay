/**
 * P9-test-002 — Pilot contract bundle: one `describe` per domain
 * (onboarding, sync, feed, analytics health, usage preview read-model).
 * Shallow shape checks only; deeper behavior stays in domain-specific test files.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getCreatorOnboardingForStudio } from "../src/creator/onboarding-service.js";
import { creatorSyncHealthStateToWebDto } from "../src/patreon/sync-health-web-dto.js";
import { assemblePatronFeed } from "../src/patron/assemble-patron-feed.js";
import { createApp } from "../src/server.js";
import { getCreatorUsagePreview } from "../src/usage/usage-preview-service.js";

describe("P9 pilot API contract — onboarding (creator workspace)", () => {
  it("getCreatorOnboardingForStudio exposes a stable read-model shape", async () => {
    const updatedAt = new Date("2026-05-08T12:00:00.000Z");
    const prisma = {
      creatorOnboardingState: {
        findUnique: vi.fn().mockResolvedValue({
          step: "import_started",
          metadata: { k: 1 },
          updatedAt
        }),
        create: vi.fn()
      },
      creatorSyncState: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    } as unknown as PrismaClient;

    const out = await getCreatorOnboardingForStudio(prisma, "cr_contract");

    expect(out).toEqual(
      expect.objectContaining({
        creator_id: "cr_contract",
        step: "import_started",
        metadata: { k: 1 },
        updated_at: updatedAt.toISOString()
      })
    );
    expect(out).toHaveProperty("import_progress");
  });
});

describe("P9 pilot API contract — sync health (web DTO)", () => {
  it("creatorSyncHealthStateToWebDto always returns status + message_key", () => {
    const dto = creatorSyncHealthStateToWebDto(null);
    expect(dto).toEqual(
      expect.objectContaining({
        status: expect.stringMatching(/^(unknown|healthy|degraded|failed)$/),
        message_key: expect.stringMatching(/^sync_health\./),
        last_success_at: null,
        last_error: null,
        campaign_id: null
      })
    );
  });
});

describe("P9 pilot API contract — patron feed bundle", () => {
  it("assemblePatronFeed empty bundle matches PatronFeedBundleJson top-level keys", async () => {
    const prisma = {
      patronFollow: { findMany: vi.fn().mockResolvedValue([]) },
      patronEntitlementSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      tier: { findMany: vi.fn().mockResolvedValue([]) },
      creatorProfile: { findMany: vi.fn().mockResolvedValue([]) },
      post: { findMany: vi.fn() },
      patronProfile: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    };
    const bundle = await assemblePatronFeed({
      prisma: prisma as never,
      patronMembershipId: "mem_p9",
      viewerEmail: "patron@example.com"
    });

    expect(bundle).toEqual(
      expect.objectContaining({
        feedPosts: [],
        followedCreators: [],
        discoverItems: [],
        notifications: [],
        entitlement_degraded: false,
        entitlement_stale_since: null
      })
    );
    expect(bundle.currentViewer).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        handle: expect.any(String),
        displayName: expect.any(String),
        followingCount: expect.any(Number),
        notificationCount: expect.any(Number)
      })
    );
  });
});

describe("P9 pilot API contract — analytics health", () => {
  function baseConfig(tempDir: string) {
    return {
      patreon_client_id: "c",
      patreon_client_secret: "s",
      relay_token_encryption_key: randomBytes(32).toString("base64"),
      credential_store_path: join(tempDir, "patreon.json"),
      ingest_canonical_path: join(tempDir, "canonical.json"),
      ingest_dlq_path: join(tempDir, "dlq.json"),
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

  it("GET /api/v1/health/analytics returns insight job envelope", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-p9-analytics-contract-"));
    const { app } = createApp(baseConfig(tempDir));
    const res = await request(app).get("/api/v1/health/analytics");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        status: expect.stringMatching(/^(ok|degraded)$/),
        metrics: expect.any(Object),
        documentation: expect.any(Array),
        alerts: expect.any(Array)
      })
    );
    expect(typeof res.body.data.metrics.generate_attempts).toBe("number");
  });
});

describe("P9 pilot API contract — usage preview (M1-lite read model)", () => {
  it("getCreatorUsagePreview returns stable window, bar order, and disclaimer", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "t_p9_contract" }) },
      usageEvent: {
        groupBy: vi.fn().mockResolvedValue([
          { metric: "export.media.content.bytes", _sum: { quantity: 100n } }
        ])
      }
    } as never;

    const out = await getCreatorUsagePreview(prisma, "cr_p9_contract", 30);
    expect(out).not.toBeNull();
    expect(out!.window).toEqual(
      expect.objectContaining({
        days: 30,
        start: expect.any(String),
        end: expect.any(String)
      })
    );
    expect(out!.disclaimer.length).toBeGreaterThan(20);
    expect(out!.bars.map((b) => b.metric)).toEqual([
      "export.media.content.bytes",
      "export.media.thumb.bytes",
      "export.media.preview.bytes",
      "export.library_zip.completed",
      "api.rate_limited"
    ]);
    for (const b of out!.bars) {
      expect(b).toEqual(
        expect.objectContaining({
          label: expect.any(String),
          kind: expect.stringMatching(/^(bytes|count)$/),
          quantity: expect.stringMatching(/^\d+$/)
        })
      );
    }
    expect(out!.bars[0].quantity).toBe("100");
    expect(out!.bars[1].quantity).toBe("0");
  });
});
