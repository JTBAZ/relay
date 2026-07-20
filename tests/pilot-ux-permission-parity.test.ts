import { mkdtemp } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server.js";
import { evaluatePostPermission } from "../src/gallery/post-permission.js";
import type { SessionToken } from "../src/identity/types.js";
import type { CanonicalSnapshot, TierRow } from "../src/ingest/canonical-store.js";
import {
  defaultPilotUxSeedFixturePath,
  loadPilotUxSeedSpec,
  pilotUxSeededLibraryCreators,
  resolvePilotUxDevPassword,
  validatePilotUxSeedSpec,
  type PilotUxSeedSpec
} from "../src/pilot-ux/pilot-ux-seed-spec.js";
import { seedPilotUxDevAccounts } from "../src/pilot-ux/seed-pilot-ux-dev-accounts.js";
import {
  mutatePilotUxPatronEntitlement,
  mutatePilotUxPostTierGate
} from "../src/pilot-ux/pilot-ux-paywall-mutations.js";
import { tierStableId } from "../src/ingest/canonical-store-db.js";
import { prisma } from "../src/lib/db.js";
import { assemblePatronFeed } from "../src/patron/assemble-patron-feed.js";
import { canAccessPost, resolvePostAccessLevel, evaluateTierRules } from "../src/clone/tier-rules.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const fixturePath = defaultPilotUxSeedFixturePath();

const AVA_CREATOR_ID = "rcx_pilot_dev_ava";
const MILO_CREATOR_ID = "rcx_pilot_dev_milo";
const QUINN_CREATOR_ID = "rcx_pilot_dev_quinn";
const SEED_NOW = "2026-05-20T12:00:00.000Z";

const PILOT_POST_IDS = {
  avaIntro: "pilot_post_ava_intro",
  avaSupporter: "pilot_post_ava_supporter_set",
  avaStudio: "pilot_post_ava_studio_archive",
  miloSketch: "pilot_post_milo_sketch",
  miloSupporter: "pilot_post_milo_supporter_video",
  miloBackstage: "pilot_post_milo_backstage_notes",
  quinnUnsubLab: "pilot_post_quinn_unsub_lab"
} as const;

function buildPilotUxCanonicalSnapshot(spec: PilotUxSeedSpec): CanonicalSnapshot {
  const snapshot: CanonicalSnapshot = {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {},
    posts: {},
    media: {}
  };

  for (const creator of spec.creators) {
    const tierMap: Record<string, TierRow> = {};
    for (const tier of creator.tiers) {
      tierMap[tier.relayTierId] = {
        tier_id: tier.relayTierId,
        creator_id: creator.relayCreatorId,
        campaign_id: creator.campaignId,
        title: tier.title,
        amount_cents: tier.amountCents,
        upstream_updated_at: SEED_NOW,
        version_seq: 1
      };
    }
    snapshot.tiers[creator.relayCreatorId] = tierMap;
    snapshot.posts[creator.relayCreatorId] = {};
    for (const post of creator.posts) {
      snapshot.posts[creator.relayCreatorId]![post.postId] = {
        post_id: post.postId,
        creator_id: creator.relayCreatorId,
        upstream_status: "active",
        current: {
          version_seq: 1,
          upstream_revision: "pilot-seed",
          title: post.title,
          published_at: SEED_NOW,
          tag_ids: [],
          tier_ids: post.isPublic ? [] : [...post.tierIds],
          media_ids: [post.mediaId],
          ingested_at: SEED_NOW
        },
        versions: []
      };
    }
  }

  return snapshot;
}

function patronSessionForCreator(
  creatorId: string,
  entitledTierIds: string[]
): SessionToken {
  return {
    token: "pilot-ux-test",
    user_id: "patron_dev_riley",
    creator_id: creatorId,
    tier_ids: entitledTierIds,
    expires_at: "2099-01-01T00:00:00.000Z"
  };
}

function patronFeedAllowsPost(
  spec: PilotUxSeedSpec,
  creatorId: string,
  postId: string,
  entitledTierIds: string[]
): boolean {
  const creator = spec.creators.find((c) => c.relayCreatorId === creatorId);
  const post = creator?.posts.find((p) => p.postId === postId);
  if (!creator || !post) return false;
  const tierCatalog = snapshotTierCatalog(spec, creatorId);
  const tierRules = evaluateTierRules(tierCatalog);
  const postAccess = resolvePostAccessLevel(
    post.isPublic ? [] : post.tierIds,
    tierRules
  );
  return post.isPublic || canAccessPost(postAccess, entitledTierIds, tierCatalog);
}

function snapshotTierCatalog(
  spec: PilotUxSeedSpec,
  creatorId: string
): Record<string, TierRow> {
  const creator = spec.creators.find((c) => c.relayCreatorId === creatorId);
  if (!creator) return {};
  const out: Record<string, TierRow> = {};
  for (const tier of creator.tiers) {
    out[tier.relayTierId] = {
      tier_id: tier.relayTierId,
      creator_id: creatorId,
      campaign_id: creator.campaignId,
      title: tier.title,
      amount_cents: tier.amountCents,
      upstream_updated_at: SEED_NOW,
      version_seq: 1
    };
  }
  return out;
}

