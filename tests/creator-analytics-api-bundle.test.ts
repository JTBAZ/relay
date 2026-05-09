/**
 * P5a-ins-012 — Shared CI coverage for creator analytics HTTP routes + Patreon Insights fixture.
 */
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import type { Request } from "express";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  parseInsightsCsv,
  readPatreonInsightsMultipart
} from "../src/analytics/patreon-insights-csv.js";
import { createApp } from "../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATREON_INSIGHTS_FIXTURE = join(__dirname, "fixtures", "patreon-insights-sample.csv");

function bundleBaseConfig(tempDir: string, prisma?: PrismaClient) {
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
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
    ...(prisma !== undefined ? { prisma } : {})
  };
}

describe("P5a-ins-012 — creator analytics API bundle (CI)", () => {
  describe("GET /api/v1/creator/analytics/membership-summary", () => {
    it("returns 503 when database is not configured", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "p5a-bundle-msum-"));
      const { app } = createApp(bundleBaseConfig(tempDir));
      const res = await request(app).get("/api/v1/creator/analytics/membership-summary");
      expect(res.status).toBe(503);
      expect(res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 401 when Prisma is set but the caller is not authenticated", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "p5a-bundle-msum-auth-"));
      const { app } = createApp(bundleBaseConfig(tempDir, {} as PrismaClient));
      const res = await request(app).get("/api/v1/creator/analytics/membership-summary");
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe("AUTH_ERROR");
    });
  });

  describe("GET /api/v1/creator/analytics/membership-cohorts", () => {
    it("returns 503 when database is not configured", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "p5a-bundle-coh-"));
      const { app } = createApp(bundleBaseConfig(tempDir));
      const res = await request(app).get("/api/v1/creator/analytics/membership-cohorts");
      expect(res.status).toBe(503);
      expect(res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 401 when Prisma is set but the caller is not authenticated", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "p5a-bundle-coh-auth-"));
      const { app } = createApp(bundleBaseConfig(tempDir, {} as PrismaClient));
      const res = await request(app).get("/api/v1/creator/analytics/membership-cohorts");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/v1/creator/analytics/tier-stickiness", () => {
    it("returns 503 when database is not configured", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "p5a-bundle-tier-"));
      const { app } = createApp(bundleBaseConfig(tempDir));
      const res = await request(app).get("/api/v1/creator/analytics/tier-stickiness");
      expect(res.status).toBe(503);
      expect(res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 401 when Prisma is set but the caller is not authenticated", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "p5a-bundle-tier-auth-"));
      const { app } = createApp(bundleBaseConfig(tempDir, {} as PrismaClient));
      const res = await request(app).get("/api/v1/creator/analytics/tier-stickiness");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/v1/creator/analytics/post-performance", () => {
    it("returns 503 when database is not configured", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "p5a-bundle-perf-"));
      const { app } = createApp(bundleBaseConfig(tempDir));
      const res = await request(app).get("/api/v1/creator/analytics/post-performance");
      expect(res.status).toBe(503);
      expect(res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 401 when Prisma is set but the caller is not authenticated", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "p5a-bundle-perf-auth-"));
      const { app } = createApp(bundleBaseConfig(tempDir, {} as PrismaClient));
      const res = await request(app).get("/api/v1/creator/analytics/post-performance");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/creator/analytics/patreon-insights-csv", () => {
    it("parses the committed Patreon Insights sample fixture", () => {
      const csv = readFileSync(PATREON_INSIGHTS_FIXTURE, "utf8");
      const r = parseInsightsCsv(csv);
      expect("rows" in r).toBe(true);
      if (!("rows" in r)) {
        return;
      }
      expect(r.rows.length).toBe(2);
      const ids = new Set(r.rows.map((x) => x.patreonPostId));
      expect(ids.has("patreon_post_12345")).toBe(true);
      expect(ids.has("patreon_post_67890")).toBe(true);
    });

    it("readPatreonInsightsMultipart rejects non-multipart Content-Type (CSV upload error path)", async () => {
      const req = { headers: { "content-type": "application/json" } } as Request;
      await expect(readPatreonInsightsMultipart(req)).resolves.toMatchObject({
        ok: false,
        code: "NOT_MULTIPART"
      });
    });

    it("returns 503 when database is not configured", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "p5a-bundle-csv-503-"));
      const { app } = createApp(bundleBaseConfig(tempDir));
      const res = await request(app).post("/api/v1/creator/analytics/patreon-insights-csv");
      expect(res.status).toBe(503);
      expect(res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 401 when not authenticated (even with a multipart file attached)", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "p5a-bundle-csv-401-"));
      const { app } = createApp(bundleBaseConfig(tempDir, {} as PrismaClient));
      const buf = readFileSync(PATREON_INSIGHTS_FIXTURE);
      const res = await request(app)
        .post("/api/v1/creator/analytics/patreon-insights-csv")
        .attach("file", buf, "patreon-insights-sample.csv");
      expect(res.status).toBe(401);
    });
  });
});
