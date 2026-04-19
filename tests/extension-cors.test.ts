/**
 * EXT-0E — CORS allowlist for `/api/v1/auth/extension/*` only.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isBrowserExtensionOrigin,
  parseRelayExtensionOrigins,
  RELAY_EXTENSION_AUTH_API_PREFIX
} from "../src/lib/relay-extension-origins.js";
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
    fetch_impl: async () => new Response("{}", { status: 200 })
  };
}

describe("relay-extension-origins helpers", () => {
  const prev = process.env.RELAY_EXTENSION_ORIGINS;

  afterEach(() => {
    process.env.RELAY_EXTENSION_ORIGINS = prev;
  });

  it("parseRelayExtensionOrigins trims and drops empties", () => {
    process.env.RELAY_EXTENSION_ORIGINS =
      " chrome-extension://a , moz-extension://b , , chrome-extension://a ";
    expect(parseRelayExtensionOrigins()).toEqual(
      new Set(["chrome-extension://a", "moz-extension://b"])
    );
  });

  it("isBrowserExtensionOrigin accepts chrome- and moz-extension only", () => {
    expect(isBrowserExtensionOrigin("chrome-extension://abc")).toBe(true);
    expect(isBrowserExtensionOrigin("moz-extension://xyz")).toBe(true);
    expect(isBrowserExtensionOrigin("https://relayapp.me")).toBe(false);
    expect(isBrowserExtensionOrigin("not-a-url")).toBe(false);
  });

  it("RELAY_EXTENSION_AUTH_API_PREFIX matches extension auth routes", () => {
    expect("/api/v1/auth/extension/consent/exchange").toMatch(
      new RegExp(`^${RELAY_EXTENSION_AUTH_API_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
  });
});

describe("Extension API CORS (EXT-0E)", () => {
  const prevOrigins = process.env.RELAY_EXTENSION_ORIGINS;

  afterEach(() => {
    process.env.RELAY_EXTENSION_ORIGINS = prevOrigins;
  });

  it("OPTIONS consent/exchange: listed extension origin gets 204, ACAO, no credentials header", async () => {
    process.env.RELAY_EXTENSION_ORIGINS = "chrome-extension://listedid";
    const tempDir = await mkdtemp(join(tmpdir(), "relay-ext-cors-ok-"));
    const { app } = createApp(fileBackedConfig(tempDir));
    const res = await request(app)
      .options("/api/v1/auth/extension/consent/exchange")
      .set("Origin", "chrome-extension://listedid")
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("chrome-extension://listedid");
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("OPTIONS consent/exchange: unlisted extension origin → 403", async () => {
    process.env.RELAY_EXTENSION_ORIGINS = "chrome-extension://listedid";
    const tempDir = await mkdtemp(join(tmpdir(), "relay-ext-cors-deny-"));
    const { app } = createApp(fileBackedConfig(tempDir));
    const res = await request(app)
      .options("/api/v1/auth/extension/consent/exchange")
      .set("Origin", "chrome-extension://otherid")
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("OPTIONS consent/exchange: https origin never allowed on extension routes", async () => {
    process.env.RELAY_EXTENSION_ORIGINS = "https://relayapp.me";
    const tempDir = await mkdtemp(join(tmpdir(), "relay-ext-cors-https-"));
    const { app } = createApp(fileBackedConfig(tempDir));
    const res = await request(app)
      .options("/api/v1/auth/extension/consent/exchange")
      .set("Origin", "https://relayapp.me")
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(403);
  });

  it("OPTIONS /api/v1/patreon/cookie: reflects arbitrary Origin with credentials (unchanged)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-cookie-cors-"));
    const { app } = createApp(fileBackedConfig(tempDir));
    const res = await request(app)
      .options("/api/v1/patreon/cookie")
      .set("Origin", "https://any.example")
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://any.example");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });
});
