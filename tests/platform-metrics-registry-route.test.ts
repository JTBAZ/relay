import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

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

describe("GET /api/v1/platform-metrics/registry (PMD-020/030)", () => {
  it("returns registry envelope with metrics and coverage", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pmr-"));
    const { app } = createApp(baseConfig(tempDir));
    const res = await request(app).get("/api/v1/platform-metrics/registry");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.metrics)).toBe(true);
    expect(res.body.data.metrics.length).toBeGreaterThan(60);
    expect(res.body.data.coverage.total).toBe(res.body.data.metrics.length);
    expect(res.body.data.prismaConfigured).toBe(false);
    expect(Array.isArray(res.body.data.alerts)).toBe(true);
    expect(res.body.data.operatingReview.totals).toBeDefined();
    expect(Array.isArray(res.body.data.operatingReview.checklist)).toBe(true);
  });
});
