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

describe("Workstream D gallery API", () => {
  it("lists, filters, facets, bulk tags, saved filters", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-d-"));
    const { app } = testApp(tempDir);

    const ingestBody = {
      creator_id: "cr1",
      tiers: [
        {
          tier_id: "t_gold",
          title: "Gold",
          upstream_updated_at: "2026-03-30T12:00:00Z"
        }
      ],
      posts: [
        {
          post_id: "p_alpha",
          title: "Alpha story",
          published_at: "2026-03-15T12:00:00Z",
          tag_ids: ["forest"],
          tier_ids: ["t_gold"],
          upstream_revision: "a1",
          media: [{ media_id: "m1", mime_type: "image/png", upstream_revision: "m1" }]
        },
        {
          post_id: "p_beta",
          title: "Beta arc",
          published_at: "2026-03-20T12:00:00Z",
          tag_ids: ["city"],
          tier_ids: ["t_gold"],
          upstream_revision: "b1",
          media: [{ media_id: "m2", mime_type: "video/mp4", upstream_revision: "m2" }]
        }
      ]
    };

    await request(app).post("/api/v1/ingest/batches?process_sync=true").send(ingestBody);

    const list = await request(app).get("/api/v1/gallery/items?creator_id=cr1&limit=50");
    expect(list.status).toBe(200);
    expect(list.body.data.items.length).toBe(2);

    const filtered = await request(app).get("/api/v1/gallery/items?creator_id=cr1&q=Beta");
    expect(filtered.body.data.items.length).toBe(1);
    expect(filtered.body.data.items[0].post_id).toBe("p_beta");

    const types = await request(app).get(
      "/api/v1/gallery/items?creator_id=cr1&media_type=image/"
    );
    expect(types.body.data.items.length).toBe(1);
    expect(types.body.data.items[0].media_id).toBe("m1");

    const facets = await request(app).get("/api/v1/gallery/facets?creator_id=cr1");
    expect(facets.status).toBe(200);
    expect(facets.body.data.tag_ids).toContain("forest");
    expect(facets.body.data.tier_ids).toContain("t_gold");

    const bulk = await request(app).post("/api/v1/gallery/media/bulk-tags").send({
      creator_id: "cr1",
      post_ids: ["p_alpha"],
      add_tag_ids: ["bulk_tag"],
      remove_tag_ids: []
    });
    expect(bulk.status).toBe(200);

    const tagged = await request(app).get("/api/v1/gallery/items?creator_id=cr1&tag_ids=bulk_tag");
    expect(tagged.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(
      tagged.body.data.items.find((i: { post_id: string }) => i.post_id === "p_alpha").tag_ids
    ).toContain("bulk_tag");

    const save = await request(app).post("/api/v1/gallery/saved-filters").send({
      creator_id: "cr1",
      name: "city only",
      query: { tag_ids: ["city"] }
    });
    expect(save.status).toBe(201);
    const fid = save.body.data.filter_id as string;

    const listed = await request(app).get("/api/v1/gallery/saved-filters?creator_id=cr1");
    expect(listed.body.data.items.some((x: { filter_id: string }) => x.filter_id === fid)).toBe(
      true
    );

    const del = await request(app).delete(
      `/api/v1/gallery/saved-filters/${fid}?creator_id=cr1`
    );
    expect(del.status).toBe(200);
  });
});