describe("pilot UX seed fixture (PUX-000)", () => {
  it("loads and validates pilot-ux-seed.json structure", () => {
    const raw = readFileSync(fixturePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    expect(validatePilotUxSeedSpec(parsed)).toEqual([]);
    const spec = loadPilotUxSeedSpec(fixturePath);
    expect(spec.accounts.creatorAva.legacyFileId).toBe("creator_dev_ava");
    expect(spec.accounts.creatorMilo.legacyFileId).toBe("creator_dev_milo");
    expect(spec.accounts.patronRiley.legacyFileId).toBe("patron_dev_riley");
    expect(spec.accounts.patronOnboarding.legacyFileId).toBe("patron_dev_onboarding");
    expect(spec.creators).toHaveLength(4);
    expect(spec.patron.followRelayCreatorIds).toHaveLength(3);
    expect(spec.patron.entitlements).toHaveLength(3);
    const ava = spec.creators.find((c) => c.relayCreatorId === "rcx_pilot_dev_ava");
    expect(ava?.creatorPlan).toBe("growth_engine");
  });

  it("rejects invalid creatorPlan in seed validation", () => {
    const spec = loadPilotUxSeedSpec(fixturePath);
    const bad = structuredClone(spec) as PilotUxSeedSpec;
    bad.creators[0] = { ...bad.creators[0]!, creatorPlan: "free_forever" as never };
    expect(validatePilotUxSeedSpec(bad).some((e) => e.includes("creatorPlan"))).toBe(true);
  });

  it("maps tier stable ids consistently with canonical store", () => {
    const spec = loadPilotUxSeedSpec(fixturePath);
    const ava = spec.creators.find((c) => c.relayCreatorId === "rcx_pilot_dev_ava")!;
    expect(tierStableId(ava.relayCreatorId, "patreon_tier_ava_supporter")).toBe(
      "rcx_pilot_dev_ava::patreon_tier_ava_supporter"
    );
  });
});

describe.skipIf(!hasDatabaseUrl)("pilot UX seed harness (PUX-000 DB)", () => {
  it(
    "seeds faux creators, patron follows, and entitlement snapshots idempotently",
    async () => {
    const first = await seedPilotUxDevAccounts(prisma, { fixturePath });
    expect(first.creators).toHaveLength(4);
    expect(first.counts.tiers).toBe(7);
    expect(first.counts.posts).toBe(7);
    expect(first.counts.mediaAssets).toBe(7);
    expect(first.counts.patronFollows).toBe(3);
    expect(first.counts.entitlementSnapshots).toBe(3);

    const avaCreatorId = "rcx_pilot_dev_ava";
    const miloCreatorId = "rcx_pilot_dev_milo";
    const quinnCreatorId = "rcx_pilot_dev_quinn";

    const avaAccount = await prisma.account.findFirst({
      where: { legacyFileId: "creator_dev_ava" }
    });
    expect(avaAccount?.primaryRelayCreatorId).toBe(avaCreatorId);

    const rileyMembership = await prisma.tenantMembership.findFirst({
      where: { account: { legacyFileId: "patron_dev_riley" } },
      include: { patronFollows: true, patronEntitlementSnapshots: true }
    });
    expect(rileyMembership?.patronFollows.map((f) => f.relayCreatorId).sort()).toEqual(
      [avaCreatorId, miloCreatorId, quinnCreatorId].sort()
    );

    const avaSnap = rileyMembership?.patronEntitlementSnapshots.find(
      (s) => s.relayCreatorId === avaCreatorId
    );
    expect(avaSnap?.entitledTierIds).toContain("patreon_tier_ava_supporter");
    expect(avaSnap?.entitledTierIds).not.toContain("patreon_tier_ava_studio");

    const miloSnap = rileyMembership?.patronEntitlementSnapshots.find(
      (s) => s.relayCreatorId === miloCreatorId
    );
    expect(miloSnap?.entitledTierIds).toContain("patreon_tier_milo_backstage");

    const quinnSnap = rileyMembership?.patronEntitlementSnapshots.find(
      (s) => s.relayCreatorId === quinnCreatorId
    );
    expect(quinnSnap?.entitledTierIds).toContain("patreon_tier_quinn_supporter");

    const postTiers = await prisma.postTier.count({
      where: {
        post: { creatorId: { in: [avaCreatorId, miloCreatorId, quinnCreatorId] } }
      }
    });
    expect(postTiers).toBeGreaterThan(0);

    const second = await seedPilotUxDevAccounts(prisma, { fixturePath });
    expect(second.counts.patronFollows).toBe(3);
    expect(second.counts.entitlementSnapshots).toBe(3);
    },
    60_000
  );
});

function pilotUxDbAppConfig(tempDir: string) {
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
    relay_db_store_identity: true,
    relay_db_store_canonical: true,
    relay_db_store_overrides: true
  };
}

describe.skipIf(!hasDatabaseUrl)("PUX-001 gate A — browser-ready galleries and patron follows", () => {
  it(
    "serves creator libraries with tier data and patron feed follows both creators",
    async () => {
      const spec = loadPilotUxSeedSpec(fixturePath);
      const password = resolvePilotUxDevPassword(spec);
      await seedPilotUxDevAccounts(prisma, { fixturePath });

      const avaCreatorId = "rcx_pilot_dev_ava";
      const miloCreatorId = "rcx_pilot_dev_milo";
      const tempDir = await mkdtemp(join(tmpdir(), "relay-pux-gate-a-"));
      const { app } = createApp(pilotUxDbAppConfig(tempDir));

      for (const creatorId of [avaCreatorId, miloCreatorId]) {
        const gallery = await request(app).get(
          `/api/v1/gallery/items?creator_id=${creatorId}&limit=50&display=post_primary`
        );
        expect(gallery.status).toBe(200);
        expect(gallery.body.data.items).toHaveLength(3);
        const tierGated = gallery.body.data.items.filter(
          (row: { tier_ids?: string[] }) => (row.tier_ids?.length ?? 0) > 0
        );
        expect(tierGated.length).toBeGreaterThanOrEqual(2);

        const facets = await request(app).get(`/api/v1/gallery/facets?creator_id=${creatorId}`);
        expect(facets.status).toBe(200);
        expect(facets.body.data.tiers?.length ?? 0).toBeGreaterThanOrEqual(2);
      }

      const patronEmail = spec.accounts.patronRiley.email;
      const login = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: patronEmail, password });
      expect(login.status).toBe(200);
      const token = login.body.data.token as string;

      const follows = await request(app)
        .get("/api/v1/patron/follows")
        .set("Authorization", `Bearer ${token}`);
      expect(follows.status).toBe(200);
      const followedIds = (follows.body.data.items as Array<{ relay_creator_id: string }>)
        .map((c) => c.relay_creator_id)
        .sort();
      expect(followedIds).toEqual([avaCreatorId, miloCreatorId, QUINN_CREATOR_ID].sort());

      const feed = await request(app)
        .get("/api/v1/patron/feed?limit=50")
        .set("Authorization", `Bearer ${token}`);
      expect(feed.status).toBe(200);
      expect(feed.body.data.followedCreators).toHaveLength(3);
      expect(feed.body.data.feedPosts.length).toBeGreaterThan(0);

      const creatorLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: spec.accounts.creatorAva.email, password });
      expect(creatorLogin.status).toBe(200);
      const creatorToken = creatorLogin.body.data.token as string;
      const workspace = await request(app)
        .post("/api/v1/creator/workspace")
        .set("Authorization", `Bearer ${creatorToken}`)
        .send({});
      expect(workspace.status).toBe(200);
      expect(workspace.body.data.relay_creator_id).toBe(avaCreatorId);
    },
    90_000
  );
});

