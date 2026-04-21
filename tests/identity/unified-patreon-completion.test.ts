import { describe, expect, it, beforeEach } from "vitest";
import { IdentityService } from "../../src/identity/identity-service.js";
import type { IdentityStore } from "../../src/identity/identity-store.js";
import type {
  IdentityStoreRoot,
  SessionToken,
  UserAccount
} from "../../src/identity/types.js";

/**
 * In-memory store that mirrors `DbIdentityStore`'s patron-merge semantics enough
 * to exercise `IdentityService.completeUnifiedPatreonPatronOAuth`. A single
 * `Account` is keyed by `patreon_user_id`; per-creator memberships fan out via
 * `creator_id`, mimicking `TenantMembership`.
 */
class InMemoryUnifiedStore implements IdentityStore {
  public users = new Map<string, UserAccount>();
  public sessions = new Map<string, SessionToken>();
  public campaignToCreator = new Map<string, string>();
  public createUserCalls: UserAccount[] = [];

  public async load(): Promise<IdentityStoreRoot> {
    const out: IdentityStoreRoot = { users: {}, sessions: {} };
    for (const [k, v] of this.users) out.users[k] = v;
    for (const [k, v] of this.sessions) out.sessions[k] = v;
    return out;
  }
  public async save(): Promise<void> {
    /* noop */
  }
  public async createUser(user: UserAccount): Promise<void> {
    this.createUserCalls.push({ ...user });
    this.users.set(`${user.patreon_user_id ?? user.email}::${user.creator_id}`, user);
  }
  public async findByEmail(email: string, creatorId: string): Promise<UserAccount | null> {
    for (const u of this.users.values()) {
      if (u.email === email.toLowerCase() && u.creator_id === creatorId) return u;
    }
    return null;
  }
  public async findByPatreonId(
    patreonUserId: string,
    creatorId: string
  ): Promise<UserAccount | null> {
    for (const u of this.users.values()) {
      if (u.patreon_user_id === patreonUserId && u.creator_id === creatorId) return u;
    }
    return null;
  }
  public async getUser(userId: string): Promise<UserAccount | null> {
    for (const u of this.users.values()) if (u.user_id === userId) return u;
    return null;
  }
  public async updateTiers(userId: string, tierIds: string[]): Promise<void> {
    for (const [k, u] of this.users) {
      if (u.user_id === userId) {
        this.users.set(k, { ...u, tier_ids: tierIds });
      }
    }
  }
  public async createSession(session: SessionToken): Promise<void> {
    this.sessions.set(session.token, session);
  }
  public async getSession(token: string): Promise<SessionToken | null> {
    return this.sessions.get(token) ?? null;
  }
  public async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }
  public async touchSessionExpiry(): Promise<void> {
    /* extension-only */
  }

  public async findRelayCreatorIdsByPatreonCampaignIds(
    patreonCampaignIds: readonly string[]
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of patreonCampaignIds) {
      const rid = this.campaignToCreator.get(id);
      if (rid) out.set(id, rid);
    }
    return out;
  }
}

