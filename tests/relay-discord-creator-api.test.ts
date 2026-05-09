/**
 * Creator-facing Library staging (unified Discord + upload), Discord staging aliases,
 * and link-code routes — auth and validation wiring.
 */
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

describe("GET /api/v1/relay/library/staging", () => {
  it("returns 503 when prisma is not configured", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-lib-stg-"));
    const { app } = createApp(baseConfig(tempDir));
    const res = await request(app).get("/api/v1/relay/library/staging").query({ creator_id: "c1" });
    expect(res.status).toBe(503);
  });

  it("returns 401 when creator_id is missing (auth runs first; no session)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-lib-stg-"));
    const { app } = createApp(baseConfig(tempDir, {} as PrismaClient));
    const res = await request(app).get("/api/v1/relay/library/staging");
    expect(res.status).toBe(401);
  });

  it("returns 401 when no session cookie or bearer", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-lib-stg-"));
    const { app } = createApp(baseConfig(tempDir, {} as PrismaClient));
    const res = await request(app)
      .get("/api/v1/relay/library/staging")
      .query({ creator_id: "creator_1" });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/v1/relay/library/staging/:mediaId", () => {
  it("returns 503 when prisma is not configured", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-lib-stg-del-"));
    const { app } = createApp(baseConfig(tempDir));
    const res = await request(app)
      .delete("/api/v1/relay/library/staging/m1")
      .query({ creator_id: "c1" });
    expect(res.status).toBe(503);
  });

  it("returns 401 when no session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-lib-stg-del-"));
    const { app } = createApp(baseConfig(tempDir, {} as PrismaClient));
    const res = await request(app)
      .delete("/api/v1/relay/library/staging/m1")
      .query({ creator_id: "creator_1" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/relay/discord/staging", () => {
  it("returns 503 when prisma is not configured", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-stg-"));
    const { app } = createApp(baseConfig(tempDir));
    const res = await request(app).get("/api/v1/relay/discord/staging").query({ creator_id: "c1" });
    expect(res.status).toBe(503);
  });

  it("returns 401 when creator_id is missing (auth runs first; no session)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-stg-"));
    const { app } = createApp(baseConfig(tempDir, {} as PrismaClient));
    const res = await request(app).get("/api/v1/relay/discord/staging");
    expect(res.status).toBe(401);
  });

  it("returns 401 when no session cookie or bearer", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-stg-"));
    const { app } = createApp(baseConfig(tempDir, {} as PrismaClient));
    const res = await request(app)
      .get("/api/v1/relay/discord/staging")
      .query({ creator_id: "creator_1" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/relay/discord/link-codes", () => {
  it("returns 401 when no session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-lc-"));
    const { app } = createApp(baseConfig(tempDir, {} as PrismaClient));
    const res = await request(app)
      .post("/api/v1/relay/discord/link-codes")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ creator_id: "creator_1" }));
    expect(res.status).toBe(401);
  });
});