describe.skipIf(!hasDatabaseUrl)("PUX-002 gate B — permission parity baseline", () => {
  it(
    "Riley feed vs creator libraries: paywalled posts match entitlement snapshots",
    async () => {
      const spec = loadPilotUxSeedSpec(fixturePath);
      const password = resolvePilotUxDevPassword(spec);
      const seeded = await seedPilotUxDevAccounts(prisma, { fixturePath });

      const avaEntitlement =
        spec.patron.entitlements.find((e) => e.relayCreatorId === AVA_CREATOR_ID)
          ?.entitledTierIds ?? [];
      const miloEntitlement =
        spec.patron.entitlements.find((e) => e.relayCreatorId === MILO_CREATOR_ID)
          ?.entitledTierIds ?? [];
      const quinnEntitlement =
        spec.patron.entitlements.find((e) => e.relayCreatorId === QUINN_CREATOR_ID)
          ?.entitledTierIds ?? [];

      const expectedPatronPostIds = (
        Object.values(PILOT_POST_IDS) as string[]
      ).filter((postId) => {
        const creatorId = postId.includes("_ava_")
          ? AVA_CREATOR_ID
          : postId.includes("_milo_")
            ? MILO_CREATOR_ID
            : QUINN_CREATOR_ID;
        const entitled =
          creatorId === AVA_CREATOR_ID
            ? avaEntitlement
            : creatorId === MILO_CREATOR_ID
              ? miloEntitlement
              : quinnEntitlement;
        return patronFeedAllowsPost(spec, creatorId, postId, entitled);
      });
      expect(expectedPatronPostIds).not.toContain(PILOT_POST_IDS.avaStudio);
      expect(expectedPatronPostIds).toContain(PILOT_POST_IDS.avaIntro);
      expect(expectedPatronPostIds).toContain(PILOT_POST_IDS.avaSupporter);
      expect(expectedPatronPostIds).toContain(PILOT_POST_IDS.miloSketch);
      expect(expectedPatronPostIds).toContain(PILOT_POST_IDS.miloBackstage);
      expect(expectedPatronPostIds).toContain(PILOT_POST_IDS.quinnUnsubLab);

      const feedBundle = await assemblePatronFeed({
        prisma,
        patronMembershipId: seeded.patron.membershipId,
        viewerEmail: spec.accounts.patronRiley.email,
        limit: 50
      });
      const feedPostIds = feedBundle.feedPosts.map((p) => p.id).sort();
      expect(feedPostIds).toEqual([...expectedPatronPostIds].sort());

      const tempDir = await mkdtemp(join(tmpdir(), "relay-pux-gate-b-"));
      const { app } = createApp(pilotUxDbAppConfig(tempDir));

      const patronLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: spec.accounts.patronRiley.email, password });
      expect(patronLogin.status).toBe(200);
      const patronToken = patronLogin.body.data.token as string;

      const feedHttp = await request(app)
        .get("/api/v1/patron/feed?limit=50")
        .set("Authorization", `Bearer ${patronToken}`);
      expect(feedHttp.status).toBe(200);
      const httpFeedIds = (feedHttp.body.data.feedPosts as Array<{ id: string }>)
        .map((p) => p.id)
        .sort();
      expect(httpFeedIds).toEqual(feedPostIds);

      const creatorGalleryCounts: Record<string, number> = {};
      for (const creator of pilotUxSeededLibraryCreators(spec)) {
        const email = spec.accounts[creator.accountKey].email;
        const login = await request(app)
          .post("/api/v1/auth/login")
          .send({ email, password });
        expect(login.status).toBe(200);
        const token = login.body.data.token as string;

        const gallery = await request(app)
          .get(
            `/api/v1/gallery/items?creator_id=${creator.relayCreatorId}&limit=50&display=post_primary`
          )
          .set("Authorization", `Bearer ${token}`);
        expect(gallery.status).toBe(200);
        creatorGalleryCounts[creator.relayCreatorId] = gallery.body.data.items.length;
        expect(gallery.body.data.items).toHaveLength(creator.posts.length);
      }

      const patronVisibleByCreator: Record<string, number> = {
        [AVA_CREATOR_ID]: feedPostIds.filter((id) => id.includes("_ava_")).length,
        [MILO_CREATOR_ID]: feedPostIds.filter((id) => id.includes("_milo_")).length
      };

      expect(creatorGalleryCounts[AVA_CREATOR_ID]).toBeGreaterThan(
        patronVisibleByCreator[AVA_CREATOR_ID]!
      );
      expect(patronVisibleByCreator[AVA_CREATOR_ID]).toBe(2);
      expect(creatorGalleryCounts[MILO_CREATOR_ID]).toBe(3);
      expect(patronVisibleByCreator[MILO_CREATOR_ID]).toBeGreaterThanOrEqual(2);

      const snapshot = buildPilotUxCanonicalSnapshot(spec);

      for (const creator of pilotUxSeededLibraryCreators(spec)) {
        const creatorSession: SessionToken = {
          token: "creator-owner",
          user_id: creator.accountKey,
          creator_id: creator.relayCreatorId,
          tier_ids: [],
          expires_at: "2099-01-01T00:00:00.000Z"
        };
        for (const post of creator.posts) {
          expect(
            evaluatePostPermission({
              snapshot,
              creatorId: creator.relayCreatorId,
              postId: post.postId,
              session: creatorSession,
              isContentOwner: true
            })
          ).toEqual({ outcome: "allow" });
        }
      }

      const avaPatronSession = patronSessionForCreator(
        AVA_CREATOR_ID,
        avaEntitlement
      );
      expect(
        evaluatePostPermission({
          snapshot,
          creatorId: AVA_CREATOR_ID,
          postId: PILOT_POST_IDS.avaStudio,
          session: avaPatronSession
        })
      ).toMatchObject({ outcome: "locked_preview" });
      expect(
        evaluatePostPermission({
          snapshot,
          creatorId: AVA_CREATOR_ID,
          postId: PILOT_POST_IDS.avaSupporter,
          session: avaPatronSession
        })
      ).toEqual({ outcome: "allow" });

      const miloPatronSession = patronSessionForCreator(
        MILO_CREATOR_ID,
        miloEntitlement
      );
      expect(
        evaluatePostPermission({
          snapshot,
          creatorId: MILO_CREATOR_ID,
          postId: PILOT_POST_IDS.miloBackstage,
          session: miloPatronSession
        })
      ).toEqual({ outcome: "allow" });
    },
    120_000
  );
});

