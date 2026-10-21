import { access, lstat, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
import type { PrismaClient } from "@prisma/client";
import type { CreatorExportIndex, ExportMediaRecord } from "./types.js";
import type { MediaVersionRow } from "../ingest/canonical-store.js";
import { getR2ClientConfigFromEnv } from "../storage/r2-config.js";
import { headR2ObjectContentLength } from "../storage/relay-upload-r2.js";
import { fingerprint } from "./media-repair-state.js";

export type ExportIndexReadOptions = { includeMissing?: boolean; mediaIds?: readonly string[] };

/** Read-only presence checks share one deadline and never enqueue repairs. */
async function present(index: CreatorExportIndex, root: string, options?: ExportIndexReadOptions): Promise<CreatorExportIndex> {
  const wanted = options?.mediaIds ? new Set(options.mediaIds) : null;
  for (const id of Object.keys(index.media)) if (wanted && !wanted.has(id)) delete index.media[id];
  if (options?.includeMissing) return index;
  const records = Object.entries(index.media), deadline = Date.now() + 3000;
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(8, records.length) }, async () => {
    while (cursor < records.length) {
      const [id, record] = records[cursor++]!;
      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("Export presence verification timed out.");
        if (/^(relay|pilot-ux)\//.test(record.relative_blob_path)) {
          const config = getR2ClientConfigFromEnv();
          if (!config) throw new Error("Export storage unavailable.");
          const head = await headR2ObjectContentLength(config, record.relative_blob_path, AbortSignal.timeout(remaining));
          if (head.contentLength !== record.byte_length) throw new Error("Export size changed.");
        } else {
          const path = exportBlobPath(root, index.creator_id, record.relative_blob_path);
          await access(path);
          const info = await stat(path);
          if (!info.isFile() || info.size !== record.byte_length) throw new Error("Export size changed.");
        }
      } catch { delete index.media[id]; }
    }
  }));
  return index;
}

