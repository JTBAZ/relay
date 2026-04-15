import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const mockGetSupabaseUser = vi.fn();

vi.mock("../src/lib/supabase-auth.js", () => ({
  getSupabaseUserFromAccessToken: (token: string) => mockGetSupabaseUser(token)
}));

import { createApp } from "../src/server.js";

function baseConfig(tempDir: string, prisma: PrismaClient) {
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
    prisma
  };
}

describe("POST /api/v1/auth/supabase/sync", () => {
  beforeEach(() => {
    mockGetSupabaseUser.mockReset();
  });

  it("returns 400 when no access token", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-supa-sync-"));
    const prisma = { account: { findUnique: vi.fn() } } as unknown as PrismaClient;
    const { app } = createApp(baseConfig(tempDir, prisma));

    const res = await request(app).post("/api/v1/auth/supabase/sync").send({});
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when Supabase rejects the token", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-supa-sync-"));
    mockGetSupabaseUser.mockResolvedValue({
      ok: false,
      error: "Invalid or expired access token."
    });
    const prisma = { account: { findUnique: vi.fn() } } as unknown as PrismaClient;
    const { app } = createApp(baseConfig(tempDir, prisma));

    const res = await request(app)
      .post("/api/v1/auth/supabase/sync")
      .set("Authorization", "Bearer bad")
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("AUTH_ERROR");
  });

  it("upserts Account and returns envelope on valid token", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-supa-sync-"));
    const supaId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    mockGetSupabaseUser.mockResolvedValue({
      ok: true,
      user: { id: supaId, email: "sync@example.com" }
    });

    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const create = vi.fn().mockResolvedValue({
      id: "acc_sync",
      emailNorm: "sync@example.com",
      supabaseUserId: supaId,
      passwordHash: null
    });
    const prisma = {
      account: { findUnique, update: vi.fn(), create }
    } as unknown as PrismaClient;

    const { app } = createApp(baseConfig(tempDir, prisma));

    const res = await request(app)
      .post("/api/v1/auth/supabase/sync")
      .send({ access_token: "jwt-here" });

    expect(res.status).toBe(200);
    expect(res.body.data.account_id).toBe("acc_sync");
    expect(res.body.data.supabase_user_id).toBe(supaId);
    expect(res.body.data.created).toBe(true);
    expect(mockGetSupabaseUser).toHaveBeenCalledWith("jwt-here");
  });

  it("optional creator_id creates tenant membership", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-supa-sync-"));
    const supaId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    mockGetSupabaseUser.mockResolvedValue({
      ok: true,
      user: { id: supaId, email: "m@example.com" }
    });

    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const create = vi.fn().mockResolvedValue({
      id: "acc_m",
      emailNorm: "m@example.com",
      supabaseUserId: supaId,
      passwordHash: null
    });
    const tenantUpsert = vi.fn().mockResolvedValue({ id: "tenant_row" });
    const membershipFindFirst = vi.fn().mockResolvedValue(null);
    const membershipCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      account: { findUnique, update: vi.fn(), create },
      tenant: { upsert: tenantUpsert },
      tenantMembership: {
        findFirst: membershipFindFirst,
        update: vi.fn(),
        create: membershipCreate
      }
    } as unknown as PrismaClient;

    const { app } = createApp(baseConfig(tempDir, prisma));

    const res = await request(app).post("/api/v1/auth/supabase/sync").send({
      access_token: "tok",
      creator_id: "creator_z",
      tier_ids: ["tier_a"]
    });

    expect(res.status).toBe(200);
    expect(res.body.data.membership_id).toMatch(/^tm_/);
    expect(tenantUpsert).toHaveBeenCalled();
    expect(membershipCreate).toHaveBeenCalled();
  });
});