describe.skipIf(!hasDatabaseUrl)("PUX-003 gate C — paywall mutation propagation", () => {
  async function patronFeedIds(
    patronMembershipId: string,
    viewerEmail: string
  ): Promise<string[]> {
    const bundle = await assemblePatronFeed({
      prisma,
      patronMembershipId,
      viewerEmail,
      limit: 50
    });
    return bundle.feedPosts.map((p) => p.id).sort();
  }

  async function httpPatronFeedIds(
    app: ReturnType<typeof createApp>["app"],
    patronToken: string
  ): Promise<string[]> {
    const feedHttp = await request(app)
      .get("/api/v1/patron/feed?limit=50")
      .set("Authorization", `Bearer ${patronToken}`);
    expect(feedHttp.status).toBe(200);
    return (feedHttp.body.data.feedPosts as Array<{ id: string }>)
      .map((p) => p.id)
      .sort();
  }

  it(
    "post re-tier and entitlement snapshot edits update patron feed; creators unchanged",
    async () => {
      const spec = loadPilotUxSeedSpec(fixturePath);
      const password = resolvePilotUxDevPassword(spec);
      const seeded = await seedPilotUxDevAccounts(prisma, { fixturePath });

      const avaEntitlement =
        spec.patron.entitlements.find((e) => e.relayCreatorId === AVA_CREATOR_ID)
          ?.entitledTierIds ?? [];
      const miloEntitlement =
        spec.patron.entitlements.find((e) => e.relayCreatorId === MILO_CREATOR_ID)
          ?.entitledTierIds ?? [];

      const baselineIds = await patronFeedIds(
        seeded.patron.membershipId,
        spec.accounts.patronRiley.email
      );
      expect(baselineIds).toContain(PILOT_POST_IDS.avaSupporter);
      expect(baselineIds).not.toContain(PILOT_POST_IDS.avaStudio);
      expect(baselineIds).toContain(PILOT_POST_IDS.miloBackstage);

      const tempDir = await mkdtemp(join(tmpdir(), "relay-pux-gate-c-"));
      const { app } = createApp(pilotUxDbAppConfig(tempDir));
      const patronLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: spec.accounts.patronRiley.email, password });
      expect(patronLogin.status).toBe(200);
      const patronToken = patronLogin.body.data.token as string;
      expect(await httpPatronFeedIds(app, patronToken)).toEqual(baselineIds);

      // Mutation 1: move Ava supporter post to Studio tier — patron loses access; creator unchanged.
      await mutatePilotUxPostTierGate(prisma, {
        creatorId: AVA_CREATOR_ID,
        postId: PILOT_POST_IDS.avaSupporter,
        tierIds: ["patreon_tier_ava_studio"]
      });

      const afterRetierIds = await patronFeedIds(
        seeded.patron.membershipId,
        spec.accounts.patronRiley.email
      );
      expect(afterRetierIds).not.toContain(PILOT_POST_IDS.avaSupporter);
      expect(afterRetierIds).not.toContain(PILOT_POST_IDS.avaStudio);
      expect(await httpPatronFeedIds(app, patronToken)).toEqual(afterRetierIds);

      const specAfterRetier: PilotUxSeedSpec = JSON.parse(JSON.stringify(spec));
      const avaPost = specAfterRetier.creators
        .find((c) => c.relayCreatorId === AVA_CREATOR_ID)!
        .posts.find((p) => p.postId === PILOT_POST_IDS.avaSupporter)!;
      avaPost.tierIds = ["patreon_tier_ava_studio"];
      const avaPatronSession = patronSessionForCreator(AVA_CREATOR_ID, avaEntitlement);
      expect(
        evaluatePostPermission({
          snapshot: buildPilotUxCanonicalSnapshot(specAfterRetier),
          creatorId: AVA_CREATOR_ID,
          postId: PILOT_POST_IDS.avaSupporter,
          session: avaPatronSession
        })
      ).toMatchObject({ outcome: "locked_preview" });

      const avaCreatorLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: spec.accounts.creatorAva.email, password });
      expect(avaCreatorLogin.status).toBe(200);
      const avaGallery = await request(app)
        .get(
          `/api/v1/gallery/items?creator_id=${AVA_CREATOR_ID}&limit=50&display=post_primary`
        )
        .set("Authorization", `Bearer ${avaCreatorLogin.body.data.token as string}`);
      expect(avaGallery.status).toBe(200);
      expect(avaGallery.body.data.items).toHaveLength(3);
      const avaGalleryPostIds = (avaGallery.body.data.items as Array<{ post_id: string }>).map(
        (row) => row.post_id
      );
      expect(avaGalleryPostIds).toContain(PILOT_POST_IDS.avaSupporter);

      // Mutation 2: add Studio tier to patron Ava entitlement — studio archive + re-tiered supporter visible.
      await mutatePilotUxPatronEntitlement(prisma, {
        patronMembershipId: seeded.patron.membershipId,
        relayCreatorId: AVA_CREATOR_ID,
        entitledTierIds: ["patreon_tier_ava_supporter", "patreon_tier_ava_studio"],
        campaignId: spec.creators.find((c) => c.relayCreatorId === AVA_CREATOR_ID)
          ?.patreonCampaignId
      });

      const afterStudioEntitlementIds = await patronFeedIds(
        seeded.patron.membershipId,
        spec.accounts.patronRiley.email
      );
      expect(afterStudioEntitlementIds).toContain(PILOT_POST_IDS.avaStudio);
      expect(afterStudioEntitlementIds).toContain(PILOT_POST_IDS.avaSupporter);
      expect(await httpPatronFeedIds(app, patronToken)).toEqual(afterStudioEntitlementIds);

      // Mutation 3: remove Milo backstage entitlement — patron loses backstage post; public sketch remains.
      await mutatePilotUxPatronEntitlement(prisma, {
        patronMembershipId: seeded.patron.membershipId,
        relayCreatorId: MILO_CREATOR_ID,
        entitledTierIds: [],
        campaignId: spec.creators.find((c) => c.relayCreatorId === MILO_CREATOR_ID)
          ?.patreonCampaignId
      });

      const afterMiloRevokeIds = await patronFeedIds(
        seeded.patron.membershipId,
        spec.accounts.patronRiley.email
      );
      expect(afterMiloRevokeIds).not.toContain(PILOT_POST_IDS.miloBackstage);
      expect(afterMiloRevokeIds).toContain(PILOT_POST_IDS.miloSketch);
      expect(afterMiloRevokeIds).not.toContain(PILOT_POST_IDS.miloSupporter);
      expect(await httpPatronFeedIds(app, patronToken)).toEqual(afterMiloRevokeIds);

      const miloCreatorLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: spec.accounts.creatorMilo.email, password });
      expect(miloCreatorLogin.status).toBe(200);
      const miloGallery = await request(app)
        .get(
          `/api/v1/gallery/items?creator_id=${MILO_CREATOR_ID}&limit=50&display=post_primary`
        )
        .set("Authorization", `Bearer ${miloCreatorLogin.body.data.token as string}`);
      expect(miloGallery.status).toBe(200);
      expect(miloGallery.body.data.items).toHaveLength(3);
    },
    150_000
  );
});

