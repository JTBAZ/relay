import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    deploy_store_path: join(tempDir, "deploys.json"),
    patreon_webhook_metadata_path: join(tempDir, "patreon_webhook_metadata.json")
  };
}

describe("POST /api/v1/patreon/webhooks/register", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 400 when creator_id is missing", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-wh-reg-"));
    const key = randomBytes(32).toString("base64");
    const { app } = createApp({ ...baseConfig(tempDir), relay_token_encryption_key: key });
    const res = await request(app)
      .post("/api/v1/patreon/webhooks/register")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 CONFIG_ERROR when RELAY_PUBLIC_WEBHOOK_BASE_URL is unset", async () => {
    vi.stubEnv("RELAY_PUBLIC_WEBHOOK_BASE_URL", "");
    vi.stubEnv("PUBLIC_WEBHOOK_BASE_URL", "");
    const tempDir = await mkdtemp(join(tmpdir(), "relay-wh-reg-"));
    const key = randomBytes(32).toString("base64");
    const { app } = createApp({
      ...baseConfig(tempDir),
      relay_token_encryption_key: key,
      public_webhook_base_url: undefined
    });
    const res = await request(app)
      .post("/api/v1/patreon/webhooks/register")
      .send({ creator_id: "creator_a" });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe("CONFIG_ERROR");
    expect(String(res.body?.error?.message ?? "")).toMatch(/RELAY_PUBLIC_WEBHOOK_BASE_URL/i);
  });
});
