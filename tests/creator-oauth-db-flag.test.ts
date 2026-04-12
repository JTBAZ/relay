import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../src/server.js";

function minimalPaths(d: string) {
  return {
    credential_store_path: join(d, "patreon.json"),
    ingest_canonical_path: join(d, "canonical.json"),
    ingest_dlq_path: join(d, "dlq.json"),
    export_storage_root: join(d, "exports"),
    gallery_post_overrides_path: join(d, "gallery_overrides.json"),
    gallery_saved_filters_path: join(d, "saved_filters.json"),
    analytics_store_path: join(d, "analytics.json"),
    clone_store_path: join(d, "clone_sites.json"),
    identity_store_path: join(d, "identity.json"),
    payment_store_path: join(d, "payments.json"),
    migration_store_path: join(d, "migrations.json"),
    deploy_store_path: join(d, "deploys.json")
  };
}

describe("RELAY_DB_STORE_CREATOR_OAUTH wiring", () => {
  it("createApp throws if creator OAuth DB is on but prisma is missing", async () => {
    const d = await mkdtemp(join(tmpdir(), "relay-creator-oauth-throw-"));
    expect(() =>
      createApp({
        patreon_client_id: "c",
        patreon_client_secret: "s",
        relay_token_encryption_key: randomBytes(32).toString("base64"),
        ...minimalPaths(d),
        relay_db_store_creator_oauth: true
      })
    ).toThrow(/config\.prisma is required when any database-backed Relay store is enabled/);
  });

  it("createApp builds when relay_db_store_creator_oauth and prisma are set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-creator-oauth-app-"));
    const fakePrisma = {} as unknown as PrismaClient;
    const { app } = createApp({
      patreon_client_id: "c",
      patreon_client_secret: "s",
      relay_token_encryption_key: randomBytes(32).toString("base64"),
      ...minimalPaths(dir),
      relay_db_store_creator_oauth: true,
      prisma: fakePrisma
    });
    expect(app).toBeDefined();
  });
});
