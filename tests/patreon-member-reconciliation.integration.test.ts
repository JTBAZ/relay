import { randomUUID, randomBytes } from "node:crypto";
import { EntitlementSource, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DbIdentityStore } from "../src/identity/identity-store-db.js";
import { IdentityService } from "../src/identity/identity-service.js";
import { upsertPatronEntitlementSnapshot } from "../src/identity/patron-entitlement-snapshot.js";
import { PatreonChangeWorkStore } from "../src/patreon/patreon-change-work.js";
import { processPatreonChanges } from "../src/patreon/patreon-change-worker.js";
import { dispatchVerifiedPatreonPlatformPayload } from "../src/patreon/patreon-webhook-platform.js";
import { memberFixture } from "./helpers/patreon-members.js";
import { deferred } from "./helpers/patreon-targeted-post.js";
import { TokenEncryption } from "../src/lib/crypto.js";
import { upsertPatronOAuthCredential } from "../src/auth/patron-oauth-credential-store.js";
import { refreshPatronEntitlementSnapshotFromPatreon } from "../src/patron/patron-entitlement-refresh.js";
import { unlinkPatreonAccount } from "../src/identity/patreon-identity-mutation.js";
import { executeDeletion } from "../src/patron/account-deletion-service.js";
import { exchangePatreonPatronOAuth } from "../src/patreon/patreon-patron-oauth.js";
import { refreshPatronOAuthTokensWithStoredRefreshToken } from "../src/patreon/patron-oauth-refresh.js";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

