import { randomBytes, randomUUID } from "node:crypto";
import { EntitlementSource, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbIdentityStore } from "../src/identity/identity-store-db.js";
import { IdentityService } from "../src/identity/identity-service.js";
import { getPlatformRelayCreatorId } from "../src/identity/platform-tenant.js";
import { upsertPatronEntitlementSnapshot, upsertPlatformPatronEntitlementProjection, upsertPatronProviderEntitlements } from "../src/identity/patron-entitlement-snapshot.js";
import { unlinkPatreonAccount } from "../src/identity/patreon-identity-mutation.js";
import { getPatronOAuthCredentialSnapshot, upsertPatronOAuthCredential } from "../src/auth/patron-oauth-credential-store.js";
import { getPatronSubscribestarOAuthCredentialSnapshot, upsertPatronSubscribestarOAuthCredential } from "../src/auth/patron-subscribestar-oauth-credential-store.js";
import { syncSubscribeStarPatronEntitlements } from "../src/subscribestar/subscribestar-patron-entitlement-sync.js";
import { refreshPatronEntitlementSnapshotFromPatreon } from "../src/patron/patron-entitlement-refresh.js";
import { executeDeletion } from "../src/patron/account-deletion-service.js";
import { TokenEncryption } from "../src/lib/crypto.js";
import { memberFixture } from "./helpers/patreon-members.js";
import { acceptMember } from "../src/patreon/member-reconciliation.js";
import { deferred } from "./helpers/patreon-targeted-post.js";
import { seedPilotUxDevAccounts } from "../src/pilot-ux/seed-pilot-ux-dev-accounts.js";
import { defaultPilotUxSeedFixturePath, loadPilotUxSeedSpec } from "../src/pilot-ux/pilot-ux-seed-spec.js";
import { assemblePatronFeed } from "../src/patron/assemble-patron-feed.js";
import { assemblePatronSearch } from "../src/patron/patron-search-service.js";
import { listPatronFollowsForMembership } from "../src/patron/patron-follow-service.js";
import { exchangePatreonPatronOAuth } from "../src/patreon/patreon-patron-oauth.js";
import { canAccessPost } from "../src/clone/tier-rules.js";

