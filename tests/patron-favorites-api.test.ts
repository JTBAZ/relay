import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";

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

async function seedPost(tempDir: string) {
  const { app } = testApp(tempDir);
  await request(app)
    .post("/api/v1/ingest/batches?process_sync=true")
    .send({
      creator_id: "cfav",
      tiers: [],
      posts: [
        {
          post_id: "p_fav",
          title: "Batch",
          published_at: "2026-03-10T12:00:00Z",
          tag_ids: [],
          tier_ids: [RELAY_TIER_PUBLIC],
          upstream_revision: "v1",
          media: [
            { media_id: "m_a", mime_type: "image/png", upstream_revision: "a" },
            { media_id: "m_b", mime_type: "image/png", upstream_revision: "b" }
          ]
        }
      ]
    });
  return app;
}

describe("Patron favorites API", () => {
  it("401 without Bearer; GET list, PUT add, DELETE remove; rejects unknown target", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-fav-api-"));
    const app = await seedPost(tempDir);

    const noAuth = await request(app).get("/api/v1/patron/favorites?creator_id=cfav");
    expect(noAuth.status).toBe(401);

    await request(app).post("/api/v1/identity/register").send({
      creator_id: "cfav",
      email: "fav@example.com",
      password: "hunter2hunter2",
      tier_ids: [RELAY_TIER_PUBLIC]
    });
    const login = await request(app).post("/api/v1/identity/login").send({
      creator_id: "cfav",
      email: "fav@example.com",
      password: "hunter2hunter2"
    });
    expect(login.status).toBe(200);
    const token = login.body.data.token as string;

    const empty = await request(app)
      .get("/api/v1/patron/favorites?creator_id=cfav")
      .set("Authorization", `Bearer ${token}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.items).toEqual([]);

    const badTarget = await request(app)
      .put("/api/v1/patron/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cfav", target_kind: "media", target_id: "nope" });
    expect(badTarget.status).toBe(400);

    const addMedia = await request(app)
      .put("/api/v1/patron/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cfav", target_kind: "media", target_id: "m_a" });
    expect(addMedia.status).toBe(200);
    expect(addMedia.body.data.item.target_kind).toBe("media");

    const addPost = await request(app)
      .put("/api/v1/patron/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cfav", target_kind: "post", target_id: "p_fav" });
    expect(addPost.status).toBe(200);

    const list = await request(app)
      .get("/api/v1/patron/favorites?creator_id=cfav")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(2);

    const dup = await request(app)
      .put("/api/v1/patron/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cfav", target_kind: "media", target_id: "m_a" });
    expect(dup.status).toBe(200);

    const del = await request(app)
      .delete("/api/v1/patron/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({ creator_id: "cfav", target_kind: "media", target_id: "m_a" });
    expect(del.status).toBe(200);

    const delAgain = await request(app)
      .delete("/api/v1/patron/favorites")
      .set("Authorization", `Bearer ${token}`)
      .query({ creator_id: "cfav", target_kind: "media", target_id: "m_a" });
    expect(delAgain.status).toBe(404);
  });

  it("403 when creator_id does not match session scope", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-fav-api-"));
    const app = await seedPost(tempDir);
    await request(app).post("/api/v1/identity/register").send({
      creator_id: "cfav",
      email: "x@example.com",
      password: "hunter2hunter2",
      tier_ids: []
    });
    const login = await request(app).post("/api/v1/identity/login").send({
      creator_id: "cfav",
      email: "x@example.com",
      password: "hunter2hunter2"
    });
    const token = login.body.data.token as string;

    const wrong = await request(app)
      .get("/api/v1/patron/favorites?creator_id=other_creator")
      .set("Authorization", `Bearer ${token}`);
    expect(wrong.status).toBe(403);
  });
});
