/**
 * @fileoverview Encrypted JSON persistence for Patreon browser session cookies keyed by creator id.
 * @description Tracks local TTL, encrypted session material, and optional remote rejection markers for scrapers.
 * @see ../lib/crypto.js TokenEncryption
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { TokenEncryption } from "../lib/crypto.js";

/** @description One creator's encrypted Patreon session cookie row on disk. */
export type PatreonCookieRecord = {
  creator_id: string;
  encrypted_session_id: string;
  stored_at: string;
};

/** @description Local TTL view without decrypting session material. */
export type CookieSessionLocalStatus = "none" | "ok" | "expired_local";

type CookieStoreData = {
  records: Record<string, PatreonCookieRecord>;
  /** Set when Patreon returns 401/403 during cookie scrape; cleared on upsert or voluntary delete. */
  last_remote_rejections?: Record<string, { at: string }>;
};

/** @description Optional tuning for max age of stored sessions. */
export type FilePatreonCookieStoreOptions = {
  /** Drop stored session after this many days (from `stored_at`). Default 90. */
  maxAgeDays?: number;
};

/**
 * @description File-backed cookie vault with encryption and rejection markers for Patreon scraping flows.
 * @security-audit-required Session identifiers are bearer-equivalent once decrypted; restrict filesystem access and gate by authenticated creator id.
 */
export class FilePatreonCookieStore {
  private readonly filePath: string;
  private readonly encryption: TokenEncryption;
  private readonly maxAgeMs: number;

  /**
   * @description Binds path, cipher, and optional max age policy.
   * @param filePath Cookie JSON path.
   * @param encryption Token encryption helper reused for cookie blobs.
   * @param options Optional `maxAgeDays` (defaults 90).
   */
  public constructor(
    filePath: string,
    encryption: TokenEncryption,
    options?: FilePatreonCookieStoreOptions
  ) {
    this.filePath = filePath;
    this.encryption = encryption;
    const days = options?.maxAgeDays ?? 90;
    this.maxAgeMs = Math.max(1, days) * 24 * 60 * 60 * 1000;
  }

  private isExpired(storedAt: string): boolean {
    const t = Date.parse(storedAt);
    if (!Number.isFinite(t)) return true;
    return Date.now() - t > this.maxAgeMs;
  }

  /**
   * Whether a row exists and is within TTL. Does not read/decrypt the session id.
   * Use before `getSessionId` when you need to distinguish expired vs missing.
   * @param creatorId Creator scope.
   * @returns Local presence/TTL status.
   * @async
   * @throws {Error} On JSON file read failure (non-missing).
   */
  public async getCookieLocalStatus(creatorId: string): Promise<CookieSessionLocalStatus> {
    const data = await this.readStore();
    const record = data.records[creatorId];
    if (!record) return "none";
    if (this.isExpired(record.stored_at)) return "expired_local";
    return "ok";
  }

  /**
   * @description Returns whether Patreon signaled rejection for this creator (marker only).
   * @param creatorId Creator scope.
   * @async
   * @throws {Error} On read failures.
   */
  public async hasRemoteRejectionMarker(creatorId: string): Promise<boolean> {
    const data = await this.readStore();
    return Boolean(data.last_remote_rejections?.[creatorId]);
  }

  /**
   * Drop rejection marker only (e.g. stale flag while a valid session exists).
   * @param creatorId Creator scope.
   * @async
   * @throws {Error} On read/write failures.
   */
  public async clearPatreonRejectedSession(creatorId: string): Promise<void> {
    const data = await this.readStore();
    if (!data.last_remote_rejections?.[creatorId]) return;
    delete data.last_remote_rejections[creatorId];
    await this.writeStore(data);
  }

  /**
   * After Patreon rejects the session (401/403). Session row should already be dropped.
   * @param creatorId Creator scope.
   * @async
   * @throws {Error} On read/write failures.
   */
  public async markPatreonRejectedSession(creatorId: string): Promise<void> {
    const data = await this.readStore();
    if (!data.last_remote_rejections) data.last_remote_rejections = {};
    data.last_remote_rejections[creatorId] = { at: new Date().toISOString() };
    await this.writeStore(data);
  }

  /**
   * Remove encrypted session only (e.g. TTL purge, or before setting rejection marker).
   * @param creatorId Creator scope.
   * @returns Whether a row was removed.
   * @async
   * @throws {Error} On read/write failures.
   */
  public async dropSessionRecord(creatorId: string): Promise<boolean> {
    const data = await this.readStore();
    if (!data.records[creatorId]) return false;
    delete data.records[creatorId];
    await this.writeStore(data);
    return true;
  }

  /**
   * @description Encrypts and stores a session id, clearing any rejection marker for the creator.
   * @param creatorId Creator scope.
   * @param sessionId Raw session secret to encrypt.
   * @async
   * @throws {Error} On write/encrypt failure.
   */
  public async upsert(creatorId: string, sessionId: string): Promise<void> {
    const data = await this.readStore();
    data.records[creatorId] = {
      creator_id: creatorId,
      encrypted_session_id: this.encryption.encrypt(sessionId),
      stored_at: new Date().toISOString()
    };
    if (data.last_remote_rejections?.[creatorId]) {
      delete data.last_remote_rejections[creatorId];
    }
    await this.writeStore(data);
  }

  /**
   * @description Decrypts session id when present and not expired; drops expired rows opportunistically.
   * @param creatorId Creator scope.
   * @returns Decrypted session or `null`.
   * @async
   * @throws {Error} Decryption failure or unexpected I/O beyond missing file handling.
   */
  public async getSessionId(creatorId: string): Promise<string | null> {
    const data = await this.readStore();
    const record = data.records[creatorId];
    if (!record) return null;
    if (this.isExpired(record.stored_at)) {
      delete data.records[creatorId];
      await this.writeStore(data);
      return null;
    }
    return this.encryption.decrypt(record.encrypted_session_id);
  }

  /**
   * Voluntary removal: session row and any rejection marker.
   * @param creatorId Creator scope.
   * @returns Whether any state existed before removal.
   * @async
   * @throws {Error} On read/write failures.
   */
  public async remove(creatorId: string): Promise<boolean> {
    const data = await this.readStore();
    const had = Boolean(data.records[creatorId] || data.last_remote_rejections?.[creatorId]);
    delete data.records[creatorId];
    if (data.last_remote_rejections?.[creatorId]) {
      delete data.last_remote_rejections[creatorId];
    }
    await this.writeStore(data);
    return had;
  }

  private async readStore(): Promise<CookieStoreData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as CookieStoreData;
    } catch {
      return { records: {} };
    }
  }

  private async writeStore(data: CookieStoreData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}
