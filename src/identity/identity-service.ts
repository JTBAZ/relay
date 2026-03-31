import { randomUUID } from "node:crypto";
import type { FileIdentityStore } from "./identity-store.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { SessionToken, UserAccount } from "./types.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export class IdentityService {
  private readonly store: FileIdentityStore;

  public constructor(store: FileIdentityStore) {
    this.store = store;
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

  public async resolveSession(
    token: string
  ): Promise<SessionToken | null> {
    return this.store.getSession(token);
  }

  public async logout(token: string): Promise<void> {
    await this.store.deleteSession(token);
  }

  private async createSessionForUser(user: UserAccount): Promise<SessionToken> {
    const session: SessionToken = {
      token: `sess_${randomUUID()}`,
      user_id: user.user_id,
      creator_id: user.creator_id,
      tier_ids: [...user.tier_ids],
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    };
    await this.store.createSession(session);
    return session;
  }
}
