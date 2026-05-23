import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server.js";

function baseConfig(tempDir: string) {
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
    deploy_store_path: join(tempDir, "deploys.json")
  };
}

describe("POST /api/v1/patreon/sync-post-access", () => {
  it("returns 400 when creator_id is missing", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-access-sync-"));
    const { app } = createApp(baseConfig(tempDir));
    const res = await request(app).post("/api/v1/patreon/sync-post-access").send({});
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns DB_UNAVAILABLE when database is not wired", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-access-sync-404-"));
    const { app } = createApp(baseConfig(tempDir));
    const res = await request(app)
      .post("/api/v1/patreon/sync-post-access")
      .send({ creator_id: "no_tokens_here", campaign_id: "999" });
    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe("DB_UNAVAILABLE");
  });
});