async function resetPilotUxFeedBaselineAfterGateC(
  spec: PilotUxSeedSpec,
  patronMembershipId: string
): Promise<void> {
  await prisma.postOverride.deleteMany({
    where: {
      creatorId: { in: [AVA_CREATOR_ID, MILO_CREATOR_ID] }
    }
  });
  await mutatePilotUxPostTierGate(prisma, {
    creatorId: AVA_CREATOR_ID,
    postId: PILOT_POST_IDS.avaSupporter,
    tierIds: ["patreon_tier_ava_supporter"]
  });
  for (const ent of spec.patron.entitlements) {
    const campaignId = spec.creators.find((c) => c.relayCreatorId === ent.relayCreatorId)
      ?.patreonCampaignId;
    await mutatePilotUxPatronEntitlement(prisma, {
      patronMembershipId,
      relayCreatorId: ent.relayCreatorId,
      entitledTierIds: [...ent.entitledTierIds],
      campaignId
    });
  }
}

describe.skipIf(!hasDatabaseUrl)("PUX-004 gate D — aggregated patron feed walkthrough", () => {
  it(
    "Riley feed: both creators, subscribed/free badges, ordering, locked posts as missed stubs",
    async () => {
      const spec = loadPilotUxSeedSpec(fixturePath);
      const password = resolvePilotUxDevPassword(spec);
      const existingPatron = await prisma.tenantMembership.findFirst({
        where: { account: { legacyFileId: spec.accounts.patronRiley.legacyFileId } }
      });
      const seeded = existingPatron
        ? { patron: { membershipId: existingPatron.id } }
        : await seedPilotUxDevAccounts(prisma, { fixturePath });
      await resetPilotUxFeedBaselineAfterGateC(spec, seeded.patron.membershipId);

      const avaEntitlement =
        spec.patron.entitlements.find((e) => e.relayCreatorId === AVA_CREATOR_ID)
          ?.entitledTierIds ?? [];
      const miloEntitlement =
        spec.patron.entitlements.find((e) => e.relayCreatorId === MILO_CREATOR_ID)
          ?.entitledTierIds ?? [];
      const quinnEntitlement =
        spec.patron.entitlements.find((e) => e.relayCreatorId === QUINN_CREATOR_ID)
          ?.entitledTierIds ?? [];

      const expectedPatronPostIds = (
        Object.values(PILOT_POST_IDS) as string[]
      ).filter((postId) => {
        const creatorId = postId.includes("_ava_")
          ? AVA_CREATOR_ID
          : postId.includes("_milo_")
            ? MILO_CREATOR_ID
            : QUINN_CREATOR_ID;
        const entitled =
          creatorId === AVA_CREATOR_ID
            ? avaEntitlement
            : creatorId === MILO_CREATOR_ID
              ? miloEntitlement
              : quinnEntitlement;
        return patronFeedAllowsPost(spec, creatorId, postId, entitled);
      });
      expect(expectedPatronPostIds).not.toContain(PILOT_POST_IDS.avaStudio);
      expect(expectedPatronPostIds).toContain(PILOT_POST_IDS.avaIntro);
      expect(expectedPatronPostIds).toContain(PILOT_POST_IDS.avaSupporter);
      expect(expectedPatronPostIds).toContain(PILOT_POST_IDS.miloSketch);
      expect(expectedPatronPostIds).toContain(PILOT_POST_IDS.miloSupporter);
      expect(expectedPatronPostIds).toContain(PILOT_POST_IDS.miloBackstage);
      expect(expectedPatronPostIds).toContain(PILOT_POST_IDS.quinnUnsubLab);

      const feedBundle = await assemblePatronFeed({
        prisma,
        patronMembershipId: seeded.patron.membershipId,
        viewerEmail: spec.accounts.patronRiley.email,
        limit: 50
      });

      expect(feedBundle.followedCreators.map((c) => c.id).sort()).toEqual(
        [AVA_CREATOR_ID, MILO_CREATOR_ID, QUINN_CREATOR_ID].sort()
      );
      expect(feedBundle.entitlement_degraded).toBe(false);

      const feedPostIds = feedBundle.feedPosts.map((p) => p.id);
      expect(feedPostIds.sort()).toEqual([...expectedPatronPostIds].sort());

      for (let i = 1; i < feedBundle.feedPosts.length; i++) {
        const prev = feedBundle.feedPosts[i - 1]!;
        const cur = feedBundle.feedPosts[i]!;
        const prevT = new Date(prev.publishedAt).getTime();
        const curT = new Date(cur.publishedAt).getTime();
        expect(prevT >= curT).toBe(true);
        if (prevT === curT) {
          expect(prev.id >= cur.id).toBe(true);
        }
      }

      for (const post of feedBundle.feedPosts) {
        expect(post.feed_item_source).toBe("subscribed");
        expect(post.kind).toBe("followed");
        expect(post.creator.isFollowed).toBe(true);
      }

      const avaIntro = feedBundle.feedPosts.find((p) => p.id === PILOT_POST_IDS.avaIntro)!;
      expect(avaIntro.tierLabel).toBe("Free");
      const avaSupporter = feedBundle.feedPosts.find(
        (p) => p.id === PILOT_POST_IDS.avaSupporter
      )!;
      expect(avaSupporter.tierLabel).toBe("Supporter");
      const miloSketch = feedBundle.feedPosts.find((p) => p.id === PILOT_POST_IDS.miloSketch)!;
      expect(miloSketch.tierLabel).toBe("Free");
      const miloBackstage = feedBundle.feedPosts.find(
        (p) => p.id === PILOT_POST_IDS.miloBackstage
      )!;
      expect(miloBackstage.tierLabel).toBe("Backstage");

      const avaCreator = feedBundle.followedCreators.find((c) => c.id === AVA_CREATOR_ID)!;
      const miloCreator = feedBundle.followedCreators.find((c) => c.id === MILO_CREATOR_ID)!;
      expect(avaCreator.patronTierLabel).toBe("Supporter");
      expect(miloCreator.patronTierLabel).toBe("Backstage");
      expect(avaSupporter.creator.patronTierLabel).toBe("Supporter");
      expect(miloBackstage.creator.patronTierLabel).toBe("Backstage");
      expect(feedBundle.lockedPosts.map((p) => p.id)).toEqual([PILOT_POST_IDS.avaStudio]);
      expect(feedBundle.lockedPosts[0]).toEqual(
        expect.objectContaining({
          // title is seeded post content and may vary across seed runs; assert on stable fields.
          mediaType: "photo",
          tierLabel: "Studio"
        })
      );
      expect(feedBundle.lockedPosts[0]).not.toHaveProperty("coverImageUrl");
      expect(feedBundle.lockedPosts[0]).not.toHaveProperty("highResImageUrl");
      expect(feedBundle.lockedPosts[0]).not.toHaveProperty("description");

      const tempDir = await mkdtemp(join(tmpdir(), "relay-pux-gate-d-"));
      const { app } = createApp(pilotUxDbAppConfig(tempDir));

      const patronLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: spec.accounts.patronRiley.email, password });
      expect(patronLogin.status).toBe(200);
      const patronToken = patronLogin.body.data.token as string;

      const feedHttp = await request(app)
        .get("/api/v1/patron/feed?limit=50")
        .set("Authorization", `Bearer ${patronToken}`);
      expect(feedHttp.status).toBe(200);
      expect(feedHttp.body.data.followedCreators).toHaveLength(3);
      const httpIds = (feedHttp.body.data.feedPosts as Array<{ id: string }>).map((p) => p.id);
      expect(httpIds.sort()).toEqual(feedPostIds.sort());
      expect((feedHttp.body.data.lockedPosts as Array<{ id: string }>).map((p) => p.id)).toEqual([
        PILOT_POST_IDS.avaStudio
      ]);

      expect(feedPostIds).not.toContain(PILOT_POST_IDS.avaStudio);

      const snapshot = buildPilotUxCanonicalSnapshot(spec);
      const avaPatronSession = patronSessionForCreator(AVA_CREATOR_ID, avaEntitlement);
      expect(
        evaluatePostPermission({
          snapshot,
          creatorId: AVA_CREATOR_ID,
          postId: PILOT_POST_IDS.avaStudio,
          session: avaPatronSession
        })
      ).toMatchObject({ outcome: "locked_preview" });
      expect(
        evaluatePostPermission({
          snapshot,
          creatorId: AVA_CREATOR_ID,
          postId: PILOT_POST_IDS.avaSupporter,
          session: avaPatronSession
        })
      ).toEqual({ outcome: "allow" });
    },
    120_000
  );
});

