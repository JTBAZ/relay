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

async function seedAndClone(app: ReturnType<typeof createApp>["app"]) {
  await request(app)
    .post("/api/v1/ingest/batches?process_sync=true")
    .send({
      creator_id: "cr1",
      tiers: [
        { tier_id: "t_gold", title: "Gold", upstream_updated_at: "2026-03-30T12:00:00Z" },
        { tier_id: "t_silver", title: "Silver", upstream_updated_at: "2026-03-30T12:00:00Z" }
      ],
      posts: [
        {
          post_id: "p_public",
          title: "Public Post",
          published_at: "2026-03-15T12:00:00Z",
          tag_ids: [],
          tier_ids: ["relay_tier_public"],
          upstream_revision: "r1",
          media: [{ media_id: "m1", mime_type: "image/png", upstream_revision: "mr1" }]
        },
        {
          post_id: "p_gold",
          title: "Gold Only",
          published_at: "2026-03-16T12:00:00Z",
          tag_ids: [],
          tier_ids: ["t_gold"],
          upstream_revision: "r2",
          media: []
        },
        {
          post_id: "p_member",
          title: "Members Only",
          published_at: "2026-03-17T12:00:00Z",
          tag_ids: [],
          tier_ids: ["t_gold", "t_silver"],
          upstream_revision: "r3",
          media: []
        }
      ]
    });
  await request(app)
    .post("/api/v1/clone/generate")
    .send({ creator_id: "cr1", base_url: "https://test.example" });
}

describe("Workstream G access and identity", () => {
  it("independent account register, login, access gated content, logout", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-g-"));
    const { app } = testApp(tempDir);
    await seedAndClone(app);

    const reg = await request(app).post("/api/v1/identity/register").send({
      creator_id: "cr1",
      email: "alice@example.com",
      password: "s3cretP4ss",
      tier_ids: ["t_gold"]
    });
    expect(reg.status).toBe(201);
    expect(reg.body.data.auth_provider).toBe("independent");

    const dup = await request(app).post("/api/v1/identity/register").send({
      creator_id: "cr1",
      email: "alice@example.com",
      password: "other",
      tier_ids: []
    });
    expect(dup.status).toBe(409);

    const login = await request(app).post("/api/v1/identity/login").send({
      creator_id: "cr1",
      email: "alice@example.com",
      password: "s3cretP4ss"
    });
    expect(login.status).toBe(200);
    const token = login.body.data.token as string;
    expect(token).toMatch(/^sess_/);

    const badLogin = await request(app).post("/api/v1/identity/login").send({
      creator_id: "cr1",
      email: "alice@example.com",
      password: "wrong"
    });
    expect(badLogin.status).toBe(401);

    const goldPost = await request(app)
      .get("/api/v1/clone/posts/p_gold?creator_id=cr1")
      .set("Authorization", `Bearer ${token}`);
    expect(goldPost.status).toBe(200);

    const publicPost = await request(app)
      .get("/api/v1/clone/posts/p_public?creator_id=cr1");
    expect(publicPost.status).toBe(200);

    const logout = await request(app)
      .post("/api/v1/identity/logout")
      .set("Authorization", `Bearer ${token}`);
    expect(logout.status).toBe(200);

    const afterLogout = await request(app)
      .get("/api/v1/clone/posts/p_gold?creator_id=cr1")
      .set("Authorization", `Bearer ${token}`);
    expect(afterLogout.status).toBe(403);
  });

  it("patreon fallback auth: register, login, access", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-g2-"));
    const { app } = testApp(tempDir);
    await seedAndClone(app);

    const reg = await request(app).post("/api/v1/identity/register-patreon").send({
      creator_id: "cr1",
      patreon_user_id: "pat_bob",
      email: "bob@example.com",
      tier_ids: ["t_silver"]
    });
    expect(reg.status).toBe(201);
    expect(reg.body.data.auth_provider).toBe("patreon");

    const login = await request(app).post("/api/v1/identity/login-patreon").send({
      creator_id: "cr1",
      patreon_user_id: "pat_bob"
    });
    expect(login.status).toBe(200);
    const token = login.body.data.token as string;

    const memberPost = await request(app)
      .get("/api/v1/clone/posts/p_member?creator_id=cr1")
      .set("Authorization", `Bearer ${token}`);
    expect(memberPost.status).toBe(200);

    const goldPost = await request(app)
      .get("/api/v1/clone/posts/p_gold?creator_id=cr1")
      .set("Authorization", `Bearer ${token}`);
    expect(goldPost.status).toBe(403);
  });

  it("unauthenticated access to gated content is denied", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-g3-"));
    const { app } = testApp(tempDir);
    await seedAndClone(app);

    const noAuth = await request(app).get("/api/v1/clone/posts/p_gold?creator_id=cr1");
    expect(noAuth.status).toBe(403);

    const noAuth2 = await request(app).get("/api/v1/clone/posts/p_member?creator_id=cr1");
    expect(noAuth2.status).toBe(403);

    const pub = await request(app).get("/api/v1/clone/posts/p_public?creator_id=cr1");
    expect(pub.status).toBe(200);
  });

  it("cross-tenant access is denied", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-g4-"));
    const { app } = testApp(tempDir);
    await seedAndClone(app);

    await request(app).post("/api/v1/identity/register").send({
      creator_id: "cr_other",
      email: "eve@example.com",
      password: "attackpass",
      tier_ids: ["t_gold"]
    });
    const login = await request(app).post("/api/v1/identity/login").send({
      creator_id: "cr_other",
      email: "eve@example.com",
      password: "attackpass"
    });
    const eveToken = login.body.data.token as string;

    const xTenant = await request(app)
      .get("/api/v1/clone/posts/p_gold?creator_id=cr1")
      .set("Authorization", `Bearer ${eveToken}`);
    expect(xTenant.status).toBe(403);
    expect(xTenant.body.error.message).toMatch(/cross-tenant/i);
  });

  it("accessible-posts endpoint filters correctly", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-g5-"));
    const { app } = testApp(tempDir);
    await seedAndClone(app);

    const anon = await request(app).get("/api/v1/clone/accessible-posts?creator_id=cr1");
    expect(anon.status).toBe(200);
    expect(anon.body.data.accessible_count).toBe(1);
    expect(anon.body.data.total).toBe(3);

    await request(app).post("/api/v1/identity/register").send({
      creator_id: "cr1",
      email: "member@example.com",
      password: "pass123",
      tier_ids: ["t_gold"]
    });
    const login = await request(app).post("/api/v1/identity/login").send({
      creator_id: "cr1",
      email: "member@example.com",
      password: "pass123"
    });
    const tok = login.body.data.token as string;

    const authed = await request(app)
      .get("/api/v1/clone/accessible-posts?creator_id=cr1")
      .set("Authorization", `Bearer ${tok}`);
    expect(authed.status).toBe(200);
    expect(authed.body.data.accessible_count).toBe(3);
  });
});
