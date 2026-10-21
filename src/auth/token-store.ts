/**
 * @fileoverview Patreon OAuth token persistence: encrypted file store and shared `PatreonTokenStore` interface.
 * @description Mapper between plaintext runtime tokens and AES-GCM ciphertext at rest on disk.
 * @see ./token-store-db.js
 * @see ../lib/crypto.js TokenEncryption
 */

import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import lockfile from "proper-lockfile";
import { TokenEncryption } from "../lib/crypto.js";

/** @description High-level health markers for refresh automation. */
export type CredentialHealthStatus = "healthy" | "refresh_failed";

/**
 * @description Serialized on-disk row for one creator's encrypted tokens + metadata.
 * @security-audit-required Contains ciphertext of Patreon tokens encrypted under `TokenEncryption`.
 */
export type PatreonTokenRecord = {
  creator_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  access_token_expires_at: string;
  provider_user_id?: string;
  credential_health_status: CredentialHealthStatus;
  updated_at: string;
};

type TokenStoreData = {
  records: Record<string, PatreonTokenRecord>;
};

/**
 * @description Decrypted projection returned to callers for Patreon HTTP clients.
 * @security-audit-required Plaintext bearer + refresh secrets; callers must never log or echo these fields.
 */
export type PersistedPatreonTokens = {
  creator_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  provider_user_id?: string;
  credential_health_status: CredentialHealthStatus;
};

/**
 * @description Same surface as `FilePatreonTokenStore` / `DbPatreonTokenStore`.
 * @security-audit-required Implementations must scope reads/writes to the authorized creator.
 */
export interface PatreonTokenStore {
  /** Serialize the read, provider rotation, and write across API/worker processes. */
  updateForCreator(creatorId: string, update: (current: PersistedPatreonTokens | null) => Promise<PersistedPatreonTokens>): Promise<void>;
  /**
   * @description Persists rotated or newly issued tokens.
   * @param tokens Plaintext envelope to encrypt and write.
   * @async
   * @throws {Error} Disk I/O / DB failures from implementations.
   */
  upsert(tokens: PersistedPatreonTokens): Promise<void>;
  /**
   * @description Loads decrypted tokens for a creator, if present.
   * @param creatorId Relay creator id.
   * @returns Tokens or `null`.
   * @async
   * @throws {Error} Read/decrypt failures from implementations.
   */
  getByCreatorId(creatorId: string): Promise<PersistedPatreonTokens | null>;
  /**
   * @description Lists creator ids with stored Patreon OAuth (for unattended incremental sync); sorted.
   * @returns Sorted creator ids.
   * @async
   * @throws {Error} Persistence read failures.
   */
  listCreatorIds(): Promise<string[]>;
}

/**
 * @description JSON file implementation with AES-GCM encryption per field.
 * @security-audit-required Filesystem path must be restricted; payloads are sensitive at rest once decrypted.
 */
export class FilePatreonTokenStore implements PatreonTokenStore {
  private readonly filePath: string;
  private readonly tokenEncryption: TokenEncryption;

  /**
   * @description Binds a JSON path and encryption helper.
   * @param filePath Token store JSON path.
   * @param tokenEncryption Symmetric encryptor matching production key material.
   */
  public constructor(filePath: string, tokenEncryption: TokenEncryption) {
    this.filePath = resolve(filePath);
    this.tokenEncryption = tokenEncryption;
  }

  /**
   * @description Encrypts fields, updates `updated_at`, writes JSON file.
   * @param tokens Plaintext tokens to persist.
   * @async
   * @throws {Error} On `writeFile`/`mkdir` failure or encryption errors.
   */
  public async upsert(tokens: PersistedPatreonTokens): Promise<void> {
    await this.updateForCreator(tokens.creator_id, async () => tokens);
  }

  public async updateForCreator(creatorId: string, update: (current: PersistedPatreonTokens | null) => Promise<PersistedPatreonTokens>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    try {
      if ((await lstat(this.filePath)).isSymbolicLink()) throw new Error("Patreon token store must use its regular file path.");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const release = await lockfile.lock(this.filePath, {
      realpath: false, stale: 60_000, update: 10_000,
      retries: { retries: 65, minTimeout: 100, maxTimeout: 1000, factor: 1.2 }
    });
    try {
      const data = await this.readStore();
      const tokens = await update(await this.getByCreatorId(creatorId));
      if (tokens.creator_id !== creatorId) throw new Error("Patreon token scope mismatch.");
      data.records[tokens.creator_id] = {
        creator_id: tokens.creator_id,
        encrypted_access_token: this.tokenEncryption.encrypt(tokens.access_token),
        encrypted_refresh_token: this.tokenEncryption.encrypt(tokens.refresh_token),
        access_token_expires_at: tokens.access_token_expires_at,
        provider_user_id: tokens.provider_user_id,
        credential_health_status: tokens.credential_health_status,
        updated_at: new Date().toISOString()
      };
      await this.writeStore(data);
    } finally { await release(); }
  }

  /**
   * @description Reads and decrypts a creator row if it exists.
   * @param creatorId Creator key.
   * @returns Decrypted tokens or `null`.
   * @async
   * @throws {Error} On disk read failure or corrupt JSON.
   * @throws {Error} Decryption failures from `TokenEncryption` propagate.
   */
  public async getByCreatorId(creatorId: string): Promise<PersistedPatreonTokens | null> {
    const data = await this.readStore();
    const record = Object.hasOwn(data.records, creatorId) ? data.records[creatorId] : undefined;
    if (!record) {
      return null;
    }

    return {
      creator_id: record.creator_id,
      access_token: this.tokenEncryption.decrypt(record.encrypted_access_token),
      refresh_token: this.tokenEncryption.decrypt(record.encrypted_refresh_token),
      access_token_expires_at: record.access_token_expires_at,
      provider_user_id: record.provider_user_id,
      credential_health_status: record.credential_health_status
    };
  }

  /**
   * @description Returns sorted keys of `records`.
   * @async
   * @throws {Error} On read failure.
   */
  public async listCreatorIds(): Promise<string[]> {
    const data = await this.readStore();
    return Object.keys(data.records).sort();
  }

  private async readStore(): Promise<TokenStoreData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const data = JSON.parse(raw) as TokenStoreData;
      if (!data || !data.records || typeof data.records !== "object" || Array.isArray(data.records)) throw new Error();
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: {} };
      throw new Error("Patreon token store cannot be read; restore it before retrying.");
    }
  }

  private async writeStore(data: TokenStoreData): Promise<void> {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, "wx", 0o600);
      try { await file.writeFile(JSON.stringify(data, null, 2)); await file.sync(); } finally { await file.close(); }
      await rename(temporary, this.filePath);
    } finally { await unlink(temporary).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; }); }
  }
}
