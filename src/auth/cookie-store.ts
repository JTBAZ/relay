/**
 * Encrypted Patreon session vault; shared transitions for local and database persistence.
 * @security-audit-required Browser sessions are bearer credentials. Callers must authorize the creator scope.
 */
import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import lockfile from "proper-lockfile";
import { TokenEncryption } from "../lib/crypto.js";
import { createExclusivePerKeyRunner } from "../lib/run-exclusive-per-key.js";

export type PatreonCookieRecord = { creator_id: string; encrypted_session_id: string; stored_at: string };
export type CookieSessionLocalStatus = "none" | "ok" | "expired_local";
export type CookieStoreData = {
  records: Record<string, PatreonCookieRecord>;
  last_remote_rejections?: Record<string, { at: string }>;
};
export type CookieState = { record?: PatreonCookieRecord; rejectedAt?: string };
export type FilePatreonCookieStoreOptions = { maxAgeDays?: number };

export interface PatreonCookieStore {
  getCookieLocalStatus(creatorId: string): Promise<CookieSessionLocalStatus>;
  getSessionId(creatorId: string): Promise<string | null>;
  upsert(creatorId: string, sessionId: string): Promise<void>;
  remove(creatorId: string): Promise<boolean>;
  dropSessionRecord(creatorId: string): Promise<boolean>;
  hasRemoteRejectionMarker(creatorId: string): Promise<boolean>;
  clearPatreonRejectedSession(creatorId: string, expectedSessionId?: string): Promise<void>;
  markPatreonRejectedSession(creatorId: string, expectedSessionId?: string): Promise<void>;
}

/** Each adapter serializes a creator's read/transition/write before releasing its lock. */
export abstract class PatreonCookieVault implements PatreonCookieStore {
  private readonly maxAgeMs: number;
  protected constructor(protected readonly encryption: TokenEncryption, options?: FilePatreonCookieStoreOptions) {
    this.maxAgeMs = Math.max(1, options?.maxAgeDays ?? 90) * 86_400_000;
  }
  protected abstract readState(creatorId: string): Promise<CookieState>;
  protected abstract mutateState<T>(creatorId: string, fn: (state: CookieState) => T): Promise<T>;
  private isExpired(record: PatreonCookieRecord): boolean {
    const time = Date.parse(record.stored_at);
    return !Number.isFinite(time) || Date.now() - time > this.maxAgeMs;
  }
  public async getCookieLocalStatus(creatorId: string): Promise<CookieSessionLocalStatus> {
    const state = await this.readState(creatorId);
    if (!state.record || state.rejectedAt) return "none";
    return this.isExpired(state.record) ? "expired_local" : "ok";
  }
  public async getSessionId(creatorId: string): Promise<string | null> {
    const state = await this.readState(creatorId);
    if (!state.record || state.rejectedAt) return null;
    if (this.isExpired(state.record)) {
      await this.mutateState(creatorId, (current) => {
        if (current.record?.encrypted_session_id === state.record!.encrypted_session_id &&
          current.record.stored_at === state.record!.stored_at) delete current.record;
      });
      return null;
    }
    return this.encryption.decrypt(state.record.encrypted_session_id);
  }
  public async upsert(creatorId: string, sessionId: string): Promise<void> {
    await this.mutateState(creatorId, (state) => {
      state.record = { creator_id: creatorId, encrypted_session_id: this.encryption.encrypt(sessionId), stored_at: new Date().toISOString() };
      delete state.rejectedAt;
    });
  }
  public async hasRemoteRejectionMarker(creatorId: string): Promise<boolean> {
    return Boolean((await this.readState(creatorId)).rejectedAt);
  }
  public async clearPatreonRejectedSession(creatorId: string, expectedSessionId?: string): Promise<void> {
    await this.mutateState(creatorId, (state) => {
      if (expectedSessionId !== undefined && (!state.record || this.encryption.decrypt(state.record.encrypted_session_id) !== expectedSessionId)) return;
      delete state.rejectedAt;
    });
  }
  public async markPatreonRejectedSession(creatorId: string, expectedSessionId?: string): Promise<void> {
    await this.mutateState(creatorId, (state) => {
      if (expectedSessionId !== undefined && (!state.record || this.encryption.decrypt(state.record.encrypted_session_id) !== expectedSessionId)) return;
      delete state.record;
      state.rejectedAt = new Date().toISOString();
    });
  }
  public async dropSessionRecord(creatorId: string): Promise<boolean> {
    return this.mutateState(creatorId, (state) => {
      const had = Boolean(state.record);
      delete state.record;
      return had;
    });
  }
  public async remove(creatorId: string): Promise<boolean> {
    return this.mutateState(creatorId, (state) => {
      const had = Boolean(state.record || state.rejectedAt);
      delete state.record;
      delete state.rejectedAt;
      return had;
    });
  }
}

