import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../src/server.js";
import { backfillIdentityFromFile } from "../src/identity/backfill-identity-from-file.js";
import type { IdentityStoreRoot } from "../src/identity/types.js";

describe("backfillIdentityFromFile", () => {
  it("upserts each patron user and session (mocked prisma transaction)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-bf-"));
    const filePath = join(dir, "identity.json");
    const root: IdentityStoreRoot = {
      users: {
        u_one: {
          user_id: "u_one",
          creator_id: "cr_mock",
          email: "a@test.local",
          password_hash: "h",
          auth_provider: "independent",
          tier_ids: ["t1"],
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z"
        }
      },
      sessions: {
        sess_mock: {
          token: "sess_mock",
          user_id: "u_one",
          creator_id: "cr_mock",
          tier_ids: ["t1"],
          expires_at: "2099-01-01T00:00:00.000Z"
        }
      }
    };
    await writeFile(filePath, JSON.stringify(root, null, 2), "utf8");

    const tenantUpsert = vi.fn().mockResolvedValue({ id: "tenant1" });
    const accountFindFirst = vi.fn().mockResolvedValue(null);
    const accountCreate = vi.fn().mockResolvedValue({ id: "acc1" });
    const tenantMembershipUpsert = vi.fn().mockResolvedValue({});
    const sessionUpsert = vi.fn().mockResolvedValue({});
    const tx = {
      tenant: { upsert: tenantUpsert },
      account: { findFirst: accountFindFirst, create: accountCreate },
      tenantMembership: { upsert: tenantMembershipUpsert },
      session: { upsert: sessionUpsert }
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => {
        await fn(tx);
      })
    } as unknown as PrismaClient;

    const result = await backfillIdentityFromFile({ prisma, filePath });
    expect(result.usersUpserted).toBe(1);
    expect(result.sessionsUpserted).toBe(1);
    expect(tenantUpsert).toHaveBeenCalled();
    expect(accountFindFirst).toHaveBeenCalled();
    expect(accountCreate).toHaveBeenCalled();
    expect(tenantMembershipUpsert).toHaveBeenCalled();
    expect(sessionUpsert).toHaveBeenCalled();
  });
});

describe("RELAY_DB_STORE_IDENTITY wiring", () => {
  it("createApp throws if DB identity is on but prisma is missing", async () => {
    const d = await mkdtemp(join(tmpdir(), "relay-throw-"));
    expect(() =>
      createApp({
        patreon_client_id: "c",
        patreon_client_secret: "s",
        relay_token_encryption_key: randomBytes(32).toString("base64"),
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
        deploy_store_path: join(d, "deploys.json"),
        relay_db_store_identity: true
      })
    ).toThrow(/config\.prisma is required when any database-backed Relay store is enabled/);
  });

  it("createApp builds when relay_db_store_identity and prisma are set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-id-app-"));
    const fakePrisma = {
      tenantMembership: { findMany: async () => [] }
    } as unknown as PrismaClient;
    const { app } = createApp({
      patreon_client_id: "c",
      patreon_client_secret: "s",
      relay_token_encryption_key: randomBytes(32).toString("base64"),
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
      deploy_store_path: join(dir, "deploys.json"),
      relay_db_store_identity: true,
      prisma: fakePrisma,
      fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
    });
    expect(app).toBeDefined();
  });
});
