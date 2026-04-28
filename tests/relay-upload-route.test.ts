import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../src/server.js";

function baseConfig(tempDir: string, prisma?: PrismaClient) {
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
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
    ...(prisma !== undefined ? { prisma } : {})
  };
}

describe("Relay upload (T-3.2)", () => {
  it("returns 401 without session on /relay/upload/init", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-up-"));
    const { app } = createApp(baseConfig(tempDir, {} as PrismaClient));
    const res = await request(app)
      .post("/api/v1/relay/upload/init")
      .send({ creator_id: "c", content_type: "video/mp4", byte_size: 1 });
    expect(res.status).toBe(401);
  });

  it("returns 503 when prisma is not configured", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-up-"));
    const { app } = createApp(baseConfig(tempDir));
    const res = await request(app)
      .post("/api/v1/relay/upload/init")
      .set("Authorization", "Bearer test_sess")
      .send({ creator_id: "c", content_type: "video/mp4", byte_size: 1 });
    expect(res.status).toBe(503);
  });
});
