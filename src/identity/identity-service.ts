import { randomUUID } from "node:crypto";
import type { IdentityStore } from "./identity-store.js";
import { hashPassword, verifyPassword } from "./password.js";
import { EXTENSION_SESSION_TTL_MS, WEB_SESSION_TTL_MS } from "./session-constants.js";
import type { SessionToken, UserAccount } from "./types.js";
import type { PatreonMembershipCategory } from "../patreon/patreon-user-identity.js";

/** Input shape for {@link IdentityService.completeUnifiedPatreonPatronOAuth}. */
export type UnifiedPatreonMembershipInput = {
  patreon_campaign_id: string;
  tier_ids: string[];
  status: PatreonMembershipCategory;
};

/**
 * Choose which membership backs the issued session: paid > declined > former > free follower.
 * Keeps `session.tier_ids` non-empty when at least one paid relationship exists, regardless of
 * iteration order over `memberships`.
 */
const MEMBERSHIP_SESSION_PRIORITY: Record<PatreonMembershipCategory, number> = {
  paid: 4,
  declined_patron: 3,
  former_patron: 2,
  free_follower: 1
};

export class IdentityService {
  private readonly store: IdentityStore;

  public constructor(store: IdentityStore) {
    this.store = store;
  }

  /** `DbIdentityStore` implements account-first email/password (MT-007). */
  public supportsAccountScopedEmailAuth(): boolean {
    return typeof this.store.registerAccountEmailPassword === "function";
  }

  /**
   * Option B — create global `Account` + platform `TenantMembership` without a fan `creator_id`.
   * Uses reserved platform tenant (`getPlatformRelayCreatorId` / `RELAY_PLATFORM_CREATOR_ID`).
   */
  public async registerAccount(email: string, password: string): Promise<UserAccount> {
    if (!this.store.registerAccountEmailPassword) {
      throw new Error(
        "Account-scoped email/password auth requires RELAY_DB_STORE_IDENTITY with PostgreSQL."
      );
    }
    return this.store.registerAccountEmailPassword(email, password);
  }

  public async loginAccount(email: string, password: string): Promise<SessionToken> {
    if (!this.store.loginAccountEmailPassword) {
      throw new Error(
        "Account-scoped email/password auth requires RELAY_DB_STORE_IDENTITY with PostgreSQL."
      );
    }
    const user = await this.store.loginAccountEmailPassword(email, password);
    return this.createSessionForUser(user);
  }

  /** Opaque Bearer session for a verified `UserAccount` (e.g. immediately after `registerAccount`). */
  public async issueSessionForUser(user: UserAccount): Promise<SessionToken> {
    return this.createSessionForUser(user);
  }

  /** True when `DbIdentityStore.ensurePlatformPatronUserForAccount` exists (PostgreSQL identity). */
  public supportsRelaySessionBridge(): boolean {
    const s = this.store as { ensurePlatformPatronUserForAccount?: (id: string) => Promise<UserAccount> };
    return typeof s.ensurePlatformPatronUserForAccount === "function";
  }

  /**
   * MT-033: Opaque Relay patron session for a Prisma `Account` id (after Supabase JWT sync).
   * Same token contract as `POST /api/v1/auth/login`.
   */
  public async issueRelaySessionForAccount(accountId: string): Promise<SessionToken> {
    const s = this.store as { ensurePlatformPatronUserForAccount?: (id: string) => Promise<UserAccount> };
    if (typeof s.ensurePlatformPatronUserForAccount !== "function") {
      throw new Error("Relay session bridge requires RELAY_DB_STORE_IDENTITY with PostgreSQL.");
    }
    const user = await s.ensurePlatformPatronUserForAccount(accountId);
    return this.issueSessionForUser(user);
  }

  /** Extension grant after consent exchange — `Session.kind === extension`, sliding TTL. */
  public async issueExtensionSessionForAccount(
    accountId: string,
    label: string
  ): Promise<SessionToken> {
    const s = this.store as { ensurePlatformPatronUserForAccount?: (id: string) => Promise<UserAccount> };
    if (typeof s.ensurePlatformPatronUserForAccount !== "function") {
      throw new Error("Extension session issuance requires RELAY_DB_STORE_IDENTITY with PostgreSQL.");
    }
    const user = await s.ensurePlatformPatronUserForAccount(accountId);
    return this.issueExtensionSession(user, label);
  }

  public async register(
    creatorId: string,
    email: string,
    password: string,
    tierIds: string[]
  ): Promise<UserAccount> {
    const existing = await this.store.findByEmail(email, creatorId);
    if (existing) {
      throw new Error("Account with this email already exists.");
    }
    const now = new Date().toISOString();
    const user: UserAccount = {
      user_id: `usr_${randomUUID()}`,
      creator_id: creatorId,
      email: email.toLowerCase().trim(),
      password_hash: hashPassword(password),
      auth_provider: "independent",
      tier_ids: tierIds,
      created_at: now,
      updated_at: now
    };
    await this.store.createUser(user);
    return user;
  }

