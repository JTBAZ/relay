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

describe("Gallery universal search (q)", () => {
  it("matches title, tag substring, HTML description, collection themes, AND multi-token", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-q-"));
    const { app } = testApp(tempDir);
    const creatorId = "cr_qsearch";

    const ingestBody = {
      creator_id: creatorId,
      tiers: [],
      posts: [
        {
          post_id: "p_find_title",
          title: "SolsticeTitleUnique",
          published_at: "2026-03-10T12:00:00Z",
          tag_ids: [],
          tier_ids: [],
          upstream_revision: "t1",
          media: [{ media_id: "m_t1", mime_type: "image/png", upstream_revision: "m_t1" }]
        },
        {
          post_id: "p_find_tag",
          title: "PlainTagHolder",
          published_at: "2026-03-11T12:00:00Z",
          tag_ids: ["tagSapphireUnique"],
          tier_ids: [],
          upstream_revision: "t2",
          media: [{ media_id: "m_t2", mime_type: "image/png", upstream_revision: "m_t2" }]
        },
        {
          post_id: "p_find_desc",
          title: "PlainDescHolder",
          description: "<p><strong>RubyFragmentUnique</strong> other</p>",
          published_at: "2026-03-12T12:00:00Z",
          tag_ids: [],
          tier_ids: [],
          upstream_revision: "t3",
          media: [{ media_id: "m_t3", mime_type: "image/png", upstream_revision: "m_t3" }]
        },
        {
          post_id: "p_find_theme",
          title: "PlainThemeHolder",
          published_at: "2026-03-13T12:00:00Z",
          tag_ids: [],
          tier_ids: [],
          upstream_revision: "t4",
          media: [{ media_id: "m_t4", mime_type: "image/png", upstream_revision: "m_t4" }]
        },
        {
          post_id: "p_find_multi",
          title: "AlphaTokenWord",
          published_at: "2026-03-14T12:00:00Z",
          tag_ids: ["BetaTokenWord"],
          tier_ids: [],
          upstream_revision: "t5",
          media: [{ media_id: "m_t5", mime_type: "image/png", upstream_revision: "m_t5" }]
        }
      ]
    };

    await request(app).post("/api/v1/ingest/batches?process_sync=true").send(ingestBody);

    const colRes = await request(app).post("/api/v1/gallery/collections").send({
      creator_id: creatorId,
      title: "Themed set",
      theme_tag_ids: ["AmberWaveThemeUnique"]
    });
    expect(colRes.status).toBe(201);
    const collectionId = colRes.body.data.collection_id as string;

    const addPosts = await request(app)
      .post(`/api/v1/gallery/collections/${collectionId}/posts`)
      .send({ post_ids: ["p_find_theme"] });
    expect(addPosts.status).toBe(200);

    const byTitle = await request(app).get(
      `/api/v1/gallery/items?creator_id=${creatorId}&q=SolsticeTitleUnique`
    );
    expect(byTitle.status).toBe(200);
    expect(byTitle.body.data.items.map((i: { post_id: string }) => i.post_id)).toEqual([
      "p_find_title"
    ]);

    const byTag = await request(app).get(
      `/api/v1/gallery/items?creator_id=${creatorId}&q=sapphire`
    );
    expect(byTag.status).toBe(200);
    expect(byTag.body.data.items.map((i: { post_id: string }) => i.post_id)).toEqual(["p_find_tag"]);

    const byDesc = await request(app).get(
      `/api/v1/gallery/items?creator_id=${creatorId}&q=RubyFragment`
    );
    expect(byDesc.status).toBe(200);
    expect(byDesc.body.data.items.map((i: { post_id: string }) => i.post_id)).toEqual(["p_find_desc"]);

    const byTheme = await request(app).get(
      `/api/v1/gallery/items?creator_id=${creatorId}&q=AmberWave`
    );
    expect(byTheme.status).toBe(200);
    expect(byTheme.body.data.items.map((i: { post_id: string }) => i.post_id)).toEqual([
      "p_find_theme"
    ]);

    const themeRow = byTheme.body.data.items[0];
    expect(themeRow.collection_theme_tag_ids).toContain("AmberWaveThemeUnique");

    const multi = await request(app).get(
      `/api/v1/gallery/items?creator_id=${creatorId}&q=AlphaTokenWord%20BetaTokenWord`
    );
    expect(multi.status).toBe(200);
    expect(multi.body.data.items.map((i: { post_id: string }) => i.post_id)).toEqual(["p_find_multi"]);

    const multiFail = await request(app).get(
      `/api/v1/gallery/items?creator_id=${creatorId}&q=AlphaTokenWord%20nomatch_xyz`
    );
    expect(multiFail.status).toBe(200);
    expect(multiFail.body.data.items.length).toBe(0);
  });
});
