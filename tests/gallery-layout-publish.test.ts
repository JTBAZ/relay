import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

function layoutFileApp(tempDir: string) {
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
    page_layout_store_path: join(tempDir, "page_layout.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  });
}

describe("gallery layout draft + publish (file-backed, no prisma)", () => {
  const baseLayoutBody = () => ({
    creator_id: "cr_layout_tester",
    theme: { color_scheme: "dark" as const },
    sections: [],
    updated_at: new Date().toISOString()
  });

  it("PUT then GET merges published_at after POST publish", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-layout-pub-"));
    const { app } = layoutFileApp(tempDir);
    const cid = "cr_layout_tester";

    let put = await request(app).put("/api/v1/gallery/layout").send(baseLayoutBody());
    expect(put.status).toBe(200);

    let get = await request(app).get("/api/v1/gallery/layout").query({ creator_id: cid });
    expect(get.status).toBe(200);
    expect(get.body.data.published_at).toBeUndefined();

    const pub = await request(app).post("/api/v1/gallery/layout/publish").send({ creator_id: cid });
    expect(pub.status).toBe(200);
    expect(typeof pub.body.data.published_at).toBe("string");

    get = await request(app).get("/api/v1/gallery/layout").query({ creator_id: cid });
    expect(get.status).toBe(200);
    expect(typeof get.body.data.published_at).toBe("string");
  });

  it("GET /api/v1/public/creators/:slug/gallery-layout returns 503 without database", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pub-layout-"));
    const { app } = layoutFileApp(tempDir);
    const res = await request(app).get("/api/v1/public/creators/any-slug/gallery-layout");
    expect(res.status).toBe(503);
  });
});