  public async registerPatreonFallback(
    creatorId: string,
    patreonUserId: string,
    email: string,
    tierIds: string[]
  ): Promise<UserAccount> {
    const existing = await this.store.findByPatreonId(patreonUserId, creatorId);
    if (existing) {
      await this.store.updateTiers(existing.user_id, tierIds);
      return { ...existing, tier_ids: tierIds };
    }
    const now = new Date().toISOString();
    const user: UserAccount = {
      user_id: `usr_${randomUUID()}`,
      creator_id: creatorId,
      email: email.toLowerCase().trim(),
      password_hash: "",
      auth_provider: "patreon",
      patreon_user_id: patreonUserId,
      tier_ids: tierIds,
      created_at: now,
      updated_at: now
    };
    await this.store.createUser(user);
    return user;
  }

  public async login(
    creatorId: string,
    email: string,
    password: string
  ): Promise<SessionToken> {
    const user = await this.store.findByEmail(email, creatorId);
    if (!user) {
      throw new Error("Invalid credentials.");
    }
    if (user.auth_provider === "patreon" && !user.password_hash) {
      throw new Error("This account uses Patreon login. Set a password first.");
    }
    if (!verifyPassword(password, user.password_hash)) {
      throw new Error("Invalid credentials.");
    }
    return this.createSessionForUser(user);
  }

  public async loginPatreonFallback(
    creatorId: string,
    patreonUserId: string
  ): Promise<SessionToken> {
    const user = await this.store.findByPatreonId(patreonUserId, creatorId);
    if (!user) {
      throw new Error("Patreon account not linked.");
    }
    return this.createSessionForUser(user);
  }

  /**
   * After Patreon patron OAuth: upsert user + `tier_ids` from identity, then session.
   * Matches `registerPatreonFallback` + session issuance in one step.
   * With **`DbIdentityStore`**, also materializes **`PatronEntitlementSnapshot`** (MIG-40).
   */
  public async completePatreonPatronOAuth(
    creatorId: string,
    patreonUserId: string,
    email: string,
    tierIds: string[]
  ): Promise<{ user: UserAccount; session: SessionToken }> {
    const user = await this.registerPatreonFallback(
      creatorId,
      patreonUserId,
      email,
      tierIds
    );
    const session = await this.createSessionForUser(user);
    return { user, session };
  }

