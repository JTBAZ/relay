/**
 * PILOT-013 — manual import API route smoke + sign-off wiring.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import type { PrismaClient } from "@prisma/client";
import { loadPilotUxSeedSpec, resolvePilotUxDevPassword } from "../src/pilot-ux/pilot-ux-seed-spec.js";
import { seedPilotUxDevAccounts } from "../src/pilot-ux/seed-pilot-ux-dev-accounts.js";
import { prisma } from "../src/lib/db.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const fixturePath = join(process.cwd(), "tests/fixtures/pilot-ux-seed.json");
const AVA_CREATOR_ID = "rcx_pilot_dev_ava";

function fileOnlyConfig(tempDir: string) {
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
    collections_store_path: join(tempDir, "collections.json"),
    page_layout_store_path: join(tempDir, "page_layout.json"),
    patron_favorites_store_path: join(tempDir, "patron_favorites.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  };
}

function pilotUxDbAppConfig(tempDir: string) {
  return {
    ...fileOnlyConfig(tempDir),
    prisma,
    relay_db_store_identity: true,
    relay_db_store_canonical: true,
    relay_db_store_overrides: true
  };
}

describe("manual import routes (PILOT-013)", () => {
  it("GET /api/v1/relay/manual-import/setup returns 503 without database", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-mi-setup-503-"));
    const { app } = createApp(fileOnlyConfig(tempDir));
    const res = await request(app).get(
      `/api/v1/relay/manual-import/setup?creator_id=${AVA_CREATOR_ID}`
    );
    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("GET /api/v1/relay/manual-import/setup returns 401 without session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-mi-setup-401-"));
    const { app } = createApp({ ...fileOnlyConfig(tempDir), prisma: {} as PrismaClient });
    const res = await request(app).get("/api/v1/relay/manual-import/setup");
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/relay/manual-import/setup returns 401 without session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-mi-post-401-"));
    const { app } = createApp({ ...fileOnlyConfig(tempDir), prisma: {} as PrismaClient });
    const res = await request(app)
      .post("/api/v1/relay/manual-import/setup")
      .send({ bins: [{ name: "Basic", amount_cents: 500 }] });
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/relay/manual-import/staging returns 401 without session", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-mi-staging-401-"));
    const { app } = createApp({ ...fileOnlyConfig(tempDir), prisma: {} as PrismaClient });
    const res = await request(app).get(
      `/api/v1/relay/manual-import/staging?creator_id=${AVA_CREATOR_ID}`
    );
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!hasDatabaseUrl)("manual import routes — pilot UX integration", () => {
  it(
    "Dev Ava setup exposes synced Patreon tiers; bins stay upload-disabled until linked",
    async () => {
      const spec = loadPilotUxSeedSpec(fixturePath);
      const password = resolvePilotUxDevPassword(spec);
      await seedPilotUxDevAccounts(prisma, { fixturePath });

      const tempDir = await mkdtemp(join(tmpdir(), "relay-mi-int-"));
      const { app } = createApp(pilotUxDbAppConfig(tempDir));

      const login = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: spec.accounts.creatorAva.email, password });
      expect(login.status).toBe(200);
      const token = login.body.data.token as string;

      const setupGet = await request(app)
        .get(`/api/v1/relay/manual-import/setup?creator_id=${AVA_CREATOR_ID}`)
        .set("Authorization", `Bearer ${token}`);
      expect(setupGet.status).toBe(200);
      expect(setupGet.body.data.synced_tiers.length).toBeGreaterThanOrEqual(2);
      expect(
        setupGet.body.data.synced_tiers.every(
          (row: { upload_enabled: boolean }) => row.upload_enabled === true
        )
      ).toBe(true);

      const setupPost = await request(app)
        .post("/api/v1/relay/manual-import/setup")
        .set("Authorization", `Bearer ${token}`)
        .send({
          creator_id: AVA_CREATOR_ID,
          bins: [{ name: "Studio folder", amount_cents: 1500, linked_provider_relay_tier_id: null }]
        });
      expect(setupPost.status).toBe(200);
      const manualBin = setupPost.body.data.manual_bins.find(
        (row: { title: string }) => row.title === "Studio folder"
      );
      expect(manualBin).toBeTruthy();
      expect(manualBin.upload_enabled).toBe(false);

      const staging = await request(app)
        .get(`/api/v1/relay/manual-import/staging?creator_id=${AVA_CREATOR_ID}`)
        .set("Authorization", `Bearer ${token}`);
      expect(staging.status).toBe(200);
      expect(Array.isArray(staging.body.data.items)).toBe(true);

      const commit = await request(app)
        .post("/api/v1/relay/manual-import/commit-to-library")
        .set("Authorization", `Bearer ${token}`)
        .send({ creator_id: AVA_CREATOR_ID });
      expect(commit.status).toBe(200);
      expect(typeof commit.body.data.committed_count).toBe("number");
    },
    120_000
  );
});
