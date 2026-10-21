import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { PatreonWebhookMetadataStore } from "../src/patreon/patreon-webhook-metadata-store.js";
import { patreonWebhookMd5Hex } from "../src/patreon/patreon-webhook-signature.js";
import { TokenEncryption } from "../src/lib/crypto.js";
import { PatreonChangeWorkStore } from "../src/patreon/patreon-change-work.js";

const targetUrl = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!targetUrl)("PS-08 signed HTTP acceptance boundary", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    const url = new URL(targetUrl!);
    if (url.hostname !== "127.0.0.1" || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname) || url.search) throw new Error("Use a disposable loopback database");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl! }) });
  });
  afterAll(async () => { await db?.$disconnect(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  async function setup(database = true, sharedCanonical = true, sharedIdentity = false) {
    vi.stubEnv("RELAY_JOB_BACKEND", "bullmq");
    vi.stubEnv("RELAY_DB_STORE_IDENTITY", database && sharedIdentity ? "1" : "0");
    vi.stubEnv("RELAY_DB_STORE_CANONICAL", database && sharedCanonical ? "1" : "0");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:49953");
    const root = await mkdtemp(join(tmpdir(), "relay-ps08-route-"));
    const creatorId = `ps08_http_${randomUUID()}`, key = randomBytes(32).toString("base64"), secret = "fixture-webhook-secret";
    await db.tenant.create({ data: { relayCreatorId: creatorId } });
    const metadataPath = join(root, "metadata.json");
    const meta = new PatreonWebhookMetadataStore(metadataPath, new TokenEncryption(key));
    await meta.recordRegistration({ creator_id: creatorId, webhook_id: "fixture", webhook_secret: secret, uri: "https://example.com/hook", triggers: ["posts:update"], status: "ok" });
    const token = (await meta.getByCreatorId(creatorId))!.opaque_delivery_token;
    const fetchImpl = vi.fn<typeof fetch>(async () => { throw new Error("No provider I/O during acceptance"); });
    const paths = Object.fromEntries(["credential_store_path", "cookie_store_path", "ingest_canonical_path", "ingest_dlq_path", "patreon_sync_watermark_path", "patreon_sync_health_path", "creator_campaign_display_path", "gallery_post_overrides_path", "gallery_saved_filters_path", "analytics_store_path", "clone_store_path", "identity_store_path", "payment_store_path", "migration_store_path", "deploy_store_path"].map((name) => [name, join(root, `${name}.json`)]));
    const { app } = createApp({ patreon_client_id: "fixture", patreon_client_secret: "fixture", relay_token_encryption_key: key, ...paths,
      export_storage_root: join(root, "exports"), patreon_webhook_metadata_path: metadataPath, patreon_campaign_creator_index_path: join(root, "index.json"), prisma: database ? db : undefined, fetch_impl: fetchImpl });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error();
    const resource = (id: string, campaign = "99") => ({ type: "post", id, attributes: { content: "private fixture body", email: "private@example.com" }, relationships: { campaign: { data: { type: "campaign", id: campaign } } } });
    const send = async (data: unknown, signature?: string, event = "posts:update") => {
      const body = JSON.stringify({ data });
      return fetch(`http://127.0.0.1:${address.port}/api/v1/webhooks/patreon/platform/${token}`, { method: "POST", headers: { "content-type": "application/json", "x-patreon-event": event, "x-patreon-signature": signature ?? patreonWebhookMd5Hex(Buffer.from(body), secret) }, body });
    };
    return { creatorId, root, resource, send, fetchImpl, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  }
  it("commits minimal durable identities before 202 without contacting Patreon or Redis", async () => {
    const r = await setup();
    try {
      expect((await r.send([r.resource("1"), r.resource("2")])).status).toBe(202);
      const rows = await db.patreonChangeWork.findMany({ where: { creatorId: r.creatorId } });
      expect(rows).toHaveLength(2); expect(rows.map((x) => x.resourceId).sort()).toEqual(["1", "2"]);
      expect(JSON.stringify(rows)).not.toMatch(/private fixture|private@example|fixture-webhook-secret/);
      expect(r.fetchImpl).not.toHaveBeenCalled();
    } finally { await r.close(); }
  });
  it("returns a private 503 when persistence or shared processing is unavailable", async () => {
    const r = await setup();
    try {
      vi.spyOn(PatreonChangeWorkStore.prototype, "accept").mockRejectedValueOnce(new Error("secret database failure"));
      const failed = await r.send(r.resource("1")); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("secret database");
      vi.stubEnv("RELAY_JOB_BACKEND", "memory"); expect((await r.send(r.resource("1"))).status).toBe(503);
      expect(await db.patreonChangeWork.count({ where: { creatorId: r.creatorId } })).toBe(0);
    } finally { await r.close(); }
    const fileCanonical = await setup(true, false);
    try { expect((await fileCanonical.send(fileCanonical.resource("1"))).status).toBe(503); } finally { await fileCanonical.close(); }
    const local = await setup(false);
    try { expect((await local.send(local.resource("1"))).status).toBe(503); } finally { await local.close(); }
  });
  it("checks signatures and all accumulated campaign bindings before accepting any record", async () => {
    const r = await setup();
    try {
      expect((await r.send(r.resource("1"), "0".repeat(32))).status).toBe(401);
      await writeFile(join(r.root, "index.json"), JSON.stringify({ campaign_to_creator: { "88": "other-creator" } }));
      expect((await r.send([r.resource("1"), r.resource("2", "88")])).status).toBe(409);
      expect((await r.send({ type: "post", id: "1" })).status).toBe(400);
      expect(await db.patreonChangeWork.count({ where: { creatorId: r.creatorId } })).toBe(0);
    } finally { await r.close(); }
  });
  it("requires shared database identity for signed member acceptance independently of canonical selection", async () => {
    const local = await setup(true, true, false);
    try {
      expect((await local.send({ ...local.resource("member"), type: "member" }, undefined, "members:create")).status).toBe(503);
      expect(await db.patreonChangeWork.count({ where: { creatorId: local.creatorId } })).toBe(0);
    } finally { await local.close(); }
    const shared = await setup(true, false, true);
    try {
      expect((await shared.send({ ...shared.resource("member"), type: "member" }, undefined, "members:create")).status).toBe(202);
      expect(await db.patreonChangeWork.count({ where: { creatorId: shared.creatorId, resourceType: "member" } })).toBe(1);
      expect(shared.fetchImpl).not.toHaveBeenCalled();
    } finally { await shared.close(); }
  });
});
