/**
 * SubscribeStar posts sync — HTTP integration (routing + guards + ingest wiring).
 *
 * ## What “end-to-end” means here (current product surface)
 *
 * Production path includes real SubscribeStar OAuth in DB, live GraphQL, and canonical ingest.
 * Vitest fixes **env shape**, stubs **Prisma OAuth rows**, **mock upstream GraphQL** via `fetch_impl`,
 * and spies **`ingestService.runBatch`** so we assert the orchestration boundary without calling live SubscribeStar.
 *
 * ## Manual / staging checklist (live API + real tokens)
 *
 * **Relay API `.env`** (minimal):
 * ```
 * RELAY_TOKEN_ENCRYPTION_KEY=<32-byte base64>
 * RELAY_DB_STORE_CREATOR_OAUTH=1               # DB OAuth store + Prisma
 * DATABASE_URL=…
 * SUBSCRIBESTAR_INGEST_ENABLED=1
 * SUBSCRIBESTAR_RELAY_CREATOR_CLIENT_ID=…   # SubscribeStar OAuth app id
 * SUBSCRIBESTAR_RELAY_CREATOR_SECRET=…
 * SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY=
 * ```
 * Prefer multi-line Explorer query via env file; alternatively `SUBSCRIBESTAR_INGEST_QUERIES_JSON={"postsPage":"…"}`.
 * Optional defaults: `SUBSCRIBESTAR_SYNC_POSTS_MAX_PAGES`, `SUBSCRIBESTAR_API_ORIGIN`, autosync knobs in `.env.example`.
 *
 * **Operator / curl** (`RELAY_CREATOR_ROUTE_SECRET` unset — no tenant head-check):
 *
 * ```
 * curl -sS -X POST "https://relay.example/api/v1/subscribestar/creator/sync/posts" \
 *   -H "Content-Type: application/json" \
 *   --data '{"creator_id":"<relay_creator_uuid>","max_pages":3}'
 * ```
 *
 * If `RELAY_CREATOR_ROUTE_SECRET` is set, add `-H "X-Relay-Creator-Secret: …"` **and**
 * ensure `RELAY_ENFORCE_CREATOR_TENANT=1`-style tenancy is satisfied (stub uses no tenant enforcement).
 *
 * **Web Studio**: SubscribeStar connect → **Pull posts** (session cookie calls the same POST).
 *
 * **Autosync**: set `RELAY_SUBSCRIBESTAR_GRAPHQL_INGEST_MS` (≥ 600_000 ms) plus `RELAY_JOB_BACKEND`
 * (`memory` timer vs `bullmq` worker + Redis); see `.env.example`.
 */

import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import { CredentialHealth } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenEncryption } from "../src/lib/crypto.js";
import { createApp } from "../src/server.js";
import type { ApplyBatchResult } from "../src/ingest/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

describe("SubscribeStar creator sync/posts HTTP route — integration-shaped env", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY;
  });

  it("POST /api/v1/subscribestar/creator/sync/posts returns 200, calls ingest after GraphQL fixture", async () => {
    const key = randomBytes(32).toString("base64");
    const encryption = new TokenEncryption(key);

    vi.stubEnv("SUBSCRIBESTAR_INGEST_ENABLED", "1");
    vi.stubEnv("SUBSCRIBESTAR_INGEST_POSTS_GRAPHQL_QUERY", "{ __placeholder }"); // ingest module reads env
    vi.stubEnv("SUBSCRIBESTAR_RELAY_CREATOR_CLIENT_ID", "relay_test_ss_client_id");
    vi.stubEnv("SUBSCRIBESTAR_RELAY_CREATOR_SECRET", "relay_test_ss_client_secret");

    vi.stubEnv("SUBSCRIBESTAR_CREATOR_REDIRECT_URI", "");
    vi.stubEnv("SUBSCRIBESTAR_RELAY_CREATOR_REDIRECT_URI", "");
    vi.stubEnv("RELAY_CREATOR_ROUTE_SECRET", "");
    vi.stubEnv("RELAY_ENFORCE_CREATOR_TENANT", "");

    const stubApply: ApplyBatchResult = {
      job_id: "job_ss_http",
      idempotent_skips: 0,
      campaigns_upserted: 1,
      tiers_upserted: 0,
      posts_written: 1,
      media_upserted: 0,
      tombstones_applied: 0,
      events_emitted: 0
    };

    const payloadJson = {
      encrypted_access_token: encryption.encrypt("upstream_ss_access_mock"),
      encrypted_refresh_token: encryption.encrypt("upstream_ss_refresh_mock"),
      provider_user_id: "ss_provider_user_integration"
    };
    const oauthFindFirstMock = vi.fn().mockResolvedValue({
      expiresAtHint: new Date("2099-06-01T00:00:00.000Z"),
      encryptedPayload: Buffer.from(JSON.stringify(payloadJson), "utf8"),
      healthStatus: CredentialHealth.healthy
    });
    const creatorProviderSyncStateUpsertMock = vi.fn().mockResolvedValue(undefined);

    const prismaStub = {
      oAuthCredential: {
        findFirst: oauthFindFirstMock
      },
      creatorProviderSyncState: {
        upsert: creatorProviderSyncStateUpsertMock
      }
    } as unknown as PrismaClient;

    const gqlFixtureRaw = JSON.parse(
      readFileSync(join(__dirname, "fixtures", "subscribestar-hypothesis-posts-graphql.json"), "utf8")
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(gqlFixtureRaw), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const dir = await mkdtemp(join(tmpdir(), "relay-ss-sync-posts-"));

    const { app, ingestService } = createApp({
      patreon_client_id: "pat_test",
      patreon_client_secret: "pat_secret",
      relay_token_encryption_key: key,
      ...minimalPaths(dir),
      prisma: prismaStub,
      relay_db_store_creator_oauth: true,
      fetch_impl: fetchMock as unknown as typeof fetch
    });

    const runBatchSpy = vi.spyOn(ingestService, "runBatch").mockResolvedValue(stubApply);

    const creatorId = "cr_ss_integration_1";

    try {
      const res = await request(app)
        .post("/api/v1/subscribestar/creator/sync/posts")
        .set("Accept", "application/json")
        .send({ creator_id: creatorId, max_pages: 5 });

      expect(res.status).toBe(200);
      expect(res.body?.meta?.trace_id).toMatch(/^trace_/);

      expect(res.body?.data?.creator_id).toBe(creatorId);
      expect(res.body?.data?.pages_fetched).toBe(1);
      expect(res.body?.data?.batches_ingested).toBe(1);
      expect(res.body?.data?.ended_reason).toBe("no_next_page");

      expect(oauthFindFirstMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/graphql\/v1$/);

      expect(runBatchSpy).toHaveBeenCalledTimes(1);

      expect(creatorProviderSyncStateUpsertMock).toHaveBeenCalledOnce();
      const upsertArgs = creatorProviderSyncStateUpsertMock.mock.calls[0]?.[0] as {
        where: { creatorId_provider: { creatorId: string } };
      };
      expect(upsertArgs.where.creatorId_provider.creatorId).toBe(creatorId);
    } finally {
      runBatchSpy.mockRestore();
    }
  });
});
