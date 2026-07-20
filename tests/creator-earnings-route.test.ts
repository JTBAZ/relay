/**
 * @fileoverview Creator earnings route gating (MB-10).
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

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

describe("creator-earnings-route", () => {
  afterEach(() => {
    delete process.env.RELAY_FAN_PREMIUM_ENABLED;
  });

  it("returns 404 when fan premium is disabled", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-earnings-off-"));
    const { app } = fileIdentityApp(tempDir);
    const res = await request(app).get("/api/v1/creator/earnings");
    expect(res.status).toBe(404);
  });

  it("returns 503 when fan premium on but prisma missing", async () => {
    process.env.RELAY_FAN_PREMIUM_ENABLED = "1";
    const tempDir = await mkdtemp(join(tmpdir(), "relay-earnings-on-"));
    const { app } = fileIdentityApp(tempDir);
    const res = await request(app).get("/api/v1/creator/earnings");
    expect(res.status).toBe(503);
  });
});
