/**
 * EXT-0D — consent exchange IP rate limit (61st POST → 429).
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

function fileBackedConfig(tempDir: string) {
  return {
    patreon_client_id: "c",
    patreon_client_secret: "s",
    relay_token_encryption_key: randomBytes(32).toString("base64"),
    credential_store_path: join(tempDir, "patreon.json"),
    cookie_store_path: join(tempDir, "cookies.json"),
    ingest_canonical_path: join(tempDir, "canonical.json"),
    ingest_dlq_path: join(tempDir, "dlq.json"),
    patreon_sync_watermark_path: join(tempDir, "watermarks.json"),
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

describe("Extension consent exchange rate limit (EXT-0D)", () => {
  const prevConsent = process.env.RELAY_EXTENSION_CONSENT_SECRET;

  beforeEach(() => {
    process.env.RELAY_EXTENSION_CONSENT_SECRET = "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env.RELAY_EXTENSION_CONSENT_SECRET = prevConsent;
  });

  it("returns 429 on the 61st POST within the window", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-ext-rl-"));
    const { app } = createApp(fileBackedConfig(tempDir));
    const payload = { consent_code: "0.bad", installation_id: "i" };
    for (let i = 0; i < 60; i++) {
      const r = await request(app).post("/api/v1/auth/extension/consent/exchange").send(payload);
      expect(r.status).not.toBe(429);
    }
    const blocked = await request(app).post("/api/v1/auth/extension/consent/exchange").send(payload);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error?.code).toBe("RATE_LIMITED");
    expect(blocked.headers["ratelimit-remaining"]).toBeDefined();
  });
});
