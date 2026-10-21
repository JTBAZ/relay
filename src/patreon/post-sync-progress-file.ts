import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import { POST_SYNC_LEASE_MS, readPostSyncProgress, type PatreonPostProgressStore, type PostSyncLease, type PostSyncCheckpoint, type PostSyncProgress } from "./post-sync-progress.js";
type RecordRow = { version: number; token?: string; until?: number; progress: PostSyncProgress; watermark?: string; updatedAt?: string };
type Root = { records: Record<string, RecordRow>; after?: string };
export class FilePatreonPostProgressStore implements PatreonPostProgressStore {
  public readonly shared = false;
  public constructor(private readonly path: string) {}
  private key(creator: string, campaign: string) { return JSON.stringify([creator, campaign]); }
  public async get(creatorId: string, campaignId: string): Promise<PostSyncProgress | null> {
    let root: Root;
    try { root = JSON.parse(await readFile(this.path, "utf8")) as Root; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    if (!root?.records || typeof root.records !== "object" || Array.isArray(root.records)) throw new Error("Invalid Patreon post progress file.");
    const row = root.records[this.key(creatorId, campaignId)];
    return row ? readPostSyncProgress(row.progress) : null;
  }
  private async mutate<T>(fn: (root: Root) => T): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true });
    const release = await lockfile.lock(this.path, { realpath: false, retries: { retries: 30, minTimeout: 10, maxTimeout: 100 }, stale: 30_000 });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    try {
      let root: Root;
      try { root = JSON.parse(await readFile(this.path, "utf8")) as Root; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; root = { records: {} }; }
      if (!root || typeof root !== "object" || Array.isArray(root) || !root.records || typeof root.records !== "object" || Array.isArray(root.records) || (root.after !== undefined && typeof root.after !== "string")) throw new Error("Invalid Patreon post progress file.");
      for (const row of Object.values(root.records)) {
        if (!row || typeof row !== "object" || Array.isArray(row) || !Number.isSafeInteger(row.version) || row.version < 0 || ((row.token === undefined) !== (row.until === undefined)) || (row.token !== undefined && (typeof row.token !== "string" || !/^[a-f0-9-]{36}$/.test(row.token))) || (row.until !== undefined && (!Number.isFinite(row.until) || row.until < 0))) throw new Error("Invalid Patreon post progress lease.");
        readPostSyncProgress(row.progress);
      }
      const result = fn(root); await writeFile(temp, JSON.stringify(root), "utf8"); await rename(temp, this.path); return result;
    } finally { await unlink(temp).catch(() => {}); await release(); }
  }
  public async claim(creatorId: string, campaignId: string): Promise<PostSyncLease | null> {
    return this.mutate((root) => {
      const key = this.key(creatorId, campaignId);
      const row = root.records[key] ??= { version: 0, progress: readPostSyncProgress(null) };
      if ((row.until ?? 0) > Date.now()) return null;
      row.token = randomUUID(); row.until = Date.now() + POST_SYNC_LEASE_MS;
      return { creatorId, campaignId, token: row.token, version: row.version, progress: readPostSyncProgress(row.progress) };
    });
  }
  public async checkpoint(command: PostSyncCheckpoint): Promise<void> {
    await this.mutate((root) => {
      const { lease } = command, row = root.records[this.key(lease.creatorId, lease.campaignId)];
      if (!row || row.token !== lease.token || row.version !== lease.version || (row.until ?? 0) <= Date.now()) throw new Error("Patreon post progress lease changed; retry collection.");
      row.progress = readPostSyncProgress(command.progress); row.version++; row.updatedAt = new Date().toISOString();
      if (command.watermark) row.watermark = command.watermark;
    });
    command.lease.version++; command.lease.progress = structuredClone(command.progress);
  }
  public async heartbeat(lease: PostSyncLease): Promise<void> {
    await this.mutate((root) => {
      const row = root.records[this.key(lease.creatorId, lease.campaignId)];
      if (!row || row.token !== lease.token || (row.until ?? 0) <= Date.now()) throw new Error("Patreon post progress lease lost.");
      row.until = Date.now() + POST_SYNC_LEASE_MS;
    });
  }
  public async release(lease: PostSyncLease): Promise<void> {
    await this.mutate((root) => { const row = root.records[this.key(lease.creatorId, lease.campaignId)]; if (row?.token === lease.token) { delete row.token; delete row.until; } });
  }
  public async selectCreators(ids: string[], cap: number): Promise<string[]> {
    return this.mutate((root) => {
      const sorted = [...new Set(ids)].sort(); const found = root.after ? sorted.findIndex((id) => id > root.after!) : 0;
      const start = found < 0 ? 0 : found;
      const chosen = [...sorted.slice(start), ...sorted.slice(0, start)].slice(0, cap > 0 ? cap : sorted.length);
      if (chosen.length) root.after = chosen.at(-1); return chosen;
    });
  }
}
