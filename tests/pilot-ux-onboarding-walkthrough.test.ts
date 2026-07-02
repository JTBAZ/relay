import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { PublicSlugSource } from "@prisma/client";
import { createApp } from "../src/server.js";
import { FileExportIndex } from "../src/export/export-index.js";
import {
  PILOT_UX_ONBOARDING_LEGACY_FILE_ID,
  PILOT_UX_ONBOARDING_PATREON_CAMPAIGN_ID,
  PILOT_UX_ONBOARDING_PUBLIC_SLUG,
  PILOT_UX_ONBOARDING_RELAY_CREATOR_ID,
  PILOT_UX_PATRON_ONBOARDING_LEGACY_FILE_ID,
  PILOT_UX_PATRON_ONBOARDING_HANDLE,
  PilotUxWalkthroughForbiddenError,
  resetPilotUxPatronOnboardingWalkthrough,
  resetPilotUxOnboardingWalkthrough,
  pilotUxOnboardingWalkthroughPatronTierSummary,
  simulatePilotUxPatreonConnect,
  simulatePilotUxMediaImport,
  PILOT_UX_ONBOARDING_WALKTHROUGH_MEDIA_POSTS
} from "../src/pilot-ux/pilot-ux-onboarding-walkthrough.js";
import { loadPilotUxSeedSpec, validatePilotUxSeedSpec } from "../src/pilot-ux/pilot-ux-seed-spec.js";
import { readFileSync } from "node:fs";
import { join as pathJoin } from "node:path";

const fixturePath = pathJoin(process.cwd(), "tests/fixtures/pilot-ux-seed.json");

describe("pilot UX onboarding walkthrough fixture", () => {
  it("includes onboarding walkthrough account and creator", () => {
    const parsed = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
    expect(validatePilotUxSeedSpec(parsed)).toEqual([]);
    const spec = loadPilotUxSeedSpec(fixturePath);
    expect(spec.accounts.creatorOnboarding.legacyFileId).toBe(
      PILOT_UX_ONBOARDING_LEGACY_FILE_ID
    );
    const onboarding = spec.creators.find(
      (c) => c.relayCreatorId === PILOT_UX_ONBOARDING_RELAY_CREATOR_ID
    );
    expect(onboarding?.onboardingWalkthrough).toBe(true);
    expect(onboarding?.posts).toEqual([]);
    expect(onboarding?.tiers).toHaveLength(2);
    expect(spec.accounts.patronOnboarding.legacyFileId).toBe(
      PILOT_UX_PATRON_ONBOARDING_LEGACY_FILE_ID
    );
    expect(spec.accounts.patronOnboarding.handle).toBe(PILOT_UX_PATRON_ONBOARDING_HANDLE);
  });
});

describe("pilotUxOnboardingWalkthroughPatronTierSummary", () => {
  it("returns stable faux patron counts for step 4 UX", () => {
    const summary = pilotUxOnboardingWalkthroughPatronTierSummary();
    expect(summary.total_patrons).toBe(127);
    expect(summary.tiers).toHaveLength(2);
    expect(summary.tiers[0]?.patron_count).toBe(89);
    expect(summary.tiers[1]?.patron_count).toBe(38);
  });
});

describe("resetPilotUxOnboardingWalkthrough", () => {
  it("rejects non-walkthrough creator ids", async () => {
    await expect(
      resetPilotUxOnboardingWalkthrough({} as never, "rcx_other")
    ).rejects.toBeInstanceOf(PilotUxWalkthroughForbiddenError);
  });
});

describe("simulatePilotUxPatreonConnect", () => {
  it("rejects non-walkthrough creator ids", async () => {
    await expect(
      simulatePilotUxPatreonConnect({} as never, "rcx_other")
    ).rejects.toBeInstanceOf(PilotUxWalkthroughForbiddenError);
  });

  it("sets patreon campaign id, faux tiers, profile snapshot, and bumps onboarding", async () => {
    const update = vi.fn().mockResolvedValue({});
    const create = vi.fn().mockResolvedValue({});
    const upsert = vi.fn().mockResolvedValue({});
    const findFirst = vi
      .fn()
      .mockResolvedValue({
        id: "user-1",
        creatorProfile: { id: "prof-1", displayName: null, avatarUrl: null }
      });
    const prisma = {
      user: { findFirst },
      creatorProfile: { update },
      campaign: { upsert },
      tier: { upsert },
      creatorOnboardingState: {
        findUnique: vi.fn().mockResolvedValue(null),
        create,
        update: vi.fn()
      }
    } as never;

    await simulatePilotUxPatreonConnect(prisma, PILOT_UX_ONBOARDING_RELAY_CREATOR_ID);

    expect(upsert).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: "prof-1" },
      data: {
        patreonCampaignId: PILOT_UX_ONBOARDING_PATREON_CAMPAIGN_ID,
        displayName: "Pilot UX — Onboarding walkthrough",
        avatarUrl: "/placeholder-user.jpg"
      }
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creatorId: PILOT_UX_ONBOARDING_RELAY_CREATOR_ID,
          step: "import_started"
        })
      })
    );
  });
});

