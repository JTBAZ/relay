import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

function appWithCollections(tempDir: string) {
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
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  });
}

describe("Gallery collections access ceiling", () => {
  it("rejects addPosts when post tier floor exceeds ceiling", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-col-acc-"));
    const { app } = appWithCollections(tempDir);

    const ingestBody = {
      creator_id: "cr1",
      tiers: [
        {
          tier_id: "t_five",
          title: "5",
          amount_cents: 500,
          upstream_updated_at: "2026-03-30T12:00:00Z"
        },
        {
          tier_id: "t_ten",
          title: "10",
          amount_cents: 1000,
          upstream_updated_at: "2026-03-30T12:00:00Z"
        }
      ],
      posts: [
        {
          post_id: "p_cheap",
          title: "Cheap",
          published_at: "2026-03-15T12:00:00Z",
          tag_ids: [],
          tier_ids: ["t_five"],
          upstream_revision: "a1",
          media: [{ media_id: "m1", mime_type: "image/png", upstream_revision: "m1" }]
        },
        {
          post_id: "p_premium",
          title: "Premium",
          published_at: "2026-03-16T12:00:00Z",
          tag_ids: [],
          tier_ids: ["t_ten"],
          upstream_revision: "b1",
          media: [{ media_id: "m2", mime_type: "image/png", upstream_revision: "m2" }]
        }
      ]
    };

    await request(app).post("/api/v1/ingest/batches?process_sync=true").send(ingestBody);

    const face = await request(app).get("/api/v1/gallery/facets?creator_id=cr1");
    expect(face.body.data.tiers.find((t: { tier_id: string }) => t.tier_id === "t_five")?.amount_cents).toBe(
      500
    );

    const created = await request(app).post("/api/v1/gallery/collections").send({
      creator_id: "cr1",
      title: "Five booth",
      access_ceiling_tier_id: "t_five",
      theme_tag_ids: ["Love"]
    });
    expect(created.status).toBe(201);
    const colId = created.body.data.collection_id as string;
    expect(created.body.data.theme_tag_ids).toEqual(["Love"]);

    const add = await request(app).post(`/api/v1/gallery/collections/${colId}/posts`).send({
      post_ids: ["p_cheap", "p_premium"]
    });
    expect(add.status).toBe(200);
    expect(add.body.data.collection.post_ids).toEqual(["p_cheap"]);
    expect(add.body.data.rejected_post_ids).toEqual([
      { post_id: "p_premium", reason: "incompatible_with_access_ceiling" }
    ]);
  });
});
