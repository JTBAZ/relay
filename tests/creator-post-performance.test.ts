import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { PostSource, PostUpstreamStatus } from "@prisma/client";
import { getCreatorPostPerformance } from "../src/analytics/creator-post-performance.js";
import { createApp } from "../src/server.js";

describe("getCreatorPostPerformance", () => {
  it("returns NO_TENANT when tenant is missing", async () => {
    const prisma = { tenant: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(getCreatorPostPerformance(prisma as never, "c1")).resolves.toEqual({
      ok: false,
      code: "NO_TENANT"
    });
  });

  it("returns IMPORT_NOT_FOUND when import_id does not belong to creator", async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "t1" }) },
      patreonInsightsImport: { findFirst: vi.fn().mockResolvedValue(null) }
    };
    await expect(
      getCreatorPostPerformance(prisma as never, "c1", { importId: "bad_import" })
    ).resolves.toEqual({ ok: false, code: "IMPORT_NOT_FOUND" });
  });

  it("merges metrics with Relay posts and tags gaps (two fixture posts)", async () => {
    const postA = {
      id: "patreon_post_100",
      source: PostSource.PATREON,
      upstreamStatus: PostUpstreamStatus.active,
      isPublic: true,
      providerPostId: "patreon_post_100",
      versions: [{ title: "Alpha", publishedAt: new Date("2026-01-01T00:00:00.000Z") }]
    };
    const postB = {
      id: "patreon_post_200",
      source: PostSource.PATREON,
      upstreamStatus: PostUpstreamStatus.active,
      isPublic: false,
      providerPostId: "patreon_post_200",
      versions: [{ title: "Beta", publishedAt: new Date("2026-01-02T00:00:00.000Z") }]
    };

    const importRow = { id: "imp_1", uploadedAt: new Date("2026-01-10T00:00:00.000Z"), label: "jan" };

    const metrics = [
      {
        id: "m1",
        patreonPostId: "patreon_post_100",
        postId: "patreon_post_100",
        impressions: 10,
        seen: 5,
        likes: 1,
        comments: 0,
        asOf: new Date("2026-01-09T00:00:00.000Z")
      },
      {
        id: "m2",
        patreonPostId: "patreon_post_99999",
        postId: null,
        impressions: 1,
        seen: 1,
        likes: 0,
        comments: 0,
        asOf: null
      }
    ];

    const findManyPosts = vi
      .fn()
      .mockImplementation((args: { where?: { id?: { in?: string[] }; OR?: unknown[] } }) => {
        if ( args.where?.id?.in?.includes("patreon_post_100")) {
          return Promise.resolve([postA]);
        }
        if (args.where?.OR) {
          return Promise.resolve([]);
        }
        return Promise.resolve([postB]);
      });

    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: "t1" }) },
      patreonInsightsImport: {
        findFirst: vi.fn().mockImplementation((args: { where?: { id?: string } }) => {
          if (args.where?.id) {
            return Promise.resolve(importRow);
          }
          return Promise.resolve(importRow);
        })
      },
      patreonInsightsPostMetric: {
        findMany: vi.fn().mockResolvedValue(metrics)
      },
      post: {
        findMany: findManyPosts
      }
    };

    const out = await getCreatorPostPerformance(prisma as never, "creator_x", {
      importId: "imp_1",
      includeRelayOnly: true,
      relayOnlyLimit: 10
    });
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }

    const linked = out.report.rows.find((r) => r.patreon_post_id === "patreon_post_100")!;
    expect(linked.gap).toBe("none");
    expect(linked.relay?.title).toBe("Alpha");
    expect(linked.insights?.seen).toBe(5);

    const orphan = out.report.rows.find((r) => r.patreon_post_id === "patreon_post_99999")!;
    expect(orphan.gap).toBe("metrics_without_relay");
    expect(orphan.relay).toBeNull();

    const relayOnly = out.report.rows.filter((r) => r.gap === "relay_without_metrics");
    expect(relayOnly.some((r) => r.post_id === "patreon_post_200")).toBe(true);
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

describe("GET /api/v1/creator/analytics/post-performance", () => {
  it("returns 503 when Prisma is not wired on AppConfig", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-post-perf-"));
    const { app } = createApp(bareConfig(tempDir));

    const res = await request(app).get("/api/v1/creator/analytics/post-performance");
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
  });
});