type PilotGalleryRow = {
  post_id: string;
  tier_ids: string[];
  visibility: string;
  title: string;
};

function tierTitleMapFromFacets(facets: {
  tiers?: Array<{ tier_id: string; title: string }>;
}): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tier of facets.tiers ?? []) {
    map[tier.tier_id] = tier.title;
  }
  return map;
}

function accessLabelForRow(
  row: PilotGalleryRow,
  tierTitleById: Record<string, string>
): string {
  if (row.tier_ids.length === 0) return "Free";
  return row.tier_ids
    .map((id) => tierTitleById[id]?.trim() || id.replace(/^patreon_tier_/, ""))
    .join(", ");
}

describe.skipIf(!hasDatabaseUrl)("PUX-005 gate E — creator library permission checklist", () => {
  it(
    "Ava + Milo galleries: 3 posts, tier labels, visibility override preserves tier gate",
    async () => {
      const spec = loadPilotUxSeedSpec(fixturePath);
      const password = resolvePilotUxDevPassword(spec);
      const existingPatron = await prisma.tenantMembership.findFirst({
        where: { account: { legacyFileId: spec.accounts.patronRiley.legacyFileId } }
      });
      const seeded = existingPatron
        ? { patron: { membershipId: existingPatron.id } }
        : await seedPilotUxDevAccounts(prisma, { fixturePath });
      await resetPilotUxFeedBaselineAfterGateC(spec, seeded.patron.membershipId);
      await seedPilotUxDevAccounts(prisma, { fixturePath });

      const tempDir = await mkdtemp(join(tmpdir(), "relay-pux-gate-e-"));
      const { app } = createApp(pilotUxDbAppConfig(tempDir));
      const snapshot = buildPilotUxCanonicalSnapshot(spec);

      const expectedAccessByPost: Record<string, string> = {
        [PILOT_POST_IDS.avaIntro]: "Free",
        [PILOT_POST_IDS.avaSupporter]: "Supporter",
        [PILOT_POST_IDS.avaStudio]: "Studio",
        [PILOT_POST_IDS.miloSketch]: "Free",
        [PILOT_POST_IDS.miloSupporter]: "Supporter",
        [PILOT_POST_IDS.miloBackstage]: "Backstage",
        [PILOT_POST_IDS.quinnUnsubLab]: "Supporter"
      };

      for (const creator of pilotUxSeededLibraryCreators(spec)) {
        const email = spec.accounts[creator.accountKey].email;
        const login = await request(app)
          .post("/api/v1/auth/login")
          .send({ email, password });
        expect(login.status).toBe(200);
        const token = login.body.data.token as string;

        const facetsRes = await request(app).get(
          `/api/v1/gallery/facets?creator_id=${creator.relayCreatorId}`
        );
        expect(facetsRes.status).toBe(200);
        const tierTitleById = tierTitleMapFromFacets(facetsRes.body.data);
        // Quinn only has 1 tier; Ava and Milo have 2+. Check ≥ 1 universally.
        expect(Object.keys(tierTitleById).length).toBeGreaterThanOrEqual(1);

        const gallery = await request(app)
          .get(
            `/api/v1/gallery/items?creator_id=${creator.relayCreatorId}&limit=50&display=post_primary`
          )
          .set("Authorization", `Bearer ${token}`);
        expect(gallery.status).toBe(200);
        const rows = gallery.body.data.items as PilotGalleryRow[];
        expect(rows).toHaveLength(creator.posts.length);

        const postIds = rows.map((row) => row.post_id).sort();
        expect(postIds).toEqual(creator.posts.map((p) => p.postId).sort());

        for (const row of rows) {
          expect(accessLabelForRow(row, tierTitleById)).toBe(
            expectedAccessByPost[row.post_id]
          );
          expect(row.visibility).toBe("visible");
        }

        const hideTarget =
          creator.relayCreatorId === AVA_CREATOR_ID
            ? PILOT_POST_IDS.avaSupporter
            : creator.relayCreatorId === MILO_CREATOR_ID
              ? PILOT_POST_IDS.miloBackstage
              : PILOT_POST_IDS.quinnUnsubLab;
        const beforeHide = rows.find((row) => row.post_id === hideTarget)!;
        expect(beforeHide.tier_ids.length).toBeGreaterThan(0);

        const visibility = await request(app)
          .post("/api/v1/gallery/visibility")
          .set("Authorization", `Bearer ${token}`)
          .send({
            creator_id: creator.relayCreatorId,
            post_ids: [hideTarget],
            visibility: "hidden"
          });
        expect(visibility.status).toBe(200);

        const afterGallery = await request(app)
          .get(
            `/api/v1/gallery/items?creator_id=${creator.relayCreatorId}&limit=50&display=post_primary`
          )
          .set("Authorization", `Bearer ${token}`);
        expect(afterGallery.status).toBe(200);
        const afterRows = afterGallery.body.data.items as PilotGalleryRow[];
        const hiddenRow = afterRows.find((row) => row.post_id === hideTarget)!;
        expect(hiddenRow.visibility).toBe("hidden");
        expect(hiddenRow.tier_ids).toEqual(beforeHide.tier_ids);

        const avaEntitlement =
          spec.patron.entitlements.find((e) => e.relayCreatorId === AVA_CREATOR_ID)
            ?.entitledTierIds ?? [];
        const avaPatronSession = patronSessionForCreator(AVA_CREATOR_ID, avaEntitlement);
        expect(
          evaluatePostPermission({
            snapshot,
            creatorId: AVA_CREATOR_ID,
            postId: PILOT_POST_IDS.avaStudio,
            session: avaPatronSession
          })
        ).toMatchObject({ outcome: "locked_preview" });

        await request(app)
          .post("/api/v1/gallery/visibility")
          .set("Authorization", `Bearer ${token}`)
          .send({
            creator_id: creator.relayCreatorId,
            post_ids: [hideTarget],
            visibility: "visible"
          });
      }
    },
    120_000
  );
});

