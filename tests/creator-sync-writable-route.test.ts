import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

function testConfig(tempDir: string) {
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
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  };
}

async function seedIngest(app: import("express").Application, creatorId: string) {
  await request(app)
    .post("/api/v1/ingest/batches?process_sync=true")
    .send({
      creator_id: creatorId,
      tiers: [{ tier_id: "t1", title: "T", upstream_updated_at: "2026-03-30T12:00:00Z" }],
      posts: [
        {
          post_id: "p1",
          title: "Hi",
          published_at: "2026-03-15T12:00:00.000Z",
          tag_ids: [],
          tier_ids: [],
          upstream_revision: "a1",
          media: [{ media_id: "m1", mime_type: "image/png", upstream_revision: "m1" }]
        }
      ]
    });
}

describe("assertCreatorSyncWritable (P5-sync-004)", () => {
  it("returns 423 SYNC_DEGRADED on gallery write when sync_health is failed", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-sync-write-"));
    const healthPath = join(tempDir, "patreon_sync_health.json");
    await writeFile(
      healthPath,
      JSON.stringify({
        records: {
          cr_bad: {
            last_post_scrape: {
              finished_at: "2026-03-01T00:00:00.000Z",
              ok: false,
              patreon_campaign_id: "999",
              error: { code: "test", message: "m", hint: "Fix Patreon sync." }
            }
          }
        }
      }),
      "utf8"
    );
    const { app } = createApp(testConfig(tempDir));
    await seedIngest(app, "cr_bad");

    const bulk = await request(app).post("/api/v1/gallery/media/bulk-tags").send({
      creator_id: "cr_bad",
      post_ids: ["p1"],
      add_tag_ids: ["x"],
      remove_tag_ids: []
    });
    expect(bulk.status).toBe(423);
    expect(bulk.body.error.code).toBe("SYNC_DEGRADED");
    expect(bulk.body.error.details?.some((d: { field: string }) => d.field === "sync_health.status"))
      .toBe(true);
  });

  it("returns 423 when sync_health is degraded (warnings)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-sync-degraded-"));
    const healthPath = join(tempDir, "patreon_sync_health.json");
    await writeFile(
      healthPath,
      JSON.stringify({
        records: {
          cr_warn: {
            last_post_scrape: {
              finished_at: "2026-03-01T00:00:00.000Z",
              ok: true,
              patreon_campaign_id: "999",
              warning_snippets: ["tier mismatch"]
            }
          }
        }
      }),
      "utf8"
    );
    const { app } = createApp(testConfig(tempDir));
    await seedIngest(app, "cr_warn");

    const vis = await request(app).post("/api/v1/gallery/visibility").send({
      creator_id: "cr_warn",
      post_ids: ["p1"],
      visibility: "hidden"
    });
    expect(vis.status).toBe(423);
    expect(vis.body.error.code).toBe("SYNC_DEGRADED");
  });

  it("allows gallery writes when no health row (unknown rollup)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-sync-ok-"));
    const { app } = createApp(testConfig(tempDir));
    await seedIngest(app, "cr_ok");

    const bulk = await request(app).post("/api/v1/gallery/media/bulk-tags").send({
      creator_id: "cr_ok",
      post_ids: ["p1"],
      add_tag_ids: ["free"],
      remove_tag_ids: []
    });
    expect(bulk.status).toBe(200);
  });
});
