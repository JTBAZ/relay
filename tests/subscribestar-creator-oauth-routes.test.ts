import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";

function minimalPaths(dir: string) {
  return {
    credential_store_path: join(dir, "patreon.json"),
    ingest_canonical_path: join(dir, "canonical.json"),
    ingest_dlq_path: join(dir, "dlq.json"),
    export_storage_root: join(dir, "exports"),
    gallery_post_overrides_path: join(dir, "gallery_overrides.json"),
    gallery_saved_filters_path: join(dir, "saved_filters.json"),
    analytics_store_path: join(dir, "analytics.json"),
    clone_store_path: join(dir, "clone_sites.json"),
    identity_store_path: join(dir, "identity.json"),
    payment_store_path: join(dir, "payments.json"),
    migration_store_path: join(dir, "migrations.json"),
    deploy_store_path: join(dir, "deploys.json")
  };
}

describe("SubscribeStar creator OAuth HTTP routes — guard rails", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns NOT_FOUND when SUBSCRIBESTAR_INGEST_ENABLED is off/falsy", async () => {
    vi.stubEnv("SUBSCRIBESTAR_INGEST_ENABLED", "");
    const dir = await mkdtemp(join(tmpdir(), "relay-ss-ingest-off-"));
    const { app } = createApp({
      patreon_client_id: "c",
      patreon_client_secret: "s",
      relay_token_encryption_key: randomBytes(32).toString("base64"),
      ...minimalPaths(dir)
    });

    const resPrepare = await request(app)
      .post("/api/v1/auth/subscribestar/creator/prepare")
      .send({ creator_id: "cr_test" });

    expect(resPrepare.status).toBe(404);
    expect(resPrepare.body?.error?.code).toBe("NOT_FOUND");

    const resExchange = await request(app)
      .post("/api/v1/auth/subscribestar/creator/exchange")
      .send({
        creator_id: "cr_test",
        code: "abc",
        redirect_uri: "https://relay.example/ss/callback"
      });

    expect(resExchange.status).toBe(404);

    const resRefresh = await request(app)
      .post("/api/v1/auth/subscribestar/creator/refresh")
      .send({ creator_id: "cr_test" });

    expect(resRefresh.status).toBe(404);

    const resSync = await request(app)
      .post("/api/v1/subscribestar/creator/sync/posts")
      .send({ creator_id: "cr_test" });

    expect(resSync.status).toBe(404);
    expect(resSync.body?.error?.code).toBe("NOT_FOUND");
  });

  it("returns SERVICE_UNAVAILABLE on prepare/exchange when ingest is on but creator OAuth credentials are incomplete", async () => {
    vi.stubEnv("SUBSCRIBESTAR_INGEST_ENABLED", "1");
    // Vitest loads root `.env` — neutralize SubscriberStar OAuth vars so subscribeStarCreatorAuthService stays undefined,
    // and clear redirect pinning so arbitrary test redirect_uri validates.
    vi.stubEnv("SUBSCRIBESTAR_RELAY_CREATOR_CLIENT_ID", "");
    vi.stubEnv("SUBSCRIBESTAR_RELAY_CREATOR_SECRET", "");
    vi.stubEnv("SUBSCRIBESTAR_CREATOR_CLIENT_ID", "");
    vi.stubEnv("SUBSCRIBESTAR_CREATOR_CLIENT_SECRET", "");
    vi.stubEnv("SUBSCRIBESTAR_RELAY_CREATOR_REDIRECT_URI", "");
    vi.stubEnv("SUBSCRIBESTAR_CREATOR_REDIRECT_URI", "");
    const dir = await mkdtemp(join(tmpdir(), "relay-ss-oauth-disabled-"));

    const { app } = createApp({
      patreon_client_id: "c",
      patreon_client_secret: "s",
      relay_token_encryption_key: randomBytes(32).toString("base64"),
      ...minimalPaths(dir),
      relay_db_store_creator_oauth: true,
      prisma: {} as unknown as PrismaClient
      // Intentionally no subscribestar_creator_client_id / secret — wiring stays uninitialized.
    });

    const resPrepare = await request(app)
      .post("/api/v1/auth/subscribestar/creator/prepare")
      .send({ creator_id: "cr_test" });

    expect(resPrepare.status).toBe(503);
    expect(resPrepare.body?.error?.code).toBe("SERVICE_UNAVAILABLE");

    const resExchange = await request(app)
      .post("/api/v1/auth/subscribestar/creator/exchange")
      .send({
        creator_id: "cr_test",
        code: "oauth_code",
        redirect_uri: "https://relay.example/ss/callback"
      });

    expect(resExchange.status).toBe(503);
  });

  it("returns SERVICE_UNAVAILABLE on refresh when service is uninitialized", async () => {
    vi.stubEnv("SUBSCRIBESTAR_INGEST_ENABLED", "1");
    vi.stubEnv("SUBSCRIBESTAR_RELAY_CREATOR_CLIENT_ID", "");
    vi.stubEnv("SUBSCRIBESTAR_RELAY_CREATOR_SECRET", "");
    vi.stubEnv("SUBSCRIBESTAR_CREATOR_CLIENT_ID", "");
    vi.stubEnv("SUBSCRIBESTAR_CREATOR_CLIENT_SECRET", "");
    const dir = await mkdtemp(join(tmpdir(), "relay-ss-refresh-off-"));

    const { app } = createApp({
      patreon_client_id: "c",
      patreon_client_secret: "s",
      relay_token_encryption_key: randomBytes(32).toString("base64"),
      ...minimalPaths(dir),
      relay_db_store_creator_oauth: true,
      prisma: {} as unknown as PrismaClient
    });

    const res = await request(app)
      .post("/api/v1/auth/subscribestar/creator/refresh")
      .send({ creator_id: "cr_test" });

    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe("SERVICE_UNAVAILABLE");
  });
});