describe("IdentityService.completeUnifiedPatreonPatronOAuth", () => {
  let store: InMemoryUnifiedStore;
  let service: IdentityService;

  beforeEach(() => {
    store = new InMemoryUnifiedStore();
    service = new IdentityService(store);
  });

  it("upserts a membership for each on-Relay campaign and issues one session", async () => {
    store.campaignToCreator.set("100", "cr_alpha");
    store.campaignToCreator.set("200", "cr_beta");

    const out = await service.completeUnifiedPatreonPatronOAuth({
      patreonUserId: "u_42",
      email: "multi@example.com",
      ownedCampaignId: null,
      memberships: [
        { patreon_campaign_id: "100", tier_ids: ["patreon_tier_10"], status: "paid" },
        { patreon_campaign_id: "200", tier_ids: ["patreon_tier_20"], status: "paid" }
      ]
    });

    expect(out.linkedRelayCreatorIds.sort()).toEqual(["cr_alpha", "cr_beta"]);
    expect(out.paidMembershipRelayCreatorIds.sort()).toEqual(["cr_alpha", "cr_beta"]);
    expect(out.declinedPatronRelayCreatorIds).toEqual([]);
    expect(out.formerPatronRelayCreatorIds).toEqual([]);
    expect(out.freeFollowerRelayCreatorIds).toEqual([]);
    expect(out.ownedRelayCreatorId).toBeNull();
    expect(out.unmappedPatreonCampaignIds).toEqual([]);
    expect(out.session.token).toMatch(/^sess_/);
    expect(out.session.kind).toBe("web");
    // Two memberships → two `createUser` calls (one per creator scope).
    expect(store.createUserCalls).toHaveLength(2);
    expect(store.createUserCalls.map((u) => u.creator_id).sort()).toEqual([
      "cr_alpha",
      "cr_beta"
    ]);
  });

  it("buckets free_follower / former_patron / declined_patron memberships separately", async () => {
    store.campaignToCreator.set("100", "cr_paid");
    store.campaignToCreator.set("200", "cr_free");
    store.campaignToCreator.set("300", "cr_former");
    store.campaignToCreator.set("400", "cr_declined");

    const out = await service.completeUnifiedPatreonPatronOAuth({
      patreonUserId: "u_mixed",
      email: "mix@example.com",
      ownedCampaignId: null,
      memberships: [
        { patreon_campaign_id: "100", tier_ids: ["patreon_tier_a"], status: "paid" },
        { patreon_campaign_id: "200", tier_ids: [], status: "free_follower" },
        { patreon_campaign_id: "300", tier_ids: [], status: "former_patron" },
        { patreon_campaign_id: "400", tier_ids: [], status: "declined_patron" }
      ]
    });

    expect(out.linkedRelayCreatorIds.sort()).toEqual([
      "cr_declined",
      "cr_former",
      "cr_free",
      "cr_paid"
    ]);
    expect(out.paidMembershipRelayCreatorIds).toEqual(["cr_paid"]);
    expect(out.freeFollowerRelayCreatorIds).toEqual(["cr_free"]);
    expect(out.formerPatronRelayCreatorIds).toEqual(["cr_former"]);
    expect(out.declinedPatronRelayCreatorIds).toEqual(["cr_declined"]);
    // Session-issuing user must be the highest-priority membership (paid), so its
    // tier_ids are non-empty even when free/former are processed later in the loop.
    expect(out.session.tier_ids).toEqual(["patreon_tier_a"]);
  });

  it("issues a session for free-only / former-only patrons (no paid memberships)", async () => {
    store.campaignToCreator.set("777", "cr_free_only");

    const out = await service.completeUnifiedPatreonPatronOAuth({
      patreonUserId: "u_free_only",
      email: "free@example.com",
      ownedCampaignId: null,
      memberships: [
        { patreon_campaign_id: "777", tier_ids: [], status: "free_follower" }
      ]
    });

    expect(out.linkedRelayCreatorIds).toEqual(["cr_free_only"]);
    expect(out.freeFollowerRelayCreatorIds).toEqual(["cr_free_only"]);
    expect(out.paidMembershipRelayCreatorIds).toEqual([]);
    expect(out.session.tier_ids).toEqual([]);
    expect(out.user.tier_ids).toEqual([]);
  });

  it("reports owned_campaign as Relay creator id when CreatorProfile exists", async () => {
    store.campaignToCreator.set("9001", "cr_owner");

    const out = await service.completeUnifiedPatreonPatronOAuth({
      patreonUserId: "u_creator",
      email: "c@x.com",
      ownedCampaignId: "9001",
      memberships: []
    });

    expect(out.ownedRelayCreatorId).toBe("cr_owner");
    // Owned campaign alone does not auto-create a patron membership for that
    // creator — the user is the *owner*, not their own patron.
    expect(out.linkedRelayCreatorIds).toEqual([]);
    // But a session is still issued (platform-scoped Account fallback).
    expect(out.session.token).toMatch(/^sess_/);
  });

  it("reports unmapped Patreon campaign ids for off-Relay creators", async () => {
    store.campaignToCreator.set("100", "cr_alpha");

    const out = await service.completeUnifiedPatreonPatronOAuth({
      patreonUserId: "u_mixed",
      email: "m@x.com",
      ownedCampaignId: "9999",
      memberships: [
        { patreon_campaign_id: "100", tier_ids: ["patreon_tier_a"], status: "paid" },
        { patreon_campaign_id: "200", tier_ids: ["patreon_tier_b"], status: "paid" }
      ]
    });

    expect(out.linkedRelayCreatorIds).toEqual(["cr_alpha"]);
    expect(out.ownedRelayCreatorId).toBeNull();
    expect(out.unmappedPatreonCampaignIds.sort()).toEqual(["200", "9999"]);
  });

  it("still issues a session when the user has zero on-Relay memberships", async () => {
    const out = await service.completeUnifiedPatreonPatronOAuth({
      patreonUserId: "u_lonely",
      email: "l@x.com",
      ownedCampaignId: null,
      memberships: [
        { patreon_campaign_id: "404", tier_ids: ["patreon_tier_x"], status: "paid" }
      ]
    });

    expect(out.linkedRelayCreatorIds).toEqual([]);
    expect(out.unmappedPatreonCampaignIds).toEqual(["404"]);
    expect(out.session.token).toMatch(/^sess_/);
  });

  it("throws when the store lacks `findRelayCreatorIdsByPatreonCampaignIds` (file-backed identity)", async () => {
    class FileLikeStore extends InMemoryUnifiedStore {
      public override findRelayCreatorIdsByPatreonCampaignIds = undefined as unknown as InMemoryUnifiedStore["findRelayCreatorIdsByPatreonCampaignIds"];
    }
    const fileService = new IdentityService(new FileLikeStore());
    await expect(
      fileService.completeUnifiedPatreonPatronOAuth({
        patreonUserId: "u",
        email: "e@x.com",
        ownedCampaignId: null,
        memberships: []
      })
    ).rejects.toThrow(/RELAY_DB_STORE_IDENTITY/);
  });
});
