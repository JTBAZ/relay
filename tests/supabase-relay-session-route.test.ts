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

function baseConfig(
  tempDir: string,
  prisma: PrismaClient | undefined,
  relayDbIdentity?: boolean
) {
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
    ...(prisma !== undefined ? { prisma } : {}),
    ...(relayDbIdentity !== undefined ? { relay_db_store_identity: relayDbIdentity } : {})
  };
}

describe("POST /api/v1/auth/supabase/relay-session (MT-033)", () => {
  beforeEach(() => {
    mockGetSupabaseUser.mockReset();
  });

  it("returns 400 when no access token", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-relay-sess-"));
    const { app } = createApp(baseConfig(tempDir, {} as PrismaClient, true));
    const res = await request(app).post("/api/v1/auth/supabase/relay-session").send({});
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when Supabase rejects the token", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-relay-sess-"));
    mockGetSupabaseUser.mockResolvedValue({
      ok: false,
      error: "Invalid or expired access token."
    });
    const { app } = createApp(baseConfig(tempDir, {} as PrismaClient, true));
    const res = await request(app)
      .post("/api/v1/auth/supabase/relay-session")
      .set("Authorization", "Bearer bad")
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns 503 when database is not configured", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-relay-sess-"));
    const { app } = createApp(baseConfig(tempDir, undefined));
    const res = await request(app)
      .post("/api/v1/auth/supabase/relay-session")
      .set("Authorization", "Bearer x")
      .send({});
    expect(res.status).toBe(503);
  });

  it("returns 503 when file identity store (no relay bridge)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-relay-sess-"));
    const { app } = createApp(baseConfig(tempDir, {} as PrismaClient, false));
    mockGetSupabaseUser.mockResolvedValue({
      ok: true,
      user: { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "a@b.com" }
    });
    const res = await request(app)
      .post("/api/v1/auth/supabase/relay-session")
      .set("Authorization", "Bearer good")
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.error?.message).toMatch(/Relay session bridge requires/i);
  });
});
