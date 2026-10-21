/**
 * @fileoverview File-backed identity store (`identity.json`) and shared `IdentityStore` interface.
 * @description Development / migration fallback without PostgreSQL; does not support unified Patreon OAuth campaign resolution.
 * @see src/jsdoc-core-entities.ts
 */

import { mkdir, readFile, rename, unlink, lstat, open } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
import type { PatreonMemberMutationRunner } from "../patreon/member-reconciliation.js";
import { mergeEntitledTierIdsCrossProvider } from "./patron-entitlement-snapshot.js";
import { dirname } from "node:path";
import { EXTENSION_SESSION_TTL_MS } from "./session-constants.js";
import type { IdentityStoreRoot, SessionToken, UserAccount } from "./types.js";

export type SessionReadOptions = Readonly<{ cleanupExpired?: boolean }>;

function emptyRoot(): IdentityStoreRoot {
  return { users: {}, sessions: {} };
}

/** Same surface as `FileIdentityStore` / `DbIdentityStore` for dependency injection. */
export interface IdentityStore {
  capturePatreonObservation?(): Promise<string>;
  registerPatreonUser?(creatorId: string, userId: string, email: string, tiers: string[], observation?: string, campaignScope?: string): Promise<UserAccount>;
  readonly supportsSharedPatreonMembers?: boolean;
  mutatePatreonMembers?: PatreonMemberMutationRunner;
  load(): Promise<IdentityStoreRoot>;
  save(root: IdentityStoreRoot): Promise<void>;
  createUser(user: UserAccount): Promise<void>;
  findByEmail(email: string, creatorId: string): Promise<UserAccount | null>;
  findByPatreonId(patreonUserId: string, creatorId: string): Promise<UserAccount | null>;
  getUser(userId: string): Promise<UserAccount | null>;
  updateTiers(userId: string, tierIds: string[]): Promise<void>;
  createSession(session: SessionToken): Promise<void>;
  getSession(token: string, options?: SessionReadOptions): Promise<SessionToken | null>;
  deleteSession(token: string): Promise<void>;
  /** Sliding TTL for `kind === "extension"` only; no-op for web. */
  touchSessionExpiry(token: string): Promise<void>;
  /** Option B account-first signup (MT-007) — implemented by `DbIdentityStore` only. */
  registerAccountEmailPassword?(email: string, password: string): Promise<UserAccount>;
  loginAccountEmailPassword?(email: string, password: string): Promise<UserAccount>;
  /**
   * PE-A: resolve `patreonCampaignId → relayCreatorId` for the campaigns a unified
   * Patreon OAuth identity touches (memberships + owned). Campaigns not on Relay
   * are absent from the returned map. `DbIdentityStore` only.
   */
  findRelayCreatorIdsByPatreonCampaignIds?(
    patreonCampaignIds: readonly string[]
  ): Promise<Map<string, string>>;
}

/**
 * @description JSON-backed identity document for local dev and migration.
 */
