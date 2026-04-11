import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { TokenEncryption } from "../src/lib/crypto.js";
import { PatreonWebhookMetadataStore } from "../src/patreon/patreon-webhook-metadata-store.js";
import { patreonWebhookMd5Hex } from "../src/patreon/patreon-webhook-signature.js";
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

describe("POST /api/v1/webhooks/patreon/platform/:opaqueToken", () => {
  it("returns 401 when MD5 signature does not match raw body", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pw-"));
    const key = randomBytes(32).toString("base64");
    const enc = new TokenEncryption(key);
    const metaPath = join(tempDir, "patreon_webhook_metadata.json");
    const store = new PatreonWebhookMetadataStore(metaPath, enc);
    await store.recordRegistration({
      creator_id: "creator_a",
      webhook_id: "wh1",
      webhook_secret: "supersecret",
      uri: "https://example.com/hook",
      triggers: ["posts:publish"],
      status: "ok"
    });
    const rec = await store.getByCreatorId("creator_a");
    const opaque = rec!.opaque_delivery_token;

    const { app } = createApp({ ...baseConfig(tempDir), relay_token_encryption_key: key });
    const rawBody = Buffer.from('{"data":{}}', "utf8");
    const res = await request(app)
      .post(`/api/v1/webhooks/patreon/platform/${opaque}`)
      .set("Content-Type", "application/json")
      .set("X-Patreon-Event", "noop:ignored")
      .set("X-Patreon-Signature", "00000000000000000000000000000000")
      .send(rawBody);
    expect(res.status).toBe(401);
  });

  it("accepts valid signature and returns 202 for ignored event types (no Patreon API calls)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pw-"));
    const key = randomBytes(32).toString("base64");
    const enc = new TokenEncryption(key);
    const metaPath = join(tempDir, "patreon_webhook_metadata.json");
    const store = new PatreonWebhookMetadataStore(metaPath, enc);
    await store.recordRegistration({
      creator_id: "creator_b",
      webhook_id: "wh2",
      webhook_secret: "anothersecret",
      uri: "https://example.com/hook",
      triggers: ["posts:publish"],
      status: "ok"
    });
    const rec = await store.getByCreatorId("creator_b");
    const opaque = rec!.opaque_delivery_token;
    const secret = "anothersecret";
    const json = '{"data":{"type":"member","id":"z"}}';
    const rawBody = Buffer.from(json, "utf8");
    const sig = patreonWebhookMd5Hex(rawBody, secret);

    const { app } = createApp({ ...baseConfig(tempDir), relay_token_encryption_key: key });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected port");
    const port = addr.port;
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/v1/webhooks/patreon/platform/${opaque}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-patreon-event": "custom:ignored_test",
            "x-patreon-signature": sig
          },
          body: rawBody
        }
      );
      expect(res.status).toBe(202);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("returns 409 when payload campaign id maps to a different creator than the opaque token", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pw-"));
    const key = randomBytes(32).toString("base64");
    const enc = new TokenEncryption(key);
    const metaPath = join(tempDir, "patreon_webhook_metadata.json");
    const store = new PatreonWebhookMetadataStore(metaPath, enc);
    await store.recordRegistration({
      creator_id: "creator_route_owner",
      webhook_id: "wh3",
      webhook_secret: "secret409",
      uri: "https://example.com/hook",
      triggers: ["posts:publish"],
      status: "ok"
    });
    const rec = await store.getByCreatorId("creator_route_owner");
    const opaque = rec!.opaque_delivery_token;
    const secret = "secret409";
    const json = JSON.stringify({
      data: {
        type: "member",
        id: "m1",
        relationships: {
          campaign: { data: { type: "campaign", id: "12345" } }
        }
      }
    });
    const rawBody = Buffer.from(json, "utf8");
    const sig = patreonWebhookMd5Hex(rawBody, secret);

    await writeFile(
      join(tempDir, "patreon_campaign_creator_index.json"),
      JSON.stringify({ campaign_to_creator: { "12345": "other_creator" } }),
      "utf8"
    );

    const { app } = createApp({ ...baseConfig(tempDir), relay_token_encryption_key: key });
    // Use fetch + raw Buffer so the signed bytes match what verifyPatreonWebhookSignature sees
    // (supertest can normalize JSON and break HMAC).
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected port");
    const port = addr.port;
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/v1/webhooks/patreon/platform/${opaque}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-patreon-event": "members:update",
            "x-patreon-signature": sig
          },
          body: rawBody
        }
      );
      expect(res.status).toBe(409);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