describe.skipIf(!hasDatabaseUrl)("PUX-006 gate F — hidden post patron exclusion", () => {
  async function patronFeedIds(
    patronMembershipId: string,
    viewerEmail: string
  ): Promise<string[]> {
    const bundle = await assemblePatronFeed({
      prisma,
      patronMembershipId,
      viewerEmail,
      limit: 50
    });
    return bundle.feedPosts.map((p) => p.id).sort();
  }

  async function httpPatronFeedIds(
    app: ReturnType<typeof createApp>["app"],
    patronToken: string
  ): Promise<string[]> {
    const feedHttp = await request(app)
      .get("/api/v1/patron/feed?limit=50")
      .set("Authorization", `Bearer ${patronToken}`);
    expect(feedHttp.status).toBe(200);
    return (feedHttp.body.data.feedPosts as Array<{ id: string }>)
      .map((p) => p.id)
      .sort();
  }

  it(
    "creator-hidden entitled post absent from Riley feed, post-detail, and permission",
    async () => {
      const spec = loadPilotUxSeedSpec(fixturePath);
      const password = resolvePilotUxDevPassword(spec);
      const existingPatron = await prisma.tenantMembership.findFirst({
        where: { account: { legacyFileId: spec.accounts.patronRiley.legacyFileId } }
      });
      const seeded = existingPatron
        ? { patron: { membershipId: existingPatron.id } }
        : await seedPilotUxDevAccounts(prisma, { fixturePath });
      await resetPilotUxFeedBaselineAfterGateC(spec, seeded.patron.membershipId);
      await seedPilotUxDevAccounts(prisma, { fixturePath });

      const avaEntitlement =
        spec.patron.entitlements.find((e) => e.relayCreatorId === AVA_CREATOR_ID)
          ?.entitledTierIds ?? [];

      const baselineIds = await patronFeedIds(
        seeded.patron.membershipId,
        spec.accounts.patronRiley.email
      );
      expect(baselineIds).toContain(PILOT_POST_IDS.avaSupporter);

      const tempDir = await mkdtemp(join(tmpdir(), "relay-pux-gate-f-"));
      const { app } = createApp(pilotUxDbAppConfig(tempDir));

      const avaLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: spec.accounts.creatorAva.email, password });
      expect(avaLogin.status).toBe(200);
      const avaToken = avaLogin.body.data.token as string;

      const hideRes = await request(app)
        .post("/api/v1/gallery/visibility")
        .set("Authorization", `Bearer ${avaToken}`)
        .send({
          creator_id: AVA_CREATOR_ID,
          post_ids: [PILOT_POST_IDS.avaSupporter],
          visibility: "hidden"
        });
      expect(hideRes.status).toBe(200);

      const afterHideIds = await patronFeedIds(
        seeded.patron.membershipId,
        spec.accounts.patronRiley.email
      );
      expect(afterHideIds).not.toContain(PILOT_POST_IDS.avaSupporter);
      expect(afterHideIds).toContain(PILOT_POST_IDS.avaIntro);

      const patronLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: spec.accounts.patronRiley.email, password });
      expect(patronLogin.status).toBe(200);
      const patronToken = patronLogin.body.data.token as string;
      expect(await httpPatronFeedIds(app, patronToken)).toEqual(afterHideIds);

      const visitorGallery = await request(app)
        .get(
          `/api/v1/gallery/items?creator_id=${AVA_CREATOR_ID}&visitor=true&display=post_primary&limit=50`
        )
        .set("Authorization", `Bearer ${patronToken}`);
      expect(visitorGallery.status).toBe(200);
      const visitorPostIds = (
        visitorGallery.body.data.items as Array<{ post_id: string }>
      ).map((row) => row.post_id);
      expect(visitorPostIds).not.toContain(PILOT_POST_IDS.avaSupporter);
      expect(visitorPostIds).toContain(PILOT_POST_IDS.avaIntro);

      const postDetail = await request(app)
        .get(
          `/api/v1/gallery/post-detail?creator_id=${AVA_CREATOR_ID}&post_id=${PILOT_POST_IDS.avaSupporter}&visitor=true`
        )
        .set("Authorization", `Bearer ${patronToken}`);
      expect(postDetail.status).toBe(404);

      const permission = await request(app)
        .get(
          `/api/v1/patron/permission/post?creator_id=${AVA_CREATOR_ID}&post_id=${PILOT_POST_IDS.avaSupporter}`
        )
        .set("Authorization", `Bearer ${patronToken}`);
      expect(permission.status).toBe(200);
      expect(permission.body.data).toEqual({
        outcome: "deny",
        reason: "Post hidden by creator."
      });

      const avaPatronSession = patronSessionForCreator(AVA_CREATOR_ID, avaEntitlement);
      expect(
        evaluatePostPermission({
          snapshot: buildPilotUxCanonicalSnapshot(spec),
          creatorId: AVA_CREATOR_ID,
          postId: PILOT_POST_IDS.avaSupporter,
          session: avaPatronSession,
          relayPostVisibility: "hidden"
        })
      ).toEqual({ outcome: "deny", reason: "Post hidden by creator." });

      const avaCreatorGallery = await request(app)
        .get(
          `/api/v1/gallery/items?creator_id=${AVA_CREATOR_ID}&limit=50&display=post_primary`
        )
        .set("Authorization", `Bearer ${avaToken}`);
      expect(avaCreatorGallery.status).toBe(200);
      const creatorRows = avaCreatorGallery.body.data.items as PilotGalleryRow[];
      expect(creatorRows).toHaveLength(3);
      expect(
        creatorRows.find((row) => row.post_id === PILOT_POST_IDS.avaSupporter)?.visibility
      ).toBe("hidden");

      await request(app)
        .post("/api/v1/gallery/visibility")
        .set("Authorization", `Bearer ${avaToken}`)
        .send({
          creator_id: AVA_CREATOR_ID,
          post_ids: [PILOT_POST_IDS.avaSupporter],
          visibility: "visible"
        });
    },
    120_000
  );
});
