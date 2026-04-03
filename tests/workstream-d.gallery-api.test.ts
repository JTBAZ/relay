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

    const bulkRemove = await request(app).post("/api/v1/gallery/media/bulk-tags").send({
      creator_id: "cr1",
      post_ids: ["p_alpha"],
      add_tag_ids: [],
      remove_tag_ids: ["bulk_tag"]
    });
    expect(bulkRemove.status).toBe(200);
    expect(bulkRemove.body.data.updated_post_count).toBe(1);

    const afterRemove = await request(app).get(
      "/api/v1/gallery/post-detail?creator_id=cr1&post_id=p_alpha"
    );
    expect(afterRemove.status).toBe(200);
    expect(afterRemove.body.data.tag_ids ?? []).not.toContain("bulk_tag");

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

  it("bulk-tags with media_targets applies tags per asset row", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-d-media-tags-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "crM",
        tiers: [],
        posts: [
          {
            post_id: "p_two",
            title: "Two chars",
            published_at: "2026-03-30T12:00:00Z",
            tag_ids: ["scene"],
            tier_ids: [],
            upstream_revision: "1",
            media: [
              { media_id: "m_a", mime_type: "image/png", upstream_revision: "a" },
              { media_id: "m_b", mime_type: "image/png", upstream_revision: "b" }
            ]
          }
        ]
      });

    const bulk = await request(app).post("/api/v1/gallery/media/bulk-tags").send({
      creator_id: "crM",
      media_targets: [{ post_id: "p_two", media_id: "m_a" }],
      add_tag_ids: ["char_x"],
      remove_tag_ids: []
    });
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.updated_media_targets).toBe(1);

    const list = await request(app).get("/api/v1/gallery/items?creator_id=crM&limit=50");
    const rowA = list.body.data.items.find((i: { media_id: string }) => i.media_id === "m_a");
    const rowB = list.body.data.items.find((i: { media_id: string }) => i.media_id === "m_b");
    expect(rowA?.tag_ids).toContain("char_x");
    expect(rowB?.tag_ids).not.toContain("char_x");
    expect(rowB?.tag_ids).toContain("scene");

    const byTag = await request(app).get("/api/v1/gallery/items?creator_id=crM&tag_ids=char_x");
    expect(byTag.body.data.items.length).toBe(1);
    expect(byTag.body.data.items[0].media_id).toBe("m_a");
  });

  it("display=post_primary returns one row per post with hero selection", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-d-primary-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "crP",
        tiers: [],
        posts: [
          {
            post_id: "p_dual",
            title: "Dual asset",
            published_at: "2026-03-30T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "d1",
            media: [
              { media_id: "patreon_media_a", mime_type: "image/png", upstream_revision: "a" },
              {
                media_id: "patreon_99_cover",
                mime_type: "image/jpeg",
                upstream_revision: "c",
                role: "cover"
              }
            ]
          },
          {
            post_id: "p_single",
            title: "Single",
            published_at: "2026-03-29T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "s1",
            media: [{ media_id: "m_only", mime_type: "image/gif", upstream_revision: "o" }]
          }
        ]
      });

    const all = await request(app).get("/api/v1/gallery/items?creator_id=crP&limit=50");
    expect(all.body.data.items.length).toBe(3);

    const primary = await request(app).get(
      "/api/v1/gallery/items?creator_id=crP&display=post_primary&limit=50"
    );
    expect(primary.status).toBe(200);
    expect(primary.body.data.items.length).toBe(2);
    const dualHero = primary.body.data.items.find((i: { post_id: string }) => i.post_id === "p_dual");
    expect(dualHero?.media_id).toBe("patreon_99_cover");
  });

  it("media_targets-only visible restores one row when post is post-level review", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-d-vis-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "crV",
        tiers: [],
        posts: [
          {
            post_id: "p_multi",
            title: "Multi",
            published_at: "2026-03-30T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "v1",
            media: [
              { media_id: "ma", mime_type: "image/png", upstream_revision: "ma" },
              { media_id: "mb", mime_type: "image/png", upstream_revision: "mb" }
            ]
          }
        ]
      });

    const flagPost = await request(app).post("/api/v1/gallery/visibility").send({
      creator_id: "crV",
      post_ids: ["p_multi"],
      media_targets: [],
      visibility: "review"
    });
    expect(flagPost.status).toBe(200);

    const restoreOne = await request(app).post("/api/v1/gallery/visibility").send({
      creator_id: "crV",
      post_ids: [],
      media_targets: [{ post_id: "p_multi", media_id: "ma" }],
      visibility: "visible"
    });
    expect(restoreOne.status).toBe(200);

    const visible = await request(app).get(
      "/api/v1/gallery/items?creator_id=crV&visibility=visible&limit=50"
    );
    expect(visible.status).toBe(200);
    const visibleIds = visible.body.data.items.map((i: { media_id: string }) => i.media_id);
    expect(visibleIds).toContain("ma");

    const stillReview = await request(app).get(
      "/api/v1/gallery/items?creator_id=crV&visibility=review&limit=50"
    );
    const reviewIds = stillReview.body.data.items.map((i: { media_id: string }) => i.media_id);
    expect(reviewIds).toContain("mb");
    expect(reviewIds).not.toContain("ma");
  });

  it("excludes text-only synthetic rows by default; include with text_only_posts=include", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-d-textonly-"));
    const { app } = testApp(tempDir);

    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "crText",
        tiers: [],
        posts: [
          {
            post_id: "p_media",
            title: "Has media",
            published_at: "2026-03-30T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "m1",
            media: [{ media_id: "m1", mime_type: "image/png", upstream_revision: "mr1" }]
          },
          {
            post_id: "p_textonly",
            title: "Poll / text only",
            published_at: "2026-03-29T12:00:00Z",
            tag_ids: ["poll"],
            tier_ids: [],
            upstream_revision: "t1",
            media: []
          }
        ]
      });

    const defaultList = await request(app).get("/api/v1/gallery/items?creator_id=crText&limit=50");
    expect(defaultList.status).toBe(200);
    const defaultIds = defaultList.body.data.items.map((i: { media_id: string }) => i.media_id);
    expect(defaultIds).toContain("m1");
    expect(defaultIds.some((id: string) => id.startsWith("post_only_"))).toBe(false);

    const withText = await request(app).get(
      "/api/v1/gallery/items?creator_id=crText&limit=50&text_only_posts=include"
    );
    expect(withText.status).toBe(200);
    const withIds = withText.body.data.items.map((i: { media_id: string }) => i.media_id);
    expect(withIds.some((id: string) => id.startsWith("post_only_p_textonly"))).toBe(true);
  });

  it("accepts legacy visibility flagged in PATCH body as review", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-d-legacy-vis-"));
    const { app } = testApp(tempDir);
    await request(app)
      .post("/api/v1/ingest/batches?process_sync=true")
      .send({
        creator_id: "crL",
        tiers: [],
        posts: [
          {
            post_id: "p1",
            title: "T",
            published_at: "2026-03-30T12:00:00.000Z",
            tag_ids: [],
            tier_ids: [],
            upstream_revision: "l1",
            media: [{ media_id: "mx", mime_type: "image/png", upstream_revision: "mx" }]
          }
        ]
      });
    const patch = await request(app).post("/api/v1/gallery/visibility").send({
      creator_id: "crL",
      post_ids: ["p1"],
      media_targets: [],
      visibility: "flagged"
    });
    expect(patch.status).toBe(200);
    const list = await request(app).get(
      "/api/v1/gallery/items?creator_id=crL&visibility=review&limit=50"
    );
    expect(list.body.data.items.some((i: { post_id: string }) => i.post_id === "p1")).toBe(true);
  });
});
