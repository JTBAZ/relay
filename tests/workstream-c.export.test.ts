import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

function appConfig(tempDir: string, fetchImpl: typeof fetch) {
  return {
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
    fetch_impl: fetchImpl
  };
}

describe("Workstream C export storage and manifests", () => {
  it("downloads asset, stores checksum, serves content, manifests, verify, materialize", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-c-"));
    const payload = Buffer.from("fake-original-bytes");
    const expectedHash = createHash("sha256").update(payload).digest("hex");

    const fetchImpl = vi.fn(async (url: string | URL) => {
      void url;
      return new Response(payload, { status: 200 });
    }) as unknown as typeof fetch;

    const { app } = createApp(appConfig(tempDir, fetchImpl));

    const ingestBody = {
      creator_id: "creator_1",
      campaigns: [
        {
          campaign_id: "camp_1",
          name: "Main",
          upstream_updated_at: "2026-03-30T12:00:00Z"
        }
      ],
      tiers: [
        {
          tier_id: "tier_gold",
          title: "Gold",
          campaign_id: "camp_1",
          upstream_updated_at: "2026-03-30T12:00:00Z"
        }
      ],
      posts: [
        {
          post_id: "post_1",
          title: "Ep 1",
          published_at: "2026-03-30T12:00:00Z",
          tag_ids: ["t1"],
          tier_ids: ["tier_gold"],
          upstream_revision: "p1",
          media: [
            {
              media_id: "media_1",
              mime_type: "image/png",
              upstream_revision: "m1",
              upstream_url: "https://cdn.example/obj.png"
            }
          ]
        }
      ]
    };

    const ing = await request(app).post("/api/v1/ingest/batches?process_sync=true").send(ingestBody);
    expect(ing.status).toBe(200);

    const ex = await request(app).post("/api/v1/export/media").send({
      creator_id: "creator_1",
      media_id: "media_1"
    });
    expect(ex.status).toBe(200);
    expect(ex.body.data).toMatchObject({
      sha256: expectedHash,
      byte_length: payload.length,
      idempotent_skip: false
    });

    const again = await request(app).post("/api/v1/export/media").send({
      creator_id: "creator_1",
      media_id: "media_1"
    });
    expect(again.status).toBe(200);
    expect(again.body.data.idempotent_skip).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const manifest = await request(app).get(
      "/api/v1/export/manifests/media-manifest?creator_id=creator_1"
    );
    expect(manifest.status).toBe(200);
    expect(manifest.body.data.items).toHaveLength(1);
    expect(manifest.body.data.items[0].sha256).toBe(expectedHash);

    const content = await request(app).get("/api/v1/export/media/creator_1/media_1/content");
    expect(content.status).toBe(200);
    expect(content.headers["content-type"]).toMatch(/image\/png/);
    expect(content.headers.etag).toBe(`"${expectedHash}"`);
    expect(content.body).toEqual(payload);

    const verify = await request(app).post("/api/v1/export/verify").send({
      creator_id: "creator_1",
      media_id: "media_1"
    });
    expect(verify.status).toBe(200);
    expect(verify.body.data.match).toBe(true);

    const mat = await request(app)
      .post("/api/v1/export/manifests/materialize")
      .send({ creator_id: "creator_1" });
    expect(mat.status).toBe(200);
    const rawManifest = await readFile(
      join(tempDir, "exports", "creator_1", "manifests", "media-manifest.json"),
      "utf8"
    );
    const parsed = JSON.parse(rawManifest) as { items: Array<{ sha256: string }> };
    expect(parsed.items[0].sha256).toBe(expectedHash);
  });
});
