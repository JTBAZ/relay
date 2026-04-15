import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IdentityStoreRoot, SessionToken, UserAccount } from "./types.js";

function emptyRoot(): IdentityStoreRoot {
  return { users: {}, sessions: {} };
}

/** Same surface as `FileIdentityStore` / `DbIdentityStore` for dependency injection. */
export interface IdentityStore {
  load(): Promise<IdentityStoreRoot>;
  save(root: IdentityStoreRoot): Promise<void>;
  createUser(user: UserAccount): Promise<void>;
  findByEmail(email: string, creatorId: string): Promise<UserAccount | null>;
  findByPatreonId(patreonUserId: string, creatorId: string): Promise<UserAccount | null>;
  getUser(userId: string): Promise<UserAccount | null>;
  updateTiers(userId: string, tierIds: string[]): Promise<void>;
  createSession(session: SessionToken): Promise<void>;
  getSession(token: string): Promise<SessionToken | null>;
  deleteSession(token: string): Promise<void>;
  /** Option B account-first signup (MT-007) — implemented by `DbIdentityStore` only. */
  registerAccountEmailPassword?(email: string, password: string): Promise<UserAccount>;
  loginAccountEmailPassword?(email: string, password: string): Promise<UserAccount>;
}

export class FileIdentityStore implements IdentityStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<IdentityStoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as IdentityStoreRoot;
    } catch {
      return emptyRoot();
    }
  }

  public async save(root: IdentityStoreRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async createUser(user: UserAccount): Promise<void> {
    const root = await this.load();
    root.users[user.user_id] = user;
    await this.save(root);
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
    const root = await this.load();
    const u = root.users[userId];
    if (u) {
      u.tier_ids = tierIds;
      u.updated_at = new Date().toISOString();
      await this.save(root);
    }
  }

  public async createSession(session: SessionToken): Promise<void> {
    const root = await this.load();
    root.sessions[session.token] = session;
    await this.save(root);
  }

  public async getSession(token: string): Promise<SessionToken | null> {
    const root = await this.load();
    const s = root.sessions[token];
    if (!s) return null;
    if (new Date(s.expires_at).getTime() < Date.now()) {
      delete root.sessions[token];
      await this.save(root);
      return null;
    }
    return s;
  }

  public async deleteSession(token: string): Promise<void> {
    const root = await this.load();
    delete root.sessions[token];
    await this.save(root);
  }
}
