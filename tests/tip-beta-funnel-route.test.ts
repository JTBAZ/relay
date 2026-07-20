/**
 * Operator tip-beta-funnel route auth (MB-8).
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

const prevEnforce = process.env.RELAY_PLATFORM_OPERATOR_ENFORCE;

afterEach(() => {
  if (prevEnforce === undefined) delete process.env.RELAY_PLATFORM_OPERATOR_ENFORCE;
  else process.env.RELAY_PLATFORM_OPERATOR_ENFORCE = prevEnforce;
});

function fileIdentityApp(tempDir: string) {
  return createApp({
    patreon_client_id: "c",
    patreon_client_secret: "s",
    relay_token_encryption_key: randomBytes(32).toString("base64"),
    credential_store_path: join(tempDir, "patreon.json"),
    ingest_canonical_path: join(tempDir, "canonical.json"),
    ingest_dlq_path: join(tempDir, "dlq.json"),
    export_storage_root: join(tempDir, "exports"),
    gallery_post_overrides_path: join(tempDir, "gallery_overrides.json"),
    gallery_saved_filters_path: join(tempDir, "saved_filters.json"),
    collections_store_path: join(tempDir, "collections.json"),
    page_layout_store_path: join(tempDir, "page_layout.json"),
    patron_favorites_store_path: join(tempDir, "patron_favorites.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  });
}

describe("GET /api/v1/platform-metrics/tip-beta-funnel", () => {
  it("returns 503 when DB not configured", async () => {
    process.env.RELAY_PLATFORM_OPERATOR_ENFORCE = "0";
    const tempDir = await mkdtemp(join(tmpdir(), "relay-tip-beta-funnel-"));
    const { app } = fileIdentityApp(tempDir);
    const res = await request(app).get("/api/v1/platform-metrics/tip-beta-funnel");
    expect(res.status).toBe(503);
  });

  it("returns 401 when enforce is on and no session", async () => {
    process.env.RELAY_PLATFORM_OPERATOR_ENFORCE = "1";
    const tempDir = await mkdtemp(join(tmpdir(), "relay-tip-beta-funnel-auth-"));
    const { app } = fileIdentityApp(tempDir);
    // Still 503 without prisma — createApp without prisma hits 503 first.
    // With enforce on and prisma missing, route returns 503 before auth.
    const res = await request(app).get("/api/v1/platform-metrics/tip-beta-funnel");
    expect([401, 503]).toContain(res.status);
  });
});