  /**
   * PE-A — Unified Patreon OAuth completion. One round-trip, both lenses:
   *   - Upserts a patron `TenantMembership` for every active membership whose
   *     Patreon campaign is on Relay (reuses the same merge + snapshot path as
   *     `completePatreonPatronOAuth`, just iterated).
   *   - Reports the user's owned Patreon `campaign_id` and, when that campaign
   *     already has a `CreatorProfile` on Relay, the resolved `relayCreatorId`.
   *     **Does not** claim creator role automatically — callers surface a modal
   *     so the user can connect (or ignore) explicitly.
   *   - Issues a single web session for the resolved Account.
   *
   * Requires `DbIdentityStore` (the file store has no `CreatorProfile` lookup);
   * with file-backed identity, only memberships explicitly resolvable to a
   * Relay creator id by the caller can be processed via the legacy single-creator
   * path.
   */
  public async completeUnifiedPatreonPatronOAuth(args: {
    patreonUserId: string;
    email: string;
    ownedCampaignId: string | null;
    memberships: ReadonlyArray<UnifiedPatreonMembershipInput>;
  }): Promise<{
    user: UserAccount;
    session: SessionToken;
    /**
     * Relay `creator_id`s for *every* membership upserted on this call (paid + declined +
     * former + free follower). Use the per-status arrays below for targeted UX (e.g. revival
     * offers for `formerPatronRelayCreatorIds`, "free follower" badges for
     * `freeFollowerRelayCreatorIds`).
     */
    linkedRelayCreatorIds: string[];
    /** Subset of `linkedRelayCreatorIds` whose membership is `paid` (`active_patron`). */
    paidMembershipRelayCreatorIds: string[];
    /** Subset whose membership is `declined_patron` (recent payment failure). */
    declinedPatronRelayCreatorIds: string[];
    /** Subset whose membership is `former_patron` (cancelled — eligible for revival offers). */
    formerPatronRelayCreatorIds: string[];
    /** Subset whose membership is `free_follower` (`patron_status === null`). */
    freeFollowerRelayCreatorIds: string[];
    /** Resolved Relay `creator_id` for the user's owned Patreon campaign, if matched. */
    ownedRelayCreatorId: string | null;
    /** Patreon `campaign_id`s (memberships + owned) that have no `CreatorProfile` on Relay yet. */
    unmappedPatreonCampaignIds: string[];
  }> {
    const storeWithLookup = this.store as IdentityStore & {
      findRelayCreatorIdsByPatreonCampaignIds?: (
        ids: readonly string[]
      ) => Promise<Map<string, string>>;
    };
    if (typeof storeWithLookup.findRelayCreatorIdsByPatreonCampaignIds !== "function") {
      throw new Error(
        "Unified Patreon OAuth requires RELAY_DB_STORE_IDENTITY with PostgreSQL (no CreatorProfile lookup in file store)."
      );
    }

    const allCampaignIds = new Set<string>();
    for (const m of args.memberships) {
      if (m.patreon_campaign_id) allCampaignIds.add(m.patreon_campaign_id);
    }
    if (args.ownedCampaignId) allCampaignIds.add(args.ownedCampaignId);

    const map = await storeWithLookup.findRelayCreatorIdsByPatreonCampaignIds([
      ...allCampaignIds
    ]);

    const linkedRelayCreatorIds: string[] = [];
    const paidMembershipRelayCreatorIds: string[] = [];
    const declinedPatronRelayCreatorIds: string[] = [];
    const formerPatronRelayCreatorIds: string[] = [];
    const freeFollowerRelayCreatorIds: string[] = [];
    let lastUser: UserAccount | null = null;
    /**
     * Prefer the highest-priority membership when issuing the session — keeps `session.tier_ids`
     * non-empty whenever the patron has at least one paid membership, instead of whichever
     * membership happened to come last in iteration order (free follower / former patron will
     * always have empty `tier_ids`).
     */
    let lastUserPriority = -1;

    for (const m of args.memberships) {
      const relayCreatorId = map.get(m.patreon_campaign_id);
      if (!relayCreatorId) continue;
      // Reuses `DbIdentityStore.createUser` merge-by-patreon-id-or-email logic
      // and `upsertPatronEntitlementSnapshotForOAuth` (MIG-40) under the hood.
      const user = await this.registerPatreonFallback(
        relayCreatorId,
        args.patreonUserId,
        args.email,
        m.tier_ids
      );
      linkedRelayCreatorIds.push(relayCreatorId);
      switch (m.status) {
        case "paid":
          paidMembershipRelayCreatorIds.push(relayCreatorId);
          break;
        case "declined_patron":
          declinedPatronRelayCreatorIds.push(relayCreatorId);
          break;
        case "former_patron":
          formerPatronRelayCreatorIds.push(relayCreatorId);
          break;
        case "free_follower":
          freeFollowerRelayCreatorIds.push(relayCreatorId);
          break;
      }
      const priority = MEMBERSHIP_SESSION_PRIORITY[m.status];
      if (priority > lastUserPriority) {
        lastUser = user;
        lastUserPriority = priority;
      }
    }

    if (!lastUser) {
      // No on-Relay memberships — still bootstrap a platform-scoped Account so
      // the user has a session and can browse/onboard. Uses the same merge path
      // by going through `registerPatreonFallback` with the platform creator id.
      const { getPlatformRelayCreatorId } = await import(
        "./platform-tenant.js"
      );
      lastUser = await this.registerPatreonFallback(
        getPlatformRelayCreatorId(),
        args.patreonUserId,
        args.email,
        []
      );
    }

    const session = await this.createSessionForUser(lastUser);
    const ownedRelayCreatorId = args.ownedCampaignId
      ? map.get(args.ownedCampaignId) ?? null
      : null;
    const unmappedPatreonCampaignIds = [...allCampaignIds].filter(
      (id) => !map.has(id)
    );

    return {
      user: lastUser,
      session,
      linkedRelayCreatorIds,
      paidMembershipRelayCreatorIds,
      declinedPatronRelayCreatorIds,
      formerPatronRelayCreatorIds,
      freeFollowerRelayCreatorIds,
      ownedRelayCreatorId,
      unmappedPatreonCampaignIds
    };
  }

  public async resolveSession(
    token: string
  ): Promise<SessionToken | null> {
    return this.store.getSession(token);
  }

  public async logout(token: string): Promise<void> {
    await this.store.deleteSession(token);
  }

  /**
   * Browser extension opaque grant after consent (Phase 0.C). Sliding 30d TTL via
   * {@link touchSessionExpiry} on each successful resolution.
   */
  public async issueExtensionSession(
    user: UserAccount,
    label: string
  ): Promise<SessionToken> {
    const now = Date.now();
    const session: SessionToken = {
      token: `sess_${randomUUID()}`,
      user_id: user.user_id,
      creator_id: user.creator_id,
      tier_ids: [...user.tier_ids],
      expires_at: new Date(now + EXTENSION_SESSION_TTL_MS).toISOString(),
      kind: "extension",
      label: label.trim() || null,
      last_used_at: new Date(now).toISOString()
    };
    await this.store.createSession(session);
    return session;
  }

  /** Renew extension session window; no-op for web sessions. */
  public async touchSessionExpiry(token: string): Promise<void> {
    await this.store.touchSessionExpiry(token);
  }

  private async createSessionForUser(user: UserAccount): Promise<SessionToken> {
    const session: SessionToken = {
      token: `sess_${randomUUID()}`,
      user_id: user.user_id,
      creator_id: user.creator_id,
      tier_ids: [...user.tier_ids],
      expires_at: new Date(Date.now() + WEB_SESSION_TTL_MS).toISOString(),
      kind: "web"
    };
    await this.store.createSession(session);
    return session;
  }
}
