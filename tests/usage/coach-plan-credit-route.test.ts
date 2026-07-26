import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server.js";
import {
  COACH_PLAN_CREDIT_API_FIXTURES,
  COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE
} from "../../src/usage/fixtures/coach-plan-credit-api.js";

function fileIdentityApp(tempDir: string) {
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
  });
}

describe("creator coach-plan-credits route", () => {
  const prevEnabled = process.env.RELAY_GOAL_CYCLE_ENABLED;

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    else process.env.RELAY_GOAL_CYCLE_ENABLED = prevEnabled;
  });

  it("returns 404 when feature flag is off", async () => {
    delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    const tempDir = await mkdtemp(join(tmpdir(), "relay-cpc-flag-"));
    const { app } = fileIdentityApp(tempDir);
    const res = await request(app).get("/api/v1/creator/coach-plan-credits");
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe("NOT_FOUND");
  });

  it("returns 503 when enabled but DB is not configured", async () => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    const tempDir = await mkdtemp(join(tmpdir(), "relay-cpc-nodb-"));
    const { app } = fileIdentityApp(tempDir);
    const res = await request(app).get("/api/v1/creator/coach-plan-credits");
    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("exposes no-credit messaging fixtures without top-up CTA", () => {
    expect(COACH_PLAN_CREDIT_API_FIXTURES.no_credit_message).toEqual(
      COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE
    );
    expect(COACH_PLAN_NO_CREDIT_MESSAGE_FIXTURE.topup_cta).toBe(false);
    expect(COACH_PLAN_CREDIT_API_FIXTURES.status_zero.topups_available).toBe(false);
  });
});