const target = process.env.CANONICAL_STORE_TEST_DATABASE_URL;
describe.skipIf(!target)("PS10 PostgreSQL member acceptance and roster recovery", () => {
  let first: PrismaClient, second: PrismaClient;
  beforeAll(async () => {
    const url = new URL(target!);
    if (url.hostname !== "127.0.0.1" || !["postgres:", "postgresql:"].includes(url.protocol) || url.search || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error("PS10 requires guarded disposable loopback database");
    first = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) });
    second = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) });
    await Promise.all([first.$connect(), second.$connect()]);
  });
  afterAll(async () => { await Promise.all([first?.$disconnect(), second?.$disconnect()]); });
  function fixture() {
    const creator = `ps10_${randomUUID()}`;
    const a = memberFixture(new IdentityService(new DbIdentityStore(first)), creator);
    const b = memberFixture(new IdentityService(new DbIdentityStore(second)), creator);
    const user = () => first.tenantMembership.findFirstOrThrow({ where: { tenant: { relayCreatorId: creator }, account: { patronPatreonUserId: "user-one" } } });
    const events = () => first.creatorMembershipEvent.findMany({ where: { creatorId: creator }, orderBy: { occurredAt: "asc" } });
    return { a, b, user, events, creator };
  }
  it("executes targeted signed members through durable leased work and retains stable masked identity", async () => {
    const f = fixture(); await f.a.refresh();
    const work = new PatreonChangeWorkStore(first);
    await work.accept([{ creatorId: f.creator, campaignId: "1000", resourceId: "member-one", resourceType: "member", eventType: "members:create" }], "ps10-fixture");
    await first.patreonChangeWork.updateMany({ where: { creatorId: f.creator }, data: { dueAt: new Date(0) } });
    const workRow = await first.patreonChangeWork.findFirstOrThrow({ where: { creatorId: f.creator } });
    await processPatreonChanges(work, (row) => dispatchVerifiedPatreonPlatformPayload({ creatorId: row.creatorId, campaignId: row.campaignId,
      resourceId: row.resourceId, eventHeader: row.eventType, traceId: "ps10", syncService: f.b.service, memberCoordinator: {} as never }).then(() => {}), workRow.id);
    expect((await f.user()).tierIds).toEqual(["patreon_tier_paid"]);
    expect(await f.events()).toHaveLength(1);
    expect((await first.patreonChangeWork.findFirstOrThrow({ where: { creatorId: f.creator } })).status).toBe("completed");
  });
  it("rereads stale deletes and only removes a currently absent verified member", async () => {
    const f = fixture(); await f.a.refresh(); await f.a.refresh("member-one", true);
    expect((await f.user()).tierIds).toEqual(["patreon_tier_paid"]);
    f.a.state.details.set("member-one", 404); await f.a.refresh("member-one", true); await f.a.refresh("member-one", true);
    expect((await f.user()).tierIds).toEqual([]);
    expect((await f.events()).map((row) => row.eventType)).toEqual(["join", "cancel"]);
  });
  it("does not treat 403 or an unknown deletion as a removable member", async () => {
    const f = fixture(); await f.a.refresh(); f.a.state.details.set("member-one", 403);
    await expect(f.a.refresh("member-one", true)).rejects.toThrow(); await expect(f.a.refresh("unknown", true)).rejects.toThrow("binding");
    expect((await f.user()).tierIds).toEqual(["patreon_tier_paid"]);
  });
  it("resumes roster continuation from another client and blocks unexpected emptiness", async () => {
    const f = fixture(); f.a.state.pages = [[f.a.member()], [f.a.member("two", "two-user")], [f.a.member("free", "free-user", false)]];
    f.b.state.pages = f.a.state.pages;
    expect((await f.a.sync(1)).coverage).toBe("partial"); expect((await f.b.sync(1)).coverage).toBe("partial"); expect((await f.a.sync(1)).coverage).toBe("complete");
    f.b.state.pages = [[]]; expect((await f.b.sync()).coverage).toBe("blocked"); expect((await f.user()).tierIds).toEqual(["patreon_tier_paid"]);
  });
  it("rejects a delayed page after a targeted removal", async () => {
    const f = fixture(); await f.a.refresh(); const started = deferred<void>(), response = deferred<Response>();
    f.a.state.pageHook = async () => { started.resolve(); return response.promise; };
    const pending = f.a.sync(); await started.promise;
    f.b.state.details.set("member-one", 404); await f.b.refresh("member-one", true);
    response.resolve(Response.json({ data: [f.a.member()] })); await expect(pending).rejects.toThrow("changed during collection");
    expect((await f.user()).tierIds).toEqual([]);
  });
  it("fences a delayed paid page after a newer inactive observation with no identity row", async () => {
    const f = fixture(); const started = deferred<void>(), response = deferred<Response>();
    f.a.state.pageHook = async () => { started.resolve(); return response.promise; };
    const pending = f.a.sync(); await started.promise;
    const inactive = f.b.member("member-one", "user-one", false); inactive.attributes!.patron_status = "former_patron";
    f.b.state.details.set("member-one", inactive); await f.b.refresh();
    expect(await first.tenantMembership.count({ where: { tenant: { relayCreatorId: f.creator } } })).toBe(0);
    response.resolve(Response.json({ data: [f.a.member()] })); await expect(pending).rejects.toThrow("changed during collection");
    expect(await first.tenantMembership.count({ where: { tenant: { relayCreatorId: f.creator } } })).toBe(0);
  });
  it("rejects delayed targeted observations and converges duplicate workers", async () => {
    const f = fixture(); await f.a.refresh(); const started = deferred<void>(), response = deferred<Response>();
    f.a.state.detailHook = async () => { started.resolve(); return response.promise; };
    const old = f.a.refresh(); await started.promise;
    f.b.state.details.set("member-one", 404); await f.b.refresh("member-one", true);
    response.resolve(Response.json({ data: f.a.member() })); await expect(old).rejects.toThrow("changed during collection");
    expect((await f.user()).tierIds).toEqual([]);
    f.a.state.detailHook = undefined; f.a.state.details.set("member-one", f.a.member());
    const results = await Promise.allSettled([f.a.refresh(), f.b.refresh("member-one", true)]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect((await f.events()).filter((row) => row.eventType === "join")).toHaveLength(1);
  });
  it("keeps membership, snapshot, and sessions consistent with another provider", async () => {
    const f = fixture(); await f.a.refresh(); const user = await f.user();
    await upsertPatronEntitlementSnapshot(second, { patronMembershipId: user.id, relayCreatorId: f.creator,
      entitledTierIds: ["substar_tier_keep"], source: EntitlementSource.scheduled_refresh, crossProviderMergeSource: "subscribestar" });
    const store = new DbIdentityStore(first);
    await store.createSession({ token: `session-${f.creator}`, user_id: user.id, creator_id: f.creator, tier_ids: [], expires_at: "2099-01-01T00:00:00.000Z" });
    f.a.state.details.set("member-one", 404); await f.a.refresh("member-one", true);
    expect((await f.user()).tierIds).toEqual(["substar_tier_keep"]);
    expect((await first.patronEntitlementSnapshot.findFirstOrThrow({ where: { relayCreatorId: f.creator } })).entitledTierIds).toEqual(["substar_tier_keep"]);
    expect((await store.getSession(`session-${f.creator}`))!.tier_ids).toEqual(["substar_tier_keep"]);
  });
  it("rejects an older OAuth grant after deletion, including unchanged verification fences", async () => {
    const f = fixture(); await f.a.refresh(); const old = await f.a.identity.capturePatreonObservation();
    await f.b.refresh(); await expect(f.a.identity.registerPatreonFallback(f.creator, "user-one", "masked@relay.local", ["patreon_tier_paid"], old)).rejects.toThrow("changed during collection");
    const earlier = await f.a.identity.capturePatreonObservation(); f.b.state.details.set("member-one", 404); await f.b.refresh("member-one", true);
    await expect(f.a.identity.registerPatreonFallback(f.creator, "user-one", "masked@relay.local", ["patreon_tier_paid"], earlier)).rejects.toThrow("changed during collection");
    expect((await f.user()).tierIds).toEqual([]);
  });
  it("rolls back identity, snapshot and roster checkpoints when ledger insertion fails, then retries once", async () => {
    const f = fixture(); const suffix = randomUUID().replaceAll("-", ""), fn = `ps10_fail_${suffix}`;
    await first.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.creator_id = '${f.creator}' THEN RAISE EXCEPTION 'PS10 ledger fixture'; END IF; RETURN NEW; END $$`);
    await first.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE INSERT ON creator_membership_events FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    try {
      await expect(f.a.sync()).rejects.toThrow("PS10 ledger fixture");
      expect(await first.tenantMembership.count({ where: { tenant: { relayCreatorId: f.creator } } })).toBe(0);
      expect(await first.patreonMemberState.count({ where: { creatorId: f.creator } })).toBe(0);
      expect((await first.patreonRosterState.findFirstOrThrow({ where: { creatorId: f.creator } })).state).toMatchObject({ phase: "listing", seen: 0 });
    } finally { await first.$executeRawUnsafe(`DROP TRIGGER ${fn} ON creator_membership_events`); await first.$executeRawUnsafe(`DROP FUNCTION ${fn}()`); }
    expect((await f.b.sync()).coverage).toBe("complete"); expect(await f.events()).toHaveLength(1);
  });
  it.each([
    ["patron_entitlement_snapshots", "relay_creator_id"], ["patreon_member_states", "creator_id"],
    ["patreon_roster_states", "creator_id"], ["outbox_events", "tenant_id"]
  ])("rolls back accepted member changes when %s fails", async (table, creatorColumn) => {
    const f = fixture(); await f.a.refresh();
    const suffix = randomUUID().replaceAll("-", ""), fn = `ps10_fail_${suffix}`;
    const condition = table === "patreon_roster_states" ? " AND NEW.state->>'phase' = 'verifying'" : "";
    await first.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.${creatorColumn} = '${f.creator}'${condition} THEN RAISE EXCEPTION 'PS10 atomic fixture'; END IF; RETURN NEW; END $$`);
    await first.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    f.a.state.pages = [[f.a.member("member-one", "user-one", false)]];
    try {
      await expect(f.a.sync()).rejects.toThrow("PS10 atomic fixture");
      expect((await f.user()).tierIds).toEqual(["patreon_tier_paid"]); expect(await f.events()).toHaveLength(1);
      expect((await first.patronEntitlementSnapshot.findFirstOrThrow({ where: { relayCreatorId: f.creator } })).entitledTierIds).toEqual(["patreon_tier_paid"]);
      expect((await first.patreonMemberState.findFirstOrThrow({ where: { creatorId: f.creator } })).state).toMatchObject({ sequence: 1 });
    } finally { await first.$executeRawUnsafe(`DROP TRIGGER ${fn} ON ${table}`); await first.$executeRawUnsafe(`DROP FUNCTION ${fn}()`); }
    expect((await f.a.sync()).coverage).toBe("complete"); expect((await f.events()).filter((event) => event.eventType === "cancel")).toHaveLength(1);
  });
  it("reports legacy access without a member binding as blocked with an unresolved count", async () => {
    const f = fixture(); await f.a.identity.registerPatreonFallback(f.creator, `legacy-${f.creator}`, "", ["patreon_tier_paid"]);
    const result = await f.a.sync(); expect(result.coverage).toBe("blocked");
    expect(result.roster).toMatchObject({ unverified_legacy_count: 1, reason: "legacy_member_binding_unverified" });
  });
  it("preserves trusted OAuth email linking and existing account conflict policy", async () => {
    const f = fixture(); const email = `${f.creator}@fixture.example`;
    const account = await first.account.create({ data: { emailNorm: email, identityAuthProvider: "independent" } });
    const user = await f.a.identity.registerPatreonFallback(f.creator, `oauth-${f.creator}`, email, []);
    expect((await first.tenantMembership.findUniqueOrThrow({ where: { id: user.user_id } })).accountId).toBe(account.id);
    const conflict = await first.account.create({ data: { emailNorm: `conflict-${email}`, patronPatreonUserId: `different-${f.creator}`, identityAuthProvider: "patreon" } });
    await expect(f.a.identity.registerPatreonFallback(`other-${f.creator}`, `oauth-${f.creator}`, conflict.emailNorm!, [])).rejects.toThrow("already linked");
  });
  it("preserves an existing account profile when a masked member appears for another creator", async () => {
    const f = fixture(), userId = `masked-${f.creator}`;
    const account = await first.account.create({ data: { emailNorm: `${userId}@fixture.example`, passwordHash: "existing-password", identityAuthProvider: "independent", patronPatreonUserId: userId } });
    f.a.state.details.set("masked-member", f.a.member("masked-member", userId)); await f.a.refresh("masked-member");
    const after = await first.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.emailNorm).toBe(account.emailNorm); expect(after.passwordHash).toBe("existing-password"); expect(after.identityAuthProvider).toBe("independent");
  });
  it("retains legacy campaign B tiers when the first campaign A observation is canceled", async () => {
    const f = fixture(); await f.a.identity.registerPatreonFallback(f.creator, "user-one", "", ["patreon_tier_B"]);
    f.a.state.details.set("member-one", f.a.member("member-one", "user-one", false)); await f.a.refresh();
    expect((await f.user()).tierIds).toEqual(["patreon_tier_B"]);
    f.a.state.details.set("member-one", f.a.member()); await f.a.refresh();
    f.a.campaigns.data[0]!.relationships.tiers.data = [];
    f.a.state.details.set("member-one", f.a.member("member-one", "user-one", false)); await f.a.refresh();
    expect((await f.user()).tierIds).toEqual(["patreon_tier_B"]);
  });
  it("preserves another campaign during the actual patron OAuth stale refresh", async () => {
    const f = fixture(); await f.a.refresh(); const user = await f.user();
    await f.a.identity.registerPatreonFallback(f.creator, "user-one", "", ["patreon_tier_paid", "patreon_tier_B"]);
    const encryption = new TokenEncryption(randomBytes(32).toString("base64"));
    await upsertPatronOAuthCredential(first, user.accountId, { access_token: "fixture", refresh_token: "fixture" }, encryption);
    await refreshPatronEntitlementSnapshotFromPatreon({ prisma: first, encryption, patreonClient: {} as never,
      fetchImpl: async () => Response.json({ data: { type: "user", id: "user-one", attributes: {} }, included: [
        { type: "member", id: "member-one", attributes: { patron_status: "former_patron" }, relationships: { campaign: { data: { type: "campaign", id: "1000" } }, currently_entitled_tiers: { data: [] } } }] }),
      patronMembershipId: user.id, relayCreatorId: f.creator, snapshotCampaignId: "1000", source: EntitlementSource.scheduled_refresh });
    expect((await f.user()).tierIds).toEqual(["patreon_tier_B"]);
  });
  it("retains distinct repeated transition identities when timestamps collide", async () => {
    const f = fixture(); await f.a.refresh();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
    try {
      f.a.state.details.set("member-one", 404); await f.a.refresh("member-one", true);
      f.a.state.details.set("member-one", f.a.member()); await f.a.refresh();
      f.a.state.details.set("member-one", 404); await f.a.refresh("member-one", true);
      const cancellations = (await f.events()).filter((row) => row.eventType === "cancel");
      expect(cancellations).toHaveLength(2); expect(cancellations[0]!.occurredAt).toEqual(cancellations[1]!.occurredAt);
      expect(cancellations[0]!.dedupeKey).not.toBe(cancellations[1]!.dedupeKey);
    } finally { vi.useRealTimers(); }
  });
  it("records OAuth, scheduled and signed acceptance sources honestly", async () => {
    const f = fixture(); await f.a.refresh();
    const snapshot = () => first.patronEntitlementSnapshot.findFirstOrThrow({ where: { relayCreatorId: f.creator } });
    expect((await snapshot()).source).toBe("webhook");
    await f.a.service.syncMembers(f.creator, { campaign_id: "1000", source: "scheduled_refresh" });
    expect((await snapshot()).source).toBe("scheduled_refresh");
    await f.a.identity.registerPatreonFallback(f.creator, "user-one", "", ["patreon_tier_paid"]);
    expect((await snapshot()).source).toBe("oauth_exchange");
    await f.a.sync(); expect((await snapshot()).source).toBe("manual_support");
  });
  it("preserves campaign B during the actual creator-scoped OAuth exchange for A", async () => {
    const f = fixture(); await f.a.refresh();
    await f.a.identity.registerPatreonFallback(f.creator, "user-one", "", ["patreon_tier_paid", "patreon_tier_B"]);
    await exchangePatreonPatronOAuth({ creatorId: f.creator, patreonCampaignNumericId: "1000", code: "fixture", redirectUri: "https://fixture.example/callback",
      identityService: f.a.identity, patreonClient: { exchangeCode: async () => ({ access_token: "fixture" }) } as never,
      fetchImpl: async () => Response.json({ data: { type: "user", id: "user-one", attributes: {} }, included: [f.a.member("member-one", "user-one", false)] }) });
    expect((await f.user()).tierIds).toEqual(["patreon_tier_B"]);
  });
  it("serializes unlink with a new creator grant and rejects its pre-unlink OAuth observation", async () => {
    const f = fixture(), id = `unlink-${randomUUID()}`, email = `${id}@fixture.example`;
    const user = await f.a.identity.registerPatreonFallback(f.creator, id, email, ["patreon_tier_paid"]);
    const membership = await first.tenantMembership.findUniqueOrThrow({ where: { id: user.user_id } });
    const token = await f.a.identity.capturePatreonObservation();
    const locked = deferred<void>(), release = deferred<void>();
    const hold = first.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`entitlements:${f.creator}`}, 0))`;
      locked.resolve(); await release.promise;
    }, { timeout: 15_000 });
    await locked.promise;
    const unlink = unlinkPatreonAccount(second, membership.accountId);
    await vi.waitFor(async () => {
      const result = await first.$transaction((tx) => tx.$queryRaw<Array<{ held: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`patreon-identity:${id}`}, 0)) AS held`);
      expect(result[0]!.held).toBe(false);
    });
    const late = f.a.identity.registerPatreonFallback(`new-${f.creator}`, id, email, ["patreon_tier_paid"], token);
    const rejected = expect(late).rejects.toThrow("changed during collection");
    release.resolve(); await hold; await unlink; await rejected;
    expect((await first.account.findUniqueOrThrow({ where: { id: membership.accountId } })).patronPatreonUserId).toBeNull();
    expect(await first.tenantMembership.count({ where: { tenant: { relayCreatorId: `new-${f.creator}` } } })).toBe(0);
    await expect(f.a.identity.completeUnifiedPatreonPatronOAuth({ observation: token, patreonUserId: id, email, ownedCampaignId: null, memberships: [] })).rejects.toThrow("changed during collection");
  });
  it("purges the account, fences a held page and preserves provider lifecycle continuity", async () => {
    const f = fixture(), id = `purge-${randomUUID()}`;
    f.a.state.details.set("member-one", f.a.member("member-one", id)); await f.a.refresh();
    f.a.state.details.set("member-one", 404); await f.a.refresh("member-one", true);
    f.a.state.details.set("member-one", f.a.member("member-one", id)); await f.a.refresh();
    const membership = await first.tenantMembership.findFirstOrThrow({ where: { tenant: { relayCreatorId: f.creator } } });
    const deletion = await first.accountDeletion.create({ data: { accountId: membership.accountId, status: "pending", scheduledFor: new Date(0) } });
    const started = deferred<void>(), response = deferred<Response>();
    f.a.state.pageHook = async () => { started.resolve(); return response.promise; };
    const old = f.a.sync(); await started.promise;
    const result = await executeDeletion(second, deletion.id); expect(result!.record.status).toBe("executed");
    expect(await first.patreonMemberState.count({ where: { creatorId: f.creator } })).toBe(1);
    expect(await first.creatorMembershipEvent.count({ where: { creatorId: f.creator } })).toBe(3);
    response.resolve(Response.json({ data: [f.a.member("member-one", id)] }));
    await expect(old).rejects.toThrow("changed during collection");
    expect(await first.account.findUnique({ where: { id: membership.accountId } })).toBeNull();
    expect(await first.patreonMemberState.count({ where: { creatorId: f.creator } })).toBe(1);
    expect(await first.tenantMembership.count({ where: { tenant: { relayCreatorId: f.creator } } })).toBe(0);
    await f.a.refresh();
    expect(await first.creatorMembershipEvent.count({ where: { creatorId: f.creator } })).toBe(3);
    f.a.state.details.set("member-one", 404); await f.a.refresh("member-one", true);
    const events = await f.events(); expect(events.map((event) => event.eventType)).toEqual(["join", "cancel", "rejoin", "cancel"]);
    expect(new Set(events.map((event) => event.dedupeKey)).size).toBe(4);
  });
  it("does not persist exchanged credentials when unlink follows accepted OAuth identity", async () => {
    const f = fixture(), id = `exchange-${randomUUID()}`, email = `${id}@fixture.example`;
    const user = await f.a.identity.registerPatreonFallback(f.creator, id, email, ["patreon_tier_paid"]);
    const membership = await first.tenantMembership.findUniqueOrThrow({ where: { id: user.user_id } });
    const complete = f.a.identity.completePatreonPatronOAuth.bind(f.a.identity);
    const spy = vi.spyOn(f.a.identity, "completePatreonPatronOAuth").mockImplementation(async (...args) => {
      const result = await complete(...args); await unlinkPatreonAccount(second, membership.accountId); return result;
    });
    try {
      await expect(exchangePatreonPatronOAuth({ creatorId: f.creator, patreonCampaignNumericId: "1000", code: "fixture", redirectUri: "https://fixture.example/callback",
        identityService: f.a.identity, prisma: first, encryption: new TokenEncryption(randomBytes(32).toString("base64")),
        patreonClient: { exchangeCode: async () => ({ access_token: "fixture", refresh_token: "fixture" }) } as never,
        fetchImpl: async () => Response.json({ data: { type: "user", id, attributes: { email } }, included: [f.a.member("member-one", id)] }) })).rejects.toThrow("authorization was removed");
    } finally { spy.mockRestore(); }
    expect(await first.patronOAuthCredential.findUnique({ where: { accountId: membership.accountId } })).toBeNull();
    expect((await first.tenantMembership.findUniqueOrThrow({ where: { id: user.user_id } })).tierIds).toEqual([]);
  });
  it("does not recreate credentials when a stored-token refresh returns after unlink", async () => {
    const f = fixture(), id = `refresh-${randomUUID()}`;
    const user = await f.a.identity.registerPatreonFallback(f.creator, id, "", ["patreon_tier_paid"]);
    const membership = await first.tenantMembership.findUniqueOrThrow({ where: { id: user.user_id } });
    const encryption = new TokenEncryption(randomBytes(32).toString("base64"));
    await upsertPatronOAuthCredential(first, membership.accountId, { access_token: "old", refresh_token: "old" }, encryption);
    const started = deferred<void>(), response = deferred<{ access_token: string; refresh_token: string; expires_in: number }>();
    const old = refreshPatronOAuthTokensWithStoredRefreshToken({ prisma: first, accountId: membership.accountId, encryption,
      patreonClient: { refreshToken: async () => { started.resolve(); return response.promise; } } as never });
    await started.promise; await unlinkPatreonAccount(second, membership.accountId);
    response.resolve({ access_token: "new", refresh_token: "new", expires_in: 3600 }); expect(await old).toBeNull();
    expect(await first.patronOAuthCredential.findUnique({ where: { accountId: membership.accountId } })).toBeNull();
    expect((await first.tenantMembership.findUniqueOrThrow({ where: { id: user.user_id } })).tierIds).toEqual([]);
  });
  it.skipIf(!process.env.PATREON_CHANGE_TEST_REDIS_URL)("recovers lost dispatch and applies current member state through real BullMQ", async () => {
    const url = new URL(process.env.PATREON_CHANGE_TEST_REDIS_URL!);
    if (url.hostname !== "127.0.0.1" || url.port !== "49953") throw new Error("PS10 requires disposable Redis");
    const f = fixture(); await f.a.refresh(); f.b.state.details.set("member-one", 404);
    const store = new PatreonChangeWorkStore(first);
    await store.accept([{ creatorId: f.creator, campaignId: "1000", resourceType: "member", resourceId: "member-one", eventType: "members:delete" }], "ps10-recovery");
    const row = await first.patreonChangeWork.findFirstOrThrow({ where: { creatorId: f.creator } });
    await first.patreonChangeWork.update({ where: { id: row.id }, data: { dueAt: new Date(0) } });
    const redis = new Redis(url.toString(), { maxRetriesPerRequest: null }), prefix = `ps10-${randomUUID()}`;
    const queue = new Queue("patreon_change_work", { connection: redis, prefix });
    await queue.add("lost", { workId: row.id }); await queue.obliterate({ force: true });
    const worker = new Worker("patreon_change_work", (job) => processPatreonChanges(new PatreonChangeWorkStore(second),
      (work) => dispatchVerifiedPatreonPlatformPayload({ creatorId: work.creatorId, campaignId: work.campaignId, resourceId: work.resourceId,
        eventHeader: work.eventType, traceId: "ps10-recovered", syncService: f.b.service, memberCoordinator: {} as never }).then(() => {}), job.data.workId), { connection: redis, prefix });
    try {
      await queue.add("recovery", { workId: row.id });
      await vi.waitFor(async () => expect((await first.patreonChangeWork.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("completed"), { timeout: 10_000 });
      expect((await f.user()).tierIds).toEqual([]); expect((await f.events()).filter((event) => event.eventType === "cancel")).toHaveLength(1);
    } finally { await worker.close(); await queue.obliterate({ force: true }); await queue.close(); await redis.quit(); }
  });
});
