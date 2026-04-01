import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { canAccessPost } from "../src/clone/tier-rules.js";
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

describe("Workstream F clone generation", () => {
  it("generates clone site, deterministic URLs, preview pages, parity check, tier rules", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-f-"));
    const { app } = testApp(tempDir);

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
            post_id: "p1",
            title: "My First Episode",
            published_at: "2026-03-15T12:00:00Z",
            tag_ids: ["story"],
            tier_ids: ["t_gold"],
            upstream_revision: "r1",
            media: [{ media_id: "m1", mime_type: "image/png", upstream_revision: "mr1" }]
          },
          {
            post_id: "p2",
            title: "Public Update",
            published_at: "2026-03-20T12:00:00Z",
            tag_ids: ["news"],
            tier_ids: ["relay_tier_public"],
            upstream_revision: "r2",
            media: [{ media_id: "m2", mime_type: "image/jpeg", upstream_revision: "mr2" }]
          },
          {
            post_id: "p3",
            title: "Members Only",
            published_at: "2026-03-22T12:00:00Z",
            tag_ids: [],
            tier_ids: ["t_gold", "t_silver"],
            upstream_revision: "r3",
            media: []
          }
        ]
      });

    const gen = await request(app)
      .post("/api/v1/clone/generate")
      .send({ creator_id: "cr1", base_url: "https://mysite.example" });
    expect(gen.status).toBe(200);
    expect(gen.body.data.posts_count).toBe(3);
    expect(gen.body.data.tiers_count).toBe(2);

    const site = await request(app).get("/api/v1/clone/site?creator_id=cr1");
    expect(site.status).toBe(200);
    expect(site.body.data.base_url).toBe("https://mysite.example");
    expect(site.body.data.posts.length).toBe(3);

    const publicPost = site.body.data.posts.find(
      (p: { post_id: string }) => p.post_id === "p2"
    ) as { slug: string; access: { level: string; tier_ids: string[] } };
    expect(publicPost.slug).toContain("public-update");
    expect(publicPost.access.level).toBe("public");

    const gated = site.body.data.posts.find(
      (p: { post_id: string }) => p.post_id === "p1"
    ) as { access: { level: string; tier_ids: string[] } };
    expect(gated.access.level).toBe("tier_gated");
    expect(gated.access.tier_ids).toContain("t_gold");

    const multi = site.body.data.posts.find(
      (p: { post_id: string }) => p.post_id === "p3"
    ) as { access: { level: string; tier_ids: string[] } };
    expect(multi.access.tier_ids.sort()).toEqual(["t_gold", "t_silver"]);

    const preview = await request(app).get("/api/v1/clone/preview-pages?creator_id=cr1");
    expect(preview.status).toBe(200);
    expect(preview.body.data.items.length).toBe(3);
    expect(preview.body.data.items[0].url).toMatch(/^https:\/\/mysite\.example\/posts\//);

    const parity = await request(app).get("/api/v1/clone/parity?creator_id=cr1");
    expect(parity.status).toBe(200);
    expect(parity.body.data.parity_percent).toBe(100);
    expect(parity.body.data.missing_post_ids).toEqual([]);
  });

  it("tier access rules are deterministic", () => {
    expect(canAccessPost({ level: "public", tier_ids: [] }, [])).toBe(true);
    expect(canAccessPost({ level: "public", tier_ids: [] }, ["t_gold"])).toBe(true);
    expect(canAccessPost({ level: "member_only", tier_ids: ["t_gold"] }, [])).toBe(false);
    expect(canAccessPost({ level: "member_only", tier_ids: ["t_gold"] }, ["t_silver"])).toBe(true);
    expect(canAccessPost({ level: "tier_gated", tier_ids: ["t_gold"] }, ["t_silver"])).toBe(false);
    expect(canAccessPost({ level: "tier_gated", tier_ids: ["t_gold"] }, ["t_gold"])).toBe(true);
    expect(
      canAccessPost({ level: "tier_gated", tier_ids: ["t_gold", "t_silver"] }, ["t_silver"])
    ).toBe(true);
  });
});
