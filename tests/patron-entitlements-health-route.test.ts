import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

function testApp(tempDir: string) {
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
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  });
}

describe("GET /api/v1/patron/entitlements/health (MIG-42)", () => {
  it("401 without Bearer; file identity returns storage file payload", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-ent-h-"));
    const { app } = testApp(tempDir);

    const noAuth = await request(app).get("/api/v1/patron/entitlements/health?creator_id=c1");
    expect(noAuth.status).toBe(401);

    await request(app).post("/api/v1/identity/register").send({
      creator_id: "c1",
      email: "ent@example.com",
      password: "hunter2hunter2",
      tier_ids: []
    });
    const login = await request(app).post("/api/v1/identity/login").send({
      creator_id: "c1",
      email: "ent@example.com",
      password: "hunter2hunter2"
    });
    expect(login.status).toBe(200);
    const token = login.body.data.token as string;

    const res = await request(app)
      .get("/api/v1/patron/entitlements/health")
      .query({ creator_id: "c1" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.storage).toBe("file");
    expect(res.body.data.degraded).toBe(false);
    expect(res.body.data.patron_entitlement).toBeNull();
  });

  it("403 when session creator does not match query", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-ent-h2-"));
    const { app } = testApp(tempDir);
    await request(app).post("/api/v1/identity/register").send({
      creator_id: "c1",
      email: "x@example.com",
      password: "hunter2hunter2",
      tier_ids: []
    });
    const login = await request(app).post("/api/v1/identity/login").send({
      creator_id: "c1",
      email: "x@example.com",
      password: "hunter2hunter2"
    });
    const token = login.body.data.token as string;
    const res = await request(app)
      .get("/api/v1/patron/entitlements/health")
      .query({ creator_id: "other_creator" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