export interface ExportIndex {
  load(creatorId: string, options?: ExportIndexReadOptions): Promise<CreatorExportIndex>;
  save(index: CreatorExportIndex): Promise<void>;
  mutate(creatorId: string, operation: (index: CreatorExportIndex) => void | Promise<void>): Promise<void>;
}
export function exportBlobPath(root: string, creatorId: string, path: string): string {
  if (!creatorId || creatorId === "." || creatorId === ".." || /[/\\:\0]/.test(creatorId)) throw new Error("Invalid export creator.");
  if (!path || /^(?:[/\\]|[a-z]:)/i.test(path) || path.split(/[/\\]/).some((part) => part === "." || part === "..")) throw new Error("Invalid export blob path.");
  const base = resolve(root, creatorId), result = resolve(base, path);
  if (relative(base, result).startsWith("..") || result === base) throw new Error("Export blob path escaped creator.");
  return result;
}
function validate(index: CreatorExportIndex, creatorId: string): void {
  const map = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!map(index) || index.creator_id !== creatorId || !map(index.media) || (index.export_failures !== undefined && !map(index.export_failures))) throw new Error("Invalid export index.");
  for (const [id, record] of Object.entries(index.media)) {
    if (!map(record) || record.media_id !== id || record.creator_id !== creatorId || typeof record.upstream_revision !== "string" || typeof record.sha256 !== "string" || !Number.isSafeInteger(record.byte_length) || record.byte_length < 0) throw new Error("Invalid export record.");
    exportBlobPath(".", creatorId, record.relative_blob_path);
  }
}
/** Lock the complete read/modify/replace operation; locking save alone loses concurrent updates. */
export class FileExportIndex implements ExportIndex {
  public constructor(private readonly baseRoot: string) {}
  private path(creatorId: string) { return exportBlobPath(this.baseRoot, creatorId, "export_index.json"); }
  private async read(creatorId: string): Promise<CreatorExportIndex> {
    try {
      const result = JSON.parse(await readFile(this.path(creatorId), "utf8")) as CreatorExportIndex;
      validate(result, creatorId); return result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { creator_id: creatorId, media: {} };
      throw new Error("Export index is unreadable or corrupt.");
    }
  }
  public async load(creatorId: string, options?: ExportIndexReadOptions): Promise<CreatorExportIndex> {
    const index = await this.read(creatorId);
    return present(index, this.baseRoot, options);
  }
  public async mutate(creatorId: string, operation: (index: CreatorExportIndex) => void | Promise<void>): Promise<void> {
    const path = this.path(creatorId);
    await mkdir(dirname(path), { recursive: true });
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return null; });
    if (info?.isSymbolicLink()) throw new Error("Export index cannot be a symbolic link.");
    const release = await lockfile.lock(path, { realpath: false, stale: 30_000, retries: { retries: 100, minTimeout: 10, maxTimeout: 100 } });
    const temporary = path + "." + randomUUID() + ".tmp";
    try {
      const index = await this.read(creatorId); await operation(index); validate(index, creatorId);
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(index, null, 2)); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, path);
    } finally { await unlink(temporary).catch(() => {}); await release(); }
  }
  /** Fixture/import compatibility; runtime exporters merge individual results with mutate. */
  public async save(index: CreatorExportIndex): Promise<void> {
    await this.mutate(index.creator_id, async (current) => { Object.assign(current, index); });
  }
}
/** Hosted reads project accepted canonical metadata, not a second blob inventory. */
export class DbExportIndex implements ExportIndex {
  public constructor(private readonly db: PrismaClient, private readonly baseRoot = ".relay-data/exports") {}
  public async load(creatorId: string, options?: ExportIndexReadOptions): Promise<CreatorExportIndex> {
    const rows = await this.db.mediaAsset.findMany({ where: { creatorId, upstreamStatus: "active", ...(options?.mediaIds ? { id: { in: [...options.mediaIds] } } : {}) }, select: { id: true, currentVersionSeq: true, currentUpstreamRevision: true, currentUpstreamUrl: true, currentStorageKey: true, versionsJson: true } });
    const media: Record<string, ExportMediaRecord> = {};
    for (const row of rows) {
      const versions = row.versionsJson as unknown as MediaVersionRow[];
      const record = Array.isArray(versions) ? versions.find((v) => v.version_seq === row.currentVersionSeq && v.upstream_revision === row.currentUpstreamRevision)?.export_record : undefined;
      if (record?.creator_id === creatorId && record.media_id === row.id && record.upstream_revision === row.currentUpstreamRevision && record.relative_blob_path === row.currentStorageKey) media[row.id] = record;
    }
    const failures = await this.db.patreonMediaRepair.findMany({ where: { creatorId, kind: "media", lastError: { not: null } }, select: { resourceId: true, head: true, lastError: true, updatedAt: true, attempts: true } });
    const current = new Map(rows.map((row) => [row.id, { revision: row.currentUpstreamRevision, head: fingerprint([creatorId, row.id, "active", row.currentVersionSeq, row.currentUpstreamRevision, row.currentUpstreamUrl, row.currentStorageKey]) }]));
    return present({ creator_id: creatorId, media, export_failures: Object.fromEntries(failures.filter((row) => current.get(row.resourceId)?.head === row.head).map((row) => [row.resourceId, { message: "Media download failed. Retry after checking the source.", failed_at: row.updatedAt.toISOString(), attempts: row.attempts, upstream_revision: current.get(row.resourceId)!.revision }])) }, this.baseRoot, options);
  }
  public async save(_index: CreatorExportIndex): Promise<void> { throw new Error("Hosted export metadata requires guarded canonical acceptance."); }
  public async mutate(_creatorId: string, _operation: (index: CreatorExportIndex) => void | Promise<void>): Promise<void> { throw new Error("Hosted export metadata requires guarded canonical acceptance."); }
}