const exclusive = createExclusivePerKeyRunner();
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Local-only vault. Atomic replacement keeps readers on a complete old or new snapshot. */
export class FilePatreonCookieStore extends PatreonCookieVault {
  private readonly filePath: string;
  public constructor(filePath: string, encryption: TokenEncryption, options?: FilePatreonCookieStoreOptions) {
    super(encryption, options);
    this.filePath = resolve(filePath);
  }
  private state(data: CookieStoreData, creatorId: string): CookieState {
    return {
      record: Object.hasOwn(data.records, creatorId) ? data.records[creatorId] : undefined,
      rejectedAt: Object.hasOwn(data.last_remote_rejections ?? {}, creatorId) ? data.last_remote_rejections![creatorId]!.at : undefined
    };
  }
  protected async readState(creatorId: string): Promise<CookieState> { return this.state(await this.readStore(), creatorId); }
  protected async mutateState<T>(creatorId: string, fn: (state: CookieState) => T): Promise<T> {
    return this.withMigrationSnapshot(async (data) => {
      const state = this.state(data, creatorId);
      const result = fn(state);
      if (state.record) data.records = { ...data.records, [creatorId]: state.record };
      else delete data.records[creatorId];
      if (state.rejectedAt) data.last_remote_rejections = { ...data.last_remote_rejections, [creatorId]: { at: state.rejectedAt } };
      else if (data.last_remote_rejections) delete data.last_remote_rejections[creatorId];
      await this.writeStore(data);
      return result;
    });
  }
  /** Holds the same file lock during backup/migration; the callback receives encrypted data only. */
  public async withMigrationSnapshot<T>(fn: (data: CookieStoreData) => Promise<T>): Promise<T> {
    return exclusive(this.filePath, async () => {
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      // A file symlink would give the same vault two lock names and be replaced by rename.
      try {
        if ((await lstat(this.filePath)).isSymbolicLink()) throw new Error("Patreon cookie vault must use its regular file path.");
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const release = await lockfile.lock(this.filePath, {
        realpath: false, stale: 60_000, update: 10_000,
        retries: { retries: 65, minTimeout: 100, maxTimeout: 1000, factor: 1.2 }
      });
      try { return await fn(await this.readStore()); } finally { await release(); }
    });
  }
  private async readStore(): Promise<CookieStoreData> {
    let raw: string;
    try { raw = await readFile(this.filePath, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: {} };
      throw error;
    }
    try {
      const data: unknown = JSON.parse(raw);
      if (!object(data) || !object(data.records)) throw new Error();
      for (const [id, record] of Object.entries(data.records)) {
        if (!object(record) || record.creator_id !== id || typeof record.encrypted_session_id !== "string" ||
          !record.encrypted_session_id || typeof record.stored_at !== "string" || !Number.isFinite(Date.parse(record.stored_at))) throw new Error();
      }
      if (data.last_remote_rejections !== undefined) {
        if (!object(data.last_remote_rejections)) throw new Error();
        for (const rejection of Object.values(data.last_remote_rejections)) {
          if (!object(rejection) || typeof rejection.at !== "string" || !Number.isFinite(Date.parse(rejection.at))) throw new Error();
        }
      }
      return data as CookieStoreData;
    } catch { throw new Error("Patreon cookie vault is invalid; restore or repair the encrypted file before retrying."); }
  }
  private async writeStore(data: CookieStoreData): Promise<void> {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, "wx", 0o600);
      try { await file.writeFile(JSON.stringify(data, null, 2), "utf8"); await file.sync(); } finally { await file.close(); }
      await rename(temporary, this.filePath);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
  }
}