describe("simulatePilotUxMediaImport", () => {
  it("rejects non-walkthrough creator ids", async () => {
    const exportIndex = new FileExportIndex("/tmp/exports");
    await expect(
      simulatePilotUxMediaImport({} as never, exportIndex, "rcx_other")
    ).rejects.toBeInstanceOf(PilotUxWalkthroughForbiddenError);
  });

  it("seeds walkthrough posts, export index, and sync health", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-pux-media-"));
    const exportIndex = new FileExportIndex(join(tempDir, "exports"));
    const upsert = vi.fn().mockResolvedValue({});
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const syncUpsert = vi.fn().mockResolvedValue({});
    const onboardingFind = vi.fn().mockResolvedValue(null);
    const onboardingCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      campaign: { upsert },
      tier: { upsert },
      post: { upsert },
      postVersion: { upsert },
      postTier: { deleteMany, createMany },
      mediaAsset: { upsert },
      creatorSyncState: { upsert: syncUpsert, findUnique: vi.fn().mockResolvedValue(null) },
      creatorOnboardingState: {
        findUnique: onboardingFind,
        create: onboardingCreate,
        update: vi.fn()
      }
    } as never;

    const result = await simulatePilotUxMediaImport(
      prisma,
      exportIndex,
      PILOT_UX_ONBOARDING_RELAY_CREATOR_ID
    );

    expect(result.posts_written).toBe(PILOT_UX_ONBOARDING_WALKTHROUGH_MEDIA_POSTS.length);
    expect(result.export_media_count).toBe(PILOT_UX_ONBOARDING_WALKTHROUGH_MEDIA_POSTS.length);
    expect(result.media_ids).toHaveLength(PILOT_UX_ONBOARDING_WALKTHROUGH_MEDIA_POSTS.length);
    expect(upsert).toHaveBeenCalled();
    expect(syncUpsert).toHaveBeenCalled();

    const index = await exportIndex.load(PILOT_UX_ONBOARDING_RELAY_CREATOR_ID);
    expect(Object.keys(index.media ?? {})).toHaveLength(
      PILOT_UX_ONBOARDING_WALKTHROUGH_MEDIA_POSTS.length
    );
  });
});

describe("pilot UX walkthrough dev routes", () => {
  it("404 when dev API disabled in production", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.RELAY_ALLOW_PILOT_UX_DEV_API;
    delete process.env.RELAY_ALLOW_PILOT_UX_SEED;
    try {
      const tempDir = await mkdtemp(join(tmpdir(), "relay-pux-wt-"));
      const { app } = createApp({
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
      const res = await request(app)
        .post("/api/v1/pilot-ux/dev/onboarding-walkthrough/reset")
        .send({});
      expect(res.status).toBe(404);
      const patronRes = await request(app)
        .post("/api/v1/pilot-ux/dev/patron-onboarding/reset")
        .send({});
      expect(patronRes.status).toBe(404);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe("resetPilotUxOnboardingWalkthrough (mocked prisma)", () => {
  it("clears profile connect fields and rewinds onboarding step", async () => {
    const profileUpdate = vi.fn().mockResolvedValue({});
    const providerDelete = vi.fn().mockResolvedValue({ count: 0 });
    const onboardingUpsert = vi.fn().mockResolvedValue({});
    const syncDelete = vi.fn().mockResolvedValue({ count: 0 });
    const providerSyncDelete = vi.fn().mockResolvedValue({ count: 0 });

    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: "user-1",
          creatorProfile: { id: "prof-1" }
        })
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          creatorProfile: { update: profileUpdate },
          providerAccount: { deleteMany: providerDelete },
          creatorOnboardingState: { upsert: onboardingUpsert },
          creatorSyncState: { deleteMany: syncDelete },
          creatorProviderSyncState: { deleteMany: providerSyncDelete }
        })
      )
    } as never;

    await resetPilotUxOnboardingWalkthrough(prisma, PILOT_UX_ONBOARDING_RELAY_CREATOR_ID);

    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: "prof-1" },
      data: expect.objectContaining({
        displayName: null,
        patreonCampaignId: null,
        slugSource: PublicSlugSource.allocated,
        publicSlug: PILOT_UX_ONBOARDING_PUBLIC_SLUG
      })
    });
    expect(onboardingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { creatorId: PILOT_UX_ONBOARDING_RELAY_CREATOR_ID },
        update: expect.objectContaining({ step: "connected" })
      })
    );
  });
});

describe("resetPilotUxPatronOnboardingWalkthrough (mocked prisma)", () => {
  it("clears patron OAuth/follows/snapshots and restores profile defaults", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const accountUpdate = vi.fn().mockResolvedValue({});
    const membershipUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const profileUpsert = vi.fn().mockResolvedValue({});
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          patronOAuthCredential: { deleteMany },
          account: { update: accountUpdate },
          tenantMembership: { updateMany: membershipUpdateMany },
          patronFollow: { deleteMany },
          patronFollowSeed: { deleteMany },
          patronEntitlementSnapshot: { deleteMany },
          notificationDigestRun: { deleteMany },
          patronProfile: { upsert: profileUpsert }
        })
      )
    } as never;

    await resetPilotUxPatronOnboardingWalkthrough(prisma, {
      accountId: "acct-1",
      platformMembershipId: "tm-platform",
      patronMembershipIds: ["tm-platform", "tm-creator"]
    });

    expect(deleteMany).toHaveBeenCalledWith({ where: { accountId: "acct-1" } });
    expect(accountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acct-1" }
      })
    );
    expect(membershipUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["tm-platform", "tm-creator"] }
        }),
        data: { tierIds: [] }
      })
    );
    expect(profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantMembershipId: "tm-platform" },
        update: expect.objectContaining({
          handle: PILOT_UX_PATRON_ONBOARDING_HANDLE,
          onboardingStep: 0
        })
      })
    );
  });
});