export class FileIdentityStore implements IdentityStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<IdentityStoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const root = JSON.parse(raw) as IdentityStoreRoot;
      const map = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
      if (!map(root) || !map(root.users) || !map(root.sessions)) throw new Error("Invalid identity document.");
      const tiers = (value: unknown) => Array.isArray(value) && value.every((id) => typeof id === "string");
      for (const [id, user] of Object.entries(root.users)) if (!map(user) || user.user_id !== id || typeof user.creator_id !== "string" || !tiers(user.tier_ids)) throw new Error("Invalid identity user.");
      for (const [token, session] of Object.entries(root.sessions)) if (!map(session) || session.token !== token || typeof session.user_id !== "string" || typeof session.creator_id !== "string" || !tiers(session.tier_ids) || typeof session.expires_at !== "string" || !Number.isFinite(Date.parse(session.expires_at))) throw new Error("Invalid identity session.");
      return root;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyRoot();
      throw new Error("Identity storage is unreadable or corrupt.");
    }
  }

  private async write(root: IdentityStoreRoot): Promise<void> {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(root, null, 2), "utf8"); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, this.filePath);
    } finally { await unlink(temporary).catch(() => {}); }
  }

  private async mutate<T>(fn: (root: IdentityStoreRoot) => Promise<T>): Promise<T> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const info = await lstat(this.filePath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return null; });
    if (info?.isSymbolicLink()) throw new Error("Identity storage cannot be a symbolic link.");
    const release = await lockfile.lock(this.filePath, { realpath: false, stale: 30_000, retries: { retries: 100, minTimeout: 10, maxTimeout: 100 } });
    try { const root = await this.load(); const result = await fn(root); await this.write(root); return result; }
    finally { await release(); }
  }

  public async save(root: IdentityStoreRoot): Promise<void> {
    await this.mutate(async (current) => { Object.assign(current, root); });
  }

  public async capturePatreonObservation(): Promise<string> {
    return this.mutate(async (root) => { root.patreon_observation = (root.patreon_observation ?? 0) + 1; return String(root.patreon_observation); });
  }

  public async registerPatreonUser(creatorId: string, id: string, email: string, tiers: string[], observation?: string, campaignScope?: string): Promise<UserAccount> {
    return this.mutatePatreonMembers(creatorId, "oauth", async (tx) => {
      await tx.saveUser(id, tiers, observation, email);
      return (await tx.user(id))!;
    }, { campaignScope });
  }

  public readonly supportsSharedPatreonMembers = false;
  public readonly mutatePatreonMembers: PatreonMemberMutationRunner = async (creatorId, campaignId, operation, options) => this.mutate(async (root) => {
    const prefix = JSON.stringify([creatorId, campaignId]);
    const members = root.patreon_members ??= {};
    const rosters = root.patreon_rosters ??= {};
    const memberKey = (id: string) => JSON.stringify([creatorId, campaignId, id]);
    const findUser = (id: string) => Object.values(root.users).find((user) => user.creator_id === creatorId && user.patreon_user_id === id) ?? null;
    return operation({
      member: async (id) => members[memberKey(id)] ?? null,
      saveMember: async (value) => { members[memberKey(value.memberId)] = value; },
      roster: async () => rosters[prefix] ?? null,
      saveRoster: async (value) => { rosters[prefix] = value; },
      absent: async (scanId, limit) => Object.entries(members).filter(([key, value]) => key.startsWith(prefix.slice(0, -1) + ",") && value.seenScanId !== scanId).slice(0, limit).map(([, value]) => value),
      unmapped: async () => Object.values(root.users).filter((user) => user.creator_id === creatorId && user.patreon_user_id && user.tier_ids.some((id) => id.startsWith("patreon_tier_") &&
        !Object.entries(members).some(([key, member]) => JSON.parse(key)[0] === creatorId && member.userId === user.patreon_user_id && member.tiers.includes(id)))).length,
      user: async (id) => findUser(id),
      saveUser: async (id, tiers, observation, email) => {
        let user = findUser(id);
        if (!user) {
          const now = new Date().toISOString();
          user = { user_id: `usr_${randomUUID()}`, creator_id: creatorId, patreon_user_id: id, email: email?.trim().toLowerCase() || `patreon_${id}@relay.local`,
            password_hash: "", auth_provider: "patreon", tier_ids: [], created_at: now, updated_at: now };
          root.users[user.user_id] = user;
        }
        const token = observation ?? String(root.patreon_observation = (root.patreon_observation ?? 0) + 1);
        if (BigInt(user.patreon_observation ?? "0") > BigInt(token)) throw new Error("Patreon identity changed during collection; retry required.");
        user.patreon_observation = token;
        const owned = new Set(Object.entries(members).filter(([key, member]) => {
          const [creator, campaign] = JSON.parse(key); return creator === creatorId && campaign === options?.campaignScope && member.userId === id;
        }).flatMap(([, member]) => member.tiers));
        const retained = options?.campaignScope ? user.tier_ids.filter((tier) => tier.startsWith("patreon_tier_") && !owned.has(tier)) : [];
        user.tier_ids = mergeEntitledTierIdsCrossProvider(user.tier_ids, [...retained, ...tiers.filter((tier) => tier.startsWith("patreon_tier_"))], "patreon");
        user.updated_at = new Date().toISOString();
        for (const session of Object.values(root.sessions)) if (session.user_id === user.user_id) session.tier_ids = [...user.tier_ids];
      },
      tierAmounts: async () => new Map(),
      ledger: async (events) => {
        const ledger = root.patreon_member_events ??= {};
        for (const event of events) ledger[event.dedupeKey!] ??= { ...event, occurredAt: event.occurredAt.toISOString() };
      }
    });
  });

  public async createUser(user: UserAccount): Promise<void> {
    await this.mutate(async (root) => { root.users[user.user_id] = user; });
  }

  public async findByEmail(
    email: string,
    creatorId: string
  ): Promise<UserAccount | null> {
    const root = await this.load();
    return (
      Object.values(root.users).find(
        (u) =>
          u.email.toLowerCase() === email.toLowerCase() &&
          u.creator_id === creatorId
      ) ?? null
    );
  }

  public async findByPatreonId(
    patreonUserId: string,
    creatorId: string
  ): Promise<UserAccount | null> {
    const root = await this.load();
    return (
      Object.values(root.users).find(
        (u) =>
          u.patreon_user_id === patreonUserId && u.creator_id === creatorId
      ) ?? null
    );
  }

  public async getUser(userId: string): Promise<UserAccount | null> {
    const root = await this.load();
    return root.users[userId] ?? null;
  }

  public async updateTiers(
    userId: string,
    tierIds: string[]
  ): Promise<void> {
    await this.mutate(async (root) => {
      const u = root.users[userId];
      if (!u) return;
      u.tier_ids = tierIds;
      u.updated_at = new Date().toISOString();
      for (const session of Object.values(root.sessions)) if (session.user_id === userId) session.tier_ids = [...tierIds];
    });
  }

  public async createSession(session: SessionToken): Promise<void> {
    await this.mutate(async (root) => { root.sessions[session.token] = session; });
  }

  public async getSession(token: string, options?: SessionReadOptions): Promise<SessionToken | null> {
    const root = await this.load();
    const s = root.sessions[token];
    if (!s) return null;
    if (new Date(s.expires_at).getTime() < Date.now()) {
      if (options?.cleanupExpired !== false) {
        return this.mutate(async (current) => {
          const latest = current.sessions[token];
          if (latest && new Date(latest.expires_at).getTime() >= Date.now()) return { ...latest, tier_ids: [...(current.users[latest.user_id]?.tier_ids ?? [])] };
          delete current.sessions[token]; return null;
        });
      }
      return null;
    }
    return { ...s, tier_ids: [...(root.users[s.user_id]?.tier_ids ?? [])] };
  }

  public async deleteSession(token: string): Promise<void> {
    await this.mutate(async (root) => { delete root.sessions[token]; });
  }

  public async touchSessionExpiry(token: string): Promise<void> {
    await this.mutate(async (root) => {
      const s = root.sessions[token];
      if (!s || s.kind !== "extension") return;
      const now = Date.now();
      s.last_used_at = new Date(now).toISOString();
      s.expires_at = new Date(now + EXTENSION_SESSION_TTL_MS).toISOString();
    });
  }
}
