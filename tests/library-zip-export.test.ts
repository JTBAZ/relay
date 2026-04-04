import { createHash, randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
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

describe("library zip export", () => {
  it("returns 404 when creator has no exported media", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-zip-"));
    const { app } = testApp(tempDir);

    const res = await request(app).get("/api/v1/export/library-zip?creator_id=nobody");
    expect(res.status).toBe(404);
    expect(res.body.error?.message ?? res.body.data).toBeDefined();
  });

  it("returns 400 without creator_id", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-zip-"));
    const { app } = testApp(tempDir);
    const res = await request(app).get("/api/v1/export/library-zip");
    expect(res.status).toBe(400);
  });

  it("returns 502 JSON when export index references missing files on disk", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-zip-miss-"));
    const { app } = testApp(tempDir);
    const exportRoot = join(tempDir, "exports");
    const creatorId = "cr_missing";

    await mkdir(join(exportRoot, creatorId), { recursive: true });
    const exportIndex = {
      creator_id: creatorId,
      media: {
        m_ghost: {
          media_id: "m_ghost",
          creator_id: creatorId,
          sha256: "abc",
          byte_length: 1,
          relative_blob_path: "media/m_ghost/nothing_here",
          upstream_revision: "x",
          exported_at: new Date().toISOString()
        }
      }
    };
    await writeFile(
      join(exportRoot, creatorId, "export_index.json"),
      JSON.stringify(exportIndex, null, 2),
      "utf8"
    );

    const res = await request(app).get(`/api/v1/export/library-zip?creator_id=${creatorId}`);
    expect(res.status).toBe(502);
    expect(String(res.body?.error?.message ?? "")).toMatch(/missing on disk/i);
  });

  it("streams a zip with manifests and exported blob paths", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-zip-"));
    const { app } = testApp(tempDir);
    const exportRoot = join(tempDir, "exports");
    const creatorId = "cr_zip";

    const ingestBody = {
      creator_id: creatorId,
      tiers: [
        {
          tier_id: "t1",
          title: "Tier",
          upstream_updated_at: "2026-03-30T12:00:00Z"
        }
      ],
      posts: [
        {
          post_id: "p1",
          title: "Post",
          published_at: "2026-03-15T12:00:00Z",
          tag_ids: ["a"],
          tier_ids: ["t1"],
          upstream_revision: "p1v",
          media: [
            {
              media_id: "m_zip",
              mime_type: "image/png",
              upstream_revision: "m1"
            }
          ]
        }
      ]
    };
    await request(app).post("/api/v1/ingest/batches?process_sync=true").send(ingestBody);

    const blob = Buffer.from("hello-library-zip");
    const sha256 = createHash("sha256").update(blob).digest("hex");
    const relativeBlobPath = "media/m_zip/asset";
    await mkdir(join(exportRoot, creatorId, "media", "m_zip"), { recursive: true });
    await writeFile(join(exportRoot, creatorId, "media", "m_zip", "asset"), blob);

    const exportIndex = {
      creator_id: creatorId,
      media: {
        m_zip: {
          media_id: "m_zip",
          creator_id: creatorId,
          sha256,
          byte_length: blob.length,
          relative_blob_path: relativeBlobPath,
          upstream_revision: "m1",
          exported_at: new Date().toISOString()
        }
      }
    };
    await writeFile(
      join(exportRoot, creatorId, "export_index.json"),
      JSON.stringify(exportIndex, null, 2),
      "utf8"
    );

    const res = await request(app)
      .get(`/api/v1/export/library-zip?creator_id=${creatorId}`)
      .buffer(true)
      .parse((res2, callback) => {
        const chunks: Buffer[] = [];
        res2.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res2.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      });

    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toContain("zip");
    expect(res.headers["content-disposition"]).toMatch(/relay-library/);

    const body = res.body as Buffer;
    expect(body.subarray(0, 2).toString("binary")).toBe("PK");

    const zip = new AdmZip(body);
    const names = zip.getEntries().map((e) => e.entryName.replace(/\\/g, "/"));
    expect(names.some((n) => n === "manifests/media-manifest.json")).toBe(true);
    expect(names.some((n) => n === "manifests/post-map.json")).toBe(true);
    expect(names.some((n) => n === "manifests/tier-map.json")).toBe(true);
    expect(names.some((n) => n === "media/m_zip/asset")).toBe(true);

    const facets = await request(app).get(`/api/v1/gallery/facets?creator_id=${creatorId}`);
    expect(facets.status).toBe(200);
    expect(facets.body.data.export_total_bytes).toBe(blob.length);
    expect(facets.body.data.export_media_count).toBe(1);
  });
});