const target = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!target)("PS10 same-account platform projections", () => {
  let db: PrismaClient, other: PrismaClient;
  beforeAll(async () => {
    const url = new URL(target!);
    if (url.hostname !== "127.0.0.1" || url.port !== "49952" || url.search || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error("Disposable private database required");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) });
    other = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) });
    await Promise.all([db.$connect(), other.$connect()]);
  });
  afterAll(async () => { await Promise.all([db?.$disconnect(), other?.$disconnect()]); });

  async function fixture(tiers?: string[]) {
    const key = randomUUID(), creator = `projection_${key}`, uid = `provider_${key}`;
    const campaignId = String(Math.floor(Math.random() * 1e12)), paid = `paid_${key}`;
    const tenant = await db.tenant.create({ data: { relayCreatorId: creator } });
    const platform = await db.tenant.upsert({ where: { relayCreatorId: getPlatformRelayCreatorId() }, create: { relayCreatorId: getPlatformRelayCreatorId() }, update: {} });
    const account = await db.account.create({ data: { identityAuthProvider: "patreon", patronPatreonUserId: uid, emailNorm: `${key}@fixture.example` } });
    const anchor = await db.tenantMembership.create({ data: { tenantId: platform.id, accountId: account.id, role: "patron", tierIds: [] } });
    await db.campaign.create({ data: { id: `patreon_campaign_${campaignId}`, creatorId: creator, name: "Fixture", upstreamUpdatedAt: new Date(), versionSeq: 1 } });
    await db.tier.create({ data: { id: `${creator}::${paid}`, creatorId: creator, relayTierId: `patreon_tier_${paid}`, providerTierId: paid, campaignId: `patreon_campaign_${campaignId}`, title: "Paid", amountCents: 500, upstreamUpdatedAt: new Date(), versionSeq: 1 } });
    const identity = new IdentityService(new DbIdentityStore(db));
    const f = memberFixture(identity, creator, campaignId, paid);
    f.state.details.set("member-one", f.member("member-one", uid));
    f.state.pages = [[f.member("member-one", uid)]];
    if (tiers) await upsertPlatformPatronEntitlementProjection(db, { patronMembershipId: anchor.id, relayCreatorId: creator, entitledTierIds: tiers.map((id) => id === "paid" ? `patreon_tier_${paid}` : id), campaignId });
    const snapshot = () => db.patronEntitlementSnapshot.findUniqueOrThrow({ where: { patronMembershipId_relayCreatorId: { patronMembershipId: anchor.id, relayCreatorId: creator } } });
    const canonical = () => db.tenantMembership.findFirst({ where: { accountId: account.id, tenantId: tenant.id } });
    const encryption = new TokenEncryption(randomBytes(32).toString("base64"));
    await upsertPatronOAuthCredential(db, account.id, { access_token: "fixture", refresh_token: "refresh" }, encryption);
    const doc = (active = true, id = uid) => ({ data: { type: "user", id, attributes: {} }, included: [f.member("member-one", id, active)] });
    const refresh = (fetchImpl: typeof fetch, client = other) => refreshPatronEntitlementSnapshotFromPatreon({ prisma: client, encryption, patreonClient: {} as never, fetchImpl, patronMembershipId: anchor.id, relayCreatorId: creator, snapshotCampaignId: campaignId, source: EntitlementSource.scheduled_refresh });
    return { ...f, key, uid, tenant, account, anchor, paid, snapshot, canonical, encryption, doc, refresh };
  }

  it("keeps strict creator admission separate from trusted platform projections", async () => {
    const f = await fixture(["paid"]);
    await expect(upsertPatronEntitlementSnapshot(db, { patronMembershipId: f.anchor.id, relayCreatorId: f.creatorId, entitledTierIds: [], source: "webhook" })).rejects.toThrow("binding");
    await f.refresh(async () => Response.json(f.doc()));
    const member = (await f.canonical())!;
    expect(member.tierIds).toEqual([`patreon_tier_${f.paid}`]);
    expect((await f.snapshot()).entitledTierIds).toEqual(member.tierIds);
    expect((await db.tenantMembership.findUniqueOrThrow({ where: { id: f.anchor.id } })).tierIds).toEqual([]);
    expect((await db.tenantMembership.findUniqueOrThrow({ where: { id: f.anchor.id } })).patreonObservation).toBe(0n);
    await expect(upsertPlatformPatronEntitlementProjection(db, { patronMembershipId: member.id, relayCreatorId: f.creatorId, entitledTierIds: [] })).rejects.toThrow("binding");
    expect(await db.creatorMembershipEvent.count({ where: { creatorId: f.creatorId } })).toBe(0);
  });

  it("rejects wrong account, creator, and campaign before provider materialization", async () => {
    const f = await fixture(["paid"]);
    const credential = (await getPatronOAuthCredentialSnapshot(db, f.account.id, f.encryption))!;
    const args = { patronMembershipId: f.anchor.id, relayCreatorId: f.creatorId, expectedAccountId: f.account.id,
      expectedPatreonUserId: f.uid, expectedCredentialVersion: credential.version, provider: "patreon" as const,
      entitledTierIds: [`patreon_tier_${f.paid}`], source: EntitlementSource.scheduled_refresh,
      patreonCampaignScope: f.campaignId, patreonObservation: await f.identity.capturePatreonObservation() };
    await expect(upsertPatronProviderEntitlements(db, { ...args, expectedAccountId: "different-account" })).rejects.toThrow("account binding");
    await expect(upsertPatronProviderEntitlements(db, { ...args, patreonCampaignScope: "wrong-campaign" })).rejects.toThrow("campaign binding");
    const unrelated = await db.tenant.create({ data: { relayCreatorId: `unrelated_${f.key}` } });
    const membership = await db.tenantMembership.create({ data: { tenantId: unrelated.id, accountId: f.account.id, role: "patron" } });
    await expect(upsertPatronProviderEntitlements(db, { ...args, patronMembershipId: membership.id })).rejects.toThrow("membership binding");
    expect(await f.canonical()).toBeNull();
  });

  it.each([false, true])("sparse creator OAuth and refresh leave every authorization row unchanged (paid=%s)", async (paid) => {
    const f = await fixture(paid ? ["paid"] : []);
    const state = async () => {
      const memberships = await db.tenantMembership.findMany({ where: { accountId: f.account.id }, orderBy: { id: "asc" } });
      const ids = memberships.map((row) => row.id);
      return { account: await db.account.findUnique({ where: { id: f.account.id } }), memberships,
        snapshots: await db.patronEntitlementSnapshot.findMany({ where: { patronMembershipId: { in: ids } }, orderBy: { id: "asc" } }),
        credential: await db.patronOAuthCredential.findUnique({ where: { accountId: f.account.id } }),
        sessions: await db.session.findMany({ where: { tenantMembershipId: { in: ids } } }),
        follows: await db.patronFollow.count({ where: { patronMembershipId: { in: ids } } }),
        seeds: await db.patronFollowSeed.count({ where: { patronMembershipId: { in: ids } } }),
        outbox: await db.outboxEvent.count({ where: { tenantId: f.creatorId } }),
        ledger: await db.creatorMembershipEvent.count({ where: { creatorId: f.creatorId } }),
        members: await db.patreonMemberState.count({ where: { creatorId: f.creatorId } }) };
    };
    const before = await state();
    const tierData = { data: [{ type: "tier", id: "other_campaign_paid" }] };
    const campaign = { data: { type: "campaign", id: f.campaignId } };
    for (const relationships of [
      { currently_entitled_tiers: tierData }, {}, { currently_entitled_tiers: { data: [] } },
      { campaign: { data: { type: "user", id: f.campaignId } }, currently_entitled_tiers: tierData },
      { campaign: { data: { type: "campaign", id: " " } }, currently_entitled_tiers: tierData },
      { campaign }, { campaign, currently_entitled_tiers: { data: null } },
      { campaign, currently_entitled_tiers: { data: [{ type: "tier", id: "" }] } }
    ]) {
      const doc = { data: { type: "user", id: f.uid, attributes: { email: f.account.emailNorm } }, included: [{ type: "member", id: "unverified", attributes: { patron_status: "active_patron", currently_entitled_amount_cents: 0 }, relationships }] };
      await expect(exchangePatreonPatronOAuth({ creatorId: f.creatorId, patreonCampaignNumericId: f.campaignId, code: "fixture", redirectUri: "https://fixture.example/callback",
        identityService: f.identity, prisma: db, encryption: f.encryption,
        patreonClient: { exchangeCode: async () => ({ access_token: "new-access", refresh_token: "new-refresh" }) } as never,
        fetchImpl: async () => Response.json(doc) })).rejects.toThrow("identity_campaign_binding_unverified");
      expect(await f.refresh(async () => Response.json(doc))).toEqual({ ok: false, reason: "identity_campaign_binding_unverified" });
      expect(await state()).toEqual(before);
      expect(canAccessPost({ level: "member_only", tier_ids: [] }, (await f.snapshot()).entitledTierIds, {})).toBe(paid);
    }
  }, 30_000);

  it("admits explicit A/B and free empty tiers, and still accepts complete cancellations in both callers", async () => {
    for (const mode of ["linked", "free", "empty", "former"] as const) {
      const f = await fixture(mode === "linked" || mode === "free" ? [] : ["paid"]);
      const member = f.member("member-one", f.uid, mode !== "former");
      if (mode === "free") { member.attributes!.currently_entitled_amount_cents = 0; member.relationships!.currently_entitled_tiers = { data: [] }; }
      if (mode === "former") { member.attributes!.patron_status = "former_patron"; delete member.relationships!.campaign; }
      const doc = { data: { type: "user", id: f.uid, attributes: { email: f.account.emailNorm } }, included: mode === "empty" ? [] : [member,
        { type: "member", id: "other-campaign", attributes: { patron_status: "active_patron" }, relationships: { campaign: { data: { type: "campaign", id: "other" } } } }] };
      await exchangePatreonPatronOAuth({ creatorId: f.creatorId, patreonCampaignNumericId: f.campaignId, code: "fixture", redirectUri: "https://fixture.example/callback",
        identityService: f.identity, prisma: db, encryption: f.encryption,
        patreonClient: { exchangeCode: async () => ({ access_token: "new-access", refresh_token: "new-refresh" }) } as never,
        fetchImpl: async () => Response.json(doc) });
      expect((await f.snapshot()).entitledTierIds).toEqual(mode === "linked" ? [`patreon_tier_${f.paid}`] : []);
      expect(await f.refresh(async () => Response.json(doc))).toEqual({ ok: true });
      expect((await f.canonical())!.tierIds).toEqual(mode === "linked" ? [`patreon_tier_${f.paid}`] : []);
      expect(canAccessPost({ level: "member_only", tier_ids: [] }, (await f.snapshot()).entitledTierIds, {})).toBe(mode === "linked");
    }
  }, 30_000);

  it("normalizes SubscribeStar on the same account and rejects replaced credentials or profile", async () => {
    const f = await fixture(["paid", "substar_tier_old"]), profileId = `ss_${f.key}`;
    const user = await db.user.create({ data: { tenantId: f.tenant.id, kind: "creator", identityAuthProvider: "independent" } });
    await db.creatorProfile.create({ data: { tenantId: f.tenant.id, userId: user.id, publicSlug: `ss-${f.key}`, subscribestarProfileId: profileId } });
    await upsertPatronSubscribestarOAuthCredential(db, f.account.id, { access_token: "ss", refresh_token: "ss-refresh" }, f.encryption);
    const sync = (fetchImpl: typeof fetch) => syncSubscribeStarPatronEntitlements({ prisma: other, encryption: f.encryption, graphqlUrl: "https://fixture.example/graphql", subscriptionsQuery: "query { viewer { subscriptions { nodes { id } } } }", fetchImpl,
      accountId: f.account.id, patronMembershipId: f.anchor.id, relayCreatorId: f.creatorId, source: EntitlementSource.scheduled_refresh, subscribeStarOAuthClient: {} as never });
    const doc = { data: { viewer: { subscriptions: { nodes: [{ status: "active", subscribeable: { id: profileId }, plan: { id: "new" } }] } } } };
    await sync(async () => Response.json(doc));
    expect((await f.snapshot()).entitledTierIds.sort()).toEqual([`patreon_tier_${f.paid}`, "substar_tier_new"].sort());
    const credential = (await getPatronSubscribestarOAuthCredentialSnapshot(db, f.account.id, f.encryption))!;
    const args = { patronMembershipId: f.anchor.id, relayCreatorId: f.creatorId, expectedAccountId: f.account.id,
      provider: "subscribestar" as const, expectedCredentialVersion: credential.version, expectedSubscribeStarProfileId: profileId,
      entitledTierIds: [], source: EntitlementSource.scheduled_refresh, crossProviderMergeSource: "subscribestar" as const };
    await expect(upsertPatronProviderEntitlements(db, { ...args, expectedSubscribeStarProfileId: "wrong" })).rejects.toThrow("creator binding");
    await upsertPatronSubscribestarOAuthCredential(db, f.account.id, { access_token: "replacement", refresh_token: "replacement" }, f.encryption);
    await expect(upsertPatronProviderEntitlements(db, args)).rejects.toThrow("authorization changed");
    expect((await f.snapshot()).entitledTierIds).toContain("substar_tier_new");
  });

  it("preserves platform-only campaign evidence during first scoped OAuth and existing feed/search/follow reads", async () => {
    await seedPilotUxDevAccounts(db, { fixturePath: defaultPilotUxSeedFixturePath() });
    const spec = loadPilotUxSeedSpec(defaultPilotUxSeedFixturePath()), f = await fixture();
    const ava = spec.creators.find((creator) => creator.relayCreatorId === "rcx_pilot_dev_ava")!;
    const milo = spec.creators.find((creator) => creator.relayCreatorId === "rcx_pilot_dev_milo")!;
    await db.patronFollow.createMany({ data: [ava, milo].map((creator) => ({ patronMembershipId: f.anchor.id, relayCreatorId: creator.relayCreatorId })) });
    await upsertPlatformPatronEntitlementProjection(db, { patronMembershipId: f.anchor.id, relayCreatorId: ava.relayCreatorId, entitledTierIds: ["patreon_tier_unresolved_campaign", "substar_tier_keep"] });
    await upsertPlatformPatronEntitlementProjection(db, { patronMembershipId: f.anchor.id, relayCreatorId: milo.relayCreatorId, entitledTierIds: ["patreon_tier_milo_backstage"] });
    const feed = async () => (await assemblePatronFeed({ prisma: db, patronMembershipId: f.anchor.id, viewerEmail: f.account.emailNorm!, limit: 50 })).feedPosts.map((post) => post.id);
    const search = async () => (await assemblePatronSearch({ prisma: db, patronMembershipId: f.anchor.id, q: "supporter", limit: 50 })).accessible.items.map((post) => post.post_id);
    expect(await feed()).toContain("pilot_post_milo_backstage_notes");
    expect(await search()).not.toContain("pilot_post_ava_supporter_set");
    const token = await f.identity.capturePatreonObservation();
    await f.identity.registerPatreonFallback(ava.relayCreatorId, f.uid, f.account.emailNorm!, ["patreon_tier_ava_supporter"], token, ava.patreonCampaignId);
    const snapshot = () => db.patronEntitlementSnapshot.findUniqueOrThrow({ where: { patronMembershipId_relayCreatorId: { patronMembershipId: f.anchor.id, relayCreatorId: ava.relayCreatorId } } });
    expect((await snapshot()).entitledTierIds.sort()).toEqual(["patreon_tier_unresolved_campaign", "substar_tier_keep", "patreon_tier_ava_supporter"].sort());
    expect(await feed()).toContain("pilot_post_milo_backstage_notes");
    expect(await search()).toContain("pilot_post_ava_supporter_set");
    // Pilot campaign IDs are deliberately synthetic. Exercise the same acceptance transaction;
    // the numeric-provider request/cancellation path is covered separately above.
    const cancelled = await f.identity.capturePatreonObservation();
    await new DbIdentityStore(db).mutatePatreonMembers(ava.relayCreatorId, ava.patreonCampaignId, (tx) => acceptMember(tx, ava.relayCreatorId,
      { memberId: `member_${f.key}`, userId: f.uid, status: "former_patron", tiers: [], amount: 0, pledgeStart: null }, 0, undefined, cancelled, ["patreon_tier_ava_supporter"]), { userIds: [f.uid] });
    expect(await feed()).not.toContain("pilot_post_ava_supporter_set");
    expect(await search()).not.toContain("pilot_post_ava_supporter_set");
    expect(await feed()).toContain("pilot_post_milo_backstage_notes");
    const follows = await listPatronFollowsForMembership(db, f.anchor.id);
    expect(follows.find((row) => row.relay_creator_id === ava.relayCreatorId)!.entitlement.tier_ids.sort()).toEqual(["patreon_tier_unresolved_campaign", "substar_tier_keep"].sort());
    await unlinkPatreonAccount(db, f.account.id);
    expect((await snapshot()).entitledTierIds).toEqual(["substar_tier_keep"]);
    expect(await feed()).not.toContain("pilot_post_milo_backstage_notes");
    expect((await db.tenantMembership.findUniqueOrThrow({ where: { id: f.anchor.id } })).tierIds).toEqual([]);
  }, 60_000);

  it("keeps roster completion blocked for unresolved platform-only legacy access", async () => {
    const f = await fixture(["patreon_tier_unknown"]);
    f.state.pages = [[f.member("different-member", `different_${f.key}`)]];
    const result = await f.sync();
    expect(result.coverage).toBe("blocked");
    expect(result.roster).toMatchObject({ unverified_legacy_count: 1, reason: "legacy_member_binding_unverified" });
    expect(await f.canonical()).toBeNull();
    expect((await f.snapshot()).entitledTierIds).toEqual(["patreon_tier_unknown"]);
    await db.account.update({ where: { id: f.account.id }, data: { patronPatreonUserId: null } });
    expect(await new DbIdentityStore(db).mutatePatreonMembers(f.creatorId, f.campaignId, (tx) => tx.unmapped())).toBe(1);
  });

  it("cancels platform-only legacy access while preserving another creator, campaign and provider", async () => {
    const f = await fixture(["paid", "patreon_tier_other_campaign", "substar_tier_keep"]);
    const secondCreator = `other_${f.key}`;
    await db.tenant.create({ data: { relayCreatorId: secondCreator } });
    await upsertPlatformPatronEntitlementProjection(db, { patronMembershipId: f.anchor.id, relayCreatorId: secondCreator, entitledTierIds: ["patreon_tier_other_creator"] });
    const former = f.member("member-one", f.uid, false); former.attributes!.patron_status = "former_patron";
    f.state.details.set("member-one", former);
    // Use the signed member path, not OAuth refresh.
    await f.service.refreshMember(f.creatorId, "fixture", f.campaignId, "member-one", false);
    expect((await f.snapshot()).entitledTierIds.sort()).toEqual(["patreon_tier_other_campaign", "substar_tier_keep"].sort());
    expect((await f.canonical())!.tierIds.sort()).toEqual(["patreon_tier_other_campaign", "substar_tier_keep"].sort());
    expect((await db.patronEntitlementSnapshot.findUniqueOrThrow({ where: { patronMembershipId_relayCreatorId: { patronMembershipId: f.anchor.id, relayCreatorId: secondCreator } } })).entitledTierIds).toEqual(["patreon_tier_other_creator"]);
    expect((await db.creatorMembershipEvent.findMany({ where: { creatorId: f.creatorId } })).map((row) => row.eventType)).toEqual(["cancel"]);
  });

  it("mirrors canonical source and access without duplicate lifecycle or tier-change events", async () => {
    const f = await fixture(["paid"]);
    await f.service.refreshMember(f.creatorId, "fixture", f.campaignId, "member-one", false);
    f.state.details.set("member-one", 404);
    await f.service.refreshMember(f.creatorId, "fixture", f.campaignId, "member-one", true);
    expect((await f.snapshot()).source).toBe("webhook");
    expect((await f.snapshot()).entitledTierIds).toEqual([]);
    const membership = (await f.canonical())!;
    const outbox = await db.outboxEvent.findMany({ where: { tenantId: f.creatorId, eventName: "patron_entitlement.tier_changed" } });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.primaryId).toBe(membership.id);
    expect((await db.creatorMembershipEvent.findMany({ where: { creatorId: f.creatorId } })).map((row) => row.eventType)).toEqual(["cancel"]);
    const anchor = await db.tenantMembership.findUniqueOrThrow({ where: { id: f.anchor.id } });
    expect(anchor.tierIds).toEqual([]); expect(anchor.patreonObservation).toBe(0n);
  });

  it("fences an old platform refresh against cancellation even without a creator membership", async () => {
    const f = await fixture();
    const started = deferred<void>(), release = deferred<Response>();
    const pending = f.refresh(async () => { started.resolve(); return release.promise; });
    const rejected = expect(pending).rejects.toThrow("changed during collection");
    await started.promise;
    const inactive = f.member("member-one", f.uid, false); inactive.attributes!.patron_status = "former_patron";
    f.state.details.set("member-one", inactive); await f.service.refreshMember(f.creatorId, "fixture", f.campaignId, "member-one", false);
    expect(await f.canonical()).toBeNull();
    release.resolve(Response.json(f.doc())); await rejected;
    expect(await f.canonical()).toBeNull();
  });

  it("rejects changed provider identity or credential revision before creator materialization", async () => {
    const f = await fixture(["paid"]);
    expect(await f.refresh(async () => Response.json(f.doc(true, "wrong-identity")))).toEqual({ ok: false, reason: "identity_binding_mismatch" });
    const started = deferred<void>(), release = deferred<Response>();
    const pending = f.refresh(async () => { started.resolve(); return release.promise; });
    const rejected = expect(pending).rejects.toThrow("authorization changed");
    await started.promise;
    await upsertPatronOAuthCredential(db, f.account.id, { access_token: "replacement", refresh_token: "replacement" }, f.encryption);
    release.resolve(Response.json(f.doc())); await rejected;
    expect(await f.canonical()).toBeNull();
  });

  it("unlinks all platform projections and rejects a held refresh without creating a membership", async () => {
    const f = await fixture(["paid", "substar_tier_keep"]);
    const started = deferred<void>(), release = deferred<Response>();
    const pending = f.refresh(async () => { started.resolve(); return release.promise; });
    const rejected = expect(pending).rejects.toThrow("authorization was removed");
    await started.promise; await unlinkPatreonAccount(db, f.account.id);
    expect((await f.snapshot()).entitledTierIds).toEqual(["substar_tier_keep"]);
    release.resolve(Response.json(f.doc())); await rejected;
    expect(await f.canonical()).toBeNull();
    expect(await db.patronOAuthCredential.findUnique({ where: { accountId: f.account.id } })).toBeNull();
  });

  it("rolls canonical access, ledger and member checkpoint back if a platform write fails", async () => {
    const f = await fixture(["paid"]);
    const failing = db.$extends({ query: { patronEntitlementSnapshot: { async upsert({ args, query }) {
      if (args.where.patronMembershipId_relayCreatorId?.patronMembershipId === f.anchor.id) throw new Error("projection write failed");
      return query(args);
    } } } });
    const worker = memberFixture(new IdentityService(new DbIdentityStore(failing as unknown as PrismaClient)), f.creatorId, f.campaignId, f.paid);
    const inactive = worker.member("member-one", f.uid, false); inactive.attributes!.patron_status = "former_patron";
    worker.state.details.set("member-one", inactive);
    await expect(worker.refresh()).rejects.toThrow("projection write failed");
    expect(await f.canonical()).toBeNull();
    expect((await f.snapshot()).entitledTierIds).toEqual([`patreon_tier_${f.paid}`]);
    expect(await db.creatorMembershipEvent.count({ where: { creatorId: f.creatorId } })).toBe(0);
    expect(await db.outboxEvent.count({ where: { tenantId: f.creatorId, eventName: "patron_entitlement.tier_changed" } })).toBe(0);
    expect(await db.patreonMemberState.count({ where: { creatorId: f.creatorId } })).toBe(0);
    f.state.details.set("member-one", inactive); await f.service.refreshMember(f.creatorId, "fixture", f.campaignId, "member-one", false);
    expect((await f.snapshot()).entitledTierIds).toEqual([]);
    expect(await db.creatorMembershipEvent.count({ where: { creatorId: f.creatorId } })).toBe(1);
  });

  it("purges projections, rejects held collectors and preserves accepted provider sequence", async () => {
    const f = await fixture(["paid"]);
    await f.service.refreshMember(f.creatorId, "fixture", f.campaignId, "member-one", false);
    const before = await db.patreonMemberState.findFirstOrThrow({ where: { creatorId: f.creatorId } });
    const count = await db.creatorMembershipEvent.count({ where: { creatorId: f.creatorId } });
    const started = deferred<void>(), release = deferred<Response>();
    const pending = f.refresh(async () => { started.resolve(); return release.promise; });
    const rejected = expect(pending).rejects.toThrow("binding");
    await started.promise;
    const deletion = await db.accountDeletion.create({ data: { accountId: f.account.id, status: "pending", scheduledFor: new Date(0) } });
    await executeDeletion(db, deletion.id);
    release.resolve(Response.json(f.doc())); await rejected;
    expect(await db.patronEntitlementSnapshot.count({ where: { patronMembershipId: f.anchor.id } })).toBe(0);
    await f.service.refreshMember(f.creatorId, "fixture", f.campaignId, "member-one", false);
    const after = await db.patreonMemberState.findFirstOrThrow({ where: { creatorId: f.creatorId } });
    expect((after.state as { sequence: number }).sequence).toBe((before.state as { sequence: number }).sequence + 1);
    expect(await db.creatorMembershipEvent.count({ where: { creatorId: f.creatorId } })).toBe(count);
  });
});
