/**
 * E2E: Patreon full (main) vs X preview media via extension attempt package route.
 */
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { crossPostMediaContentUrlPath } from "../src/extension/cross-post-package.js";
import { IdentityService } from "../src/identity/identity-service.js";
import { FileIdentityStore } from "../src/identity/identity-store.js";
import type { UserAccount } from "../src/identity/types.js";
import {
  DISTRIBUTION_MEDIA_MAIN_MOCK_ID,
  DISTRIBUTION_MEDIA_PAIR_ATTEMPT_PATREON,
  DISTRIBUTION_MEDIA_PAIR_ATTEMPT_X,
  DISTRIBUTION_MEDIA_PAIR_CREATOR_ID,
  DISTRIBUTION_MEDIA_PAIR_MEMBERSHIP_ID,
  DISTRIBUTION_MEDIA_PREVIEW_MOCK_ID,
  distributionMediaPairBaseState,
  distributionMediaPairFixturePaths,
  distributionMediaPairPrismaStub
} from "./helpers/distribution-media-pair.js";

function baseAppConfig(tempDir: string, prisma: ReturnType<typeof distributionMediaPairPrismaStub>) {
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
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
    prisma,
    relay_db_store_identity: false
  };
}

function extensionUser(): UserAccount {
  const now = new Date().toISOString();
  return {
    user_id: DISTRIBUTION_MEDIA_PAIR_MEMBERSHIP_ID,
    creator_id: DISTRIBUTION_MEDIA_PAIR_CREATOR_ID,
    email: "dist-media-pair@test.example",
    password_hash: "x",
    auth_provider: "independent",
    tier_ids: [],
    created_at: now,
    updated_at: now
  };
}

async function seedExtensionToken(tempDir: string): Promise<string> {
  const store = new FileIdentityStore(join(tempDir, "identity.json"));
  const svc = new IdentityService(store);
  await store.createUser(extensionUser());
  const session = await svc.issueExtensionSession(extensionUser(), "dist-media-pair-e2e");
  return session.token;
}

describe("distribution media pair fixtures", () => {
  it("main and preview PNGs exist and are visually distinct bytes", async () => {
    const [main, preview] = await Promise.all([
      readFile(distributionMediaPairFixturePaths.main),
      readFile(distributionMediaPairFixturePaths.preview)
    ]);
    expect(main.byteLength).toBeGreaterThan(0);
    expect(preview.byteLength).toBeGreaterThan(0);
    expect(main.equals(preview)).toBe(false);
  });
});

describe("GET /api/v1/extension/cross-post/attempts/:attempt_id (media pair)", () => {
  it("returns main media for Patreon full routing", async () => {
    const attemptUpdate = vi.fn().mockResolvedValue({});
    const prisma = distributionMediaPairPrismaStub(distributionMediaPairBaseState(), { attemptUpdate });
    const tempDir = await mkdtemp(join(tmpdir(), "relay-dist-main-"));
    const extToken = await seedExtensionToken(tempDir);
    const { app } = createApp(baseAppConfig(tempDir, prisma));

    const res = await request(app)
      .get(`/api/v1/extension/cross-post/attempts/${DISTRIBUTION_MEDIA_PAIR_ATTEMPT_PATREON}`)
      .set("Authorization", `Bearer ${extToken}`)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.data.destination).toBe("patreon");
    expect(res.body.data.attempt_id).toBe(DISTRIBUTION_MEDIA_PAIR_ATTEMPT_PATREON);
    expect(res.body.data.package.media).toEqual([
      expect.objectContaining({
        media_id: DISTRIBUTION_MEDIA_MAIN_MOCK_ID,
        mime_type: "image/png",
        content_url: crossPostMediaContentUrlPath(
          DISTRIBUTION_MEDIA_PAIR_CREATOR_ID,
          DISTRIBUTION_MEDIA_MAIN_MOCK_ID
        )
      })
    ]);
    expect(attemptUpdate).toHaveBeenCalledWith({
      where: { id: DISTRIBUTION_MEDIA_PAIR_ATTEMPT_PATREON },
      data: { status: "package_fetched" }
    });
  });

  it("returns preview media for X preview routing", async () => {
    const attemptUpdate = vi.fn().mockResolvedValue({});
    const prisma = distributionMediaPairPrismaStub(distributionMediaPairBaseState(), { attemptUpdate });
    const tempDir = await mkdtemp(join(tmpdir(), "relay-dist-preview-"));
    const extToken = await seedExtensionToken(tempDir);
    const { app } = createApp(baseAppConfig(tempDir, prisma));

    const res = await request(app)
      .get(`/api/v1/extension/cross-post/attempts/${DISTRIBUTION_MEDIA_PAIR_ATTEMPT_X}`)
      .set("Authorization", `Bearer ${extToken}`)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.data.destination).toBe("x");
    expect(res.body.data.package.media).toEqual([
      expect.objectContaining({
        media_id: DISTRIBUTION_MEDIA_PREVIEW_MOCK_ID,
        mime_type: "image/png",
        content_url: crossPostMediaContentUrlPath(
          DISTRIBUTION_MEDIA_PAIR_CREATOR_ID,
          DISTRIBUTION_MEDIA_PREVIEW_MOCK_ID
        )
      })
    ]);
    expect(res.body.data.package.media[0].media_id).not.toBe(DISTRIBUTION_MEDIA_MAIN_MOCK_ID);
    expect(attemptUpdate).toHaveBeenCalledWith({
      where: { id: DISTRIBUTION_MEDIA_PAIR_ATTEMPT_X },
      data: { status: "package_fetched" }
    });
  });

  it("returns 400 when preview routing lacks preview_media_id on plan", async () => {
    const state = distributionMediaPairBaseState();
    state.plans[0].assistantPlan = { needs_preview: true };
    const prisma = distributionMediaPairPrismaStub(state);
    const tempDir = await mkdtemp(join(tmpdir(), "relay-dist-invalid-"));
    const extToken = await seedExtensionToken(tempDir);
    const { app } = createApp(baseAppConfig(tempDir, prisma));

    const res = await request(app)
      .get(`/api/v1/extension/cross-post/attempts/${DISTRIBUTION_MEDIA_PAIR_ATTEMPT_X}`)
      .set("Authorization", `Bearer ${extToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/preview_media_id is missing/i);
  });
});
