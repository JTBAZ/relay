/**
 * @fileoverview Creator media export orchestration: Patreon/R2/upstream fetch, index updates, manifests, ZIP streaming.
 * @description Combines canonical ingest, export indexes, filesystem layout, Cloudflare R2, and Sharp-driven integrity checks.
 * @see ../ingest/canonical-store.js
 * @see ./export-index.js
 * @see ../storage/relay-upload-r2.js
 * @see prisma/schema.prisma MediaAsset (referenced when optional DB paths used)
 */

import archiver from "archiver";
import type { PrismaClient } from "@prisma/client";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Writable } from "node:stream";
import type { CanonicalStore } from "../ingest/canonical-store.js";
import { currentExportRecord, mediaExportHead } from "./media-repair-state.js";
import { MediaRepairStore, type RepairLease } from "./media-repair-store.js";
import { decodeHtmlEscapedUrl } from "../patreon/media-url-normalize.js";
import { getR2ClientConfigFromEnv } from "../storage/r2-config.js";
import { getR2ObjectBuffer, putR2ObjectBuffer } from "../storage/relay-upload-r2.js";
import { exportBlobPath, type ExportIndex } from "./export-index.js";
import {
  buildMediaManifest,
  buildPostMap,
  buildTierMap
} from "./manifests.js";
import { fetchUpstreamWithRetries, readExportBody, type FetchUpstreamOptions } from "./fetch-retry.js";
import type {
  CreatorExportIndex,
  ExportFetchRetryPolicy,
  ExportMediaRecord,
  ExportOneResult
} from "./types.js";
import { DEFAULT_EXPORT_FETCH_RETRY_POLICY } from "./types.js";

function normalizeExportIndex(index: CreatorExportIndex): void {
  if (!index.media) index.media = {};
  if (!index.export_failures) index.export_failures = {};
}

function clearExportFailure(index: CreatorExportIndex, mediaId: string): void {
  normalizeExportIndex(index);
  delete index.export_failures![mediaId];
  if (Object.keys(index.export_failures!).length === 0) {
    delete index.export_failures;
  }
}

/** Split `relative_blob_path` from the export index; reject `..` and absolute-ish segments. */
function pathSegmentsFromRelativeBlob(relativeBlobPath: string): string[] {
  const parts = relativeBlobPath.split(/[/\\]+/).filter((p) => p.length > 0);
  if (parts.some((p) => p === ".." || p === ".")) {
    throw new Error("Unsafe relative_blob_path in export index");
  }
  return parts;
}

function absoluteBlobPathUnderCreator(
  storageRoot: string,
  creatorId: string,
  parts: string[]
): string {
  const creatorRoot = resolve(join(storageRoot, creatorId));
  const abs = resolve(creatorRoot, ...parts);
  const rel = relative(creatorRoot, abs);
  if (rel.startsWith("..") || rel === "") {
    throw new Error("Export path escapes creator directory");
  }
  return abs;
}

const LIBRARY_ZIP_EMPTY_CODE = "LIBRARY_ZIP_EMPTY";

/** Object keys stored in R2 (Relay uploads + pilot UX dev fixtures). */
function isR2BackedStorageKey(key: string): boolean {
  return key.startsWith("relay/") || key.startsWith("pilot-ux/");
}

type MediaAssetExportSelect = {
  id: string;
  creatorId: string;
  currentStorageKey: string | null;
  currentMimeType: string | null;
  currentUpstreamUrl: string | null;
  currentUpstreamRevision: string;
  ingestOrigin?: string;
  upstreamStatus?: string;
};

/**
 * @description Hostname heuristic for any Patreon-controlled media host (API or signed CDN).
 * @param urlStr Absolute URL string.
 * @returns `true` when host appears to be Patreon-controlled.
 */
export function upstreamUrlLooksLikePatreonHosted(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const h = u.hostname.toLowerCase();
    return (
      h === "patreon.com" ||
      h.endsWith(".patreon.com") ||
      h === "patreonusercontent.com" ||
      h.endsWith(".patreonusercontent.com")
    );
  } catch {
    return false;
  }
}

/**
 * Signed `*.patreonusercontent.com` CDN URLs already carry token-hash/time query params and return
 * **403** when an OAuth `Authorization` header is attached. Only `patreon.com` file/API URLs need Bearer.
 * @description Decide whether export fetch should attach the creator OAuth token.
 * @param urlStr Absolute URL string.
 * @returns `true` only for patreon.com hosts (not the CDN).
 */
export function upstreamUrlNeedsPatreonOAuthBearer(urlStr: string): boolean {
  try {
    const h = new URL(urlStr).hostname.toLowerCase();
    return h === "patreon.com" || h.endsWith(".patreon.com");
  } catch {
    return false;
  }
}

/**
 * @description Stateful export worker bound to canonical snapshot, filesystem roots, fetch, Prisma/R2 helpers.
 * @security-audit-required Downloads and stores creator-owned media blobs; callers must enforce `creatorId` authorization on every route.
 */
export class ExportService {
  private readonly canonicalStore: CanonicalStore;
  private readonly exportIndex: ExportIndex;
  private readonly storageRoot: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retryPolicy: ExportFetchRetryPolicy;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly getCreatorPatreonAccessToken?: (
    creatorId: string
  ) => Promise<string | null>;
  private readonly prisma: PrismaClient | undefined;
  private refreshSource?: (creatorId: string, mediaId: string) => Promise<void>;
  public setSourceRefresher(refresh: (creatorId: string, mediaId: string) => Promise<void>): void { this.refreshSource = refresh; }

  /**
   * @description Binds canonical + export index + storage roots and optional Patreon token resolver / Prisma for R2/upstream paths.
   * @param canonicalStore Source of media metadata.
   * @param exportIndex Per-creator JSON index reader/writer.
   * @param storageRoot Local blob root.
   * @param fetchImpl Injectable `fetch` for tests.
   * @param retryPolicy Partial override of default HTTP retry policy for upstream downloads.
   * @param sleepFn Delay function between retries.
   * @param getCreatorPatreonAccessToken Optional resolver for Patreon-hosted URLs.
   * @param prisma Optional DB for `MediaAsset` storage key / upstream fallbacks.
   */
  public constructor(
    canonicalStore: CanonicalStore,
    exportIndex: ExportIndex,
    storageRoot: string,
    fetchImpl?: typeof fetch,
    retryPolicy?: Partial<ExportFetchRetryPolicy>,
    sleepFn?: (ms: number) => Promise<void>,
    getCreatorPatreonAccessToken?: (creatorId: string) => Promise<string | null>,
    prisma?: PrismaClient,
    private readonly sharedLocalRoot = false
  ) {
    this.canonicalStore = canonicalStore;
    this.exportIndex = exportIndex;
    this.storageRoot = storageRoot;
    this.fetchImpl = fetchImpl ?? fetch;
    this.retryPolicy = {
      ...DEFAULT_EXPORT_FETCH_RETRY_POLICY,
      ...retryPolicy
    };
    this.sleepFn = sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.getCreatorPatreonAccessToken = getCreatorPatreonAccessToken;
    this.prisma = prisma;
  }

  public get supportsHostedRepair(): boolean {
    return Boolean(this.prisma && this.canonicalStore.supportsAtomicCreatorMutations && (getR2ClientConfigFromEnv() || this.sharedLocalRoot));
  }

  /**
   * @description Downloads (or reuses) upstream asset bytes, persists under `storageRoot`, updates export index and canonical storage hints.
   * @param creatorId Owning creator id.
   * @param mediaId Media id to export.
   * @returns Summary with checksum and whether this was an idempotent skip.
   * @async
   * @throws {Error} Missing media, upstream fetch failures after retries, filesystem errors, or OAuth token resolution failures.
   */
  public async exportMedia(creatorId: string, mediaId: string, lease?: RepairLease, allowSourceRefresh = true): Promise<ExportOneResult> {
    const started = new Date();
    const snapshot = await this.canonicalStore.loadForCreator(creatorId);
    const row = snapshot.media[creatorId]?.[mediaId];
    if (!row || row.creator_id !== creatorId || row.upstream_status !== "active") throw new Error("Media not found: " + mediaId);
    const expected = mediaExportHead(row);
    const index = await this.exportIndex.load(creatorId, { mediaIds: [mediaId] });
    const existing = currentExportRecord(row) ?? index.media[mediaId];
    const accept = async (record: ExportMediaRecord) => {
      if (this.prisma && this.canonicalStore.supportsAtomicCreatorMutations) {
        await new MediaRepairStore(this.prisma).acceptExport(creatorId, mediaId, expected, record, lease);
      } else {
        await this.exportIndex.mutate(creatorId, async (latest) => {
          const current = (await this.canonicalStore.loadForCreator(creatorId)).media[creatorId]?.[mediaId];
          if (!current || mediaExportHead(current) !== expected) throw new Error("Media changed during export; retry current revision.");
          latest.media[mediaId] = record; clearExportFailure(latest, mediaId);
        });
      }
    };
    try {
      if (existing?.upstream_revision === row.current.upstream_revision) {
        try {
          const bytes = await this.readRecordBytes(creatorId, existing);
          if (bytes.byteLength === existing.byte_length && createHash("sha256").update(bytes).digest("hex") === existing.sha256) {
            await accept(existing);
            return { media_id: mediaId, creator_id: creatorId, sha256: existing.sha256, byte_length: bytes.byteLength, idempotent_skip: true };
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes("changed during export")) throw error;
          // Missing/corrupt bytes must be downloaded again, even when the index revision matches.
        }
      }
      const url = decodeHtmlEscapedUrl((row.current.upstream_url ?? "").trim());
      if (!url) throw new Error("upstream_url is required to export media.");
      const r2 = this.prisma && this.canonicalStore.supportsAtomicCreatorMutations ? getR2ClientConfigFromEnv() : null;
      if (this.prisma && this.canonicalStore.supportsAtomicCreatorMutations && !r2 && !this.sharedLocalRoot) throw new Error("Hosted exports require R2 or an explicitly shared persistent export root.");
      const response = await fetchUpstreamWithRetries(url, this.fetchImpl, this.retryPolicy, this.sleepFn, await this.buildPatreonUpstreamFetchOpts(creatorId, url));
      const buffer = await readExportBody(response, this.retryPolicy.timeout_ms);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const suffix = createHash("sha256").update(mediaId + "\0" + row.current.upstream_revision).digest("hex");
      const relativeBlobPath = r2 ? "relay/tenants/" + encodeURIComponent(creatorId) + "/exports/" + suffix + "/" + sha256 : "media/" + suffix + "/" + sha256;
      if (r2) await putR2ObjectBuffer(r2, relativeBlobPath, buffer, row.current.mime_type ?? "application/octet-stream", AbortSignal.timeout(this.retryPolicy.timeout_ms));
      else {
        const absolute = exportBlobPath(this.storageRoot, creatorId, relativeBlobPath), temporary = absolute + "." + randomUUID() + ".tmp";
        await mkdir(resolve(absolute, ".."), { recursive: true });
        try {
          const handle = await open(temporary, "wx", 0o600);
          try { await handle.writeFile(buffer); await handle.sync(); } finally { await handle.close(); }
          await rename(temporary, absolute);
        } finally { await unlink(temporary).catch(() => {}); }
      }
      const record: ExportMediaRecord = { media_id: mediaId, creator_id: creatorId, sha256, byte_length: buffer.byteLength,
        relative_blob_path: relativeBlobPath, upstream_revision: row.current.upstream_revision, mime_type: row.current.mime_type, exported_at: new Date().toISOString() };
      await accept(record);
      return { media_id: mediaId, creator_id: creatorId, sha256, byte_length: buffer.byteLength, idempotent_skip: false };
    } catch (error) {
      if (allowSourceRefresh && this.refreshSource && error instanceof Error && /status (401|403|404|410)/.test(error.message) && row.post_ids.some((id) => id.startsWith("patreon_post_"))) {
        await this.refreshSource(creatorId, mediaId);
        return this.exportMedia(creatorId, mediaId, lease, false);
      }
      if (this.prisma && this.canonicalStore.supportsAtomicCreatorMutations && !lease) await new MediaRepairStore(this.prisma).noteFailure(creatorId, mediaId, expected, started);
      if (!this.prisma || !this.canonicalStore.supportsAtomicCreatorMutations) {
        await this.exportIndex.mutate(creatorId, async (latest) => {
          const current = (await this.canonicalStore.loadForCreator(creatorId)).media[creatorId]?.[mediaId];
          if (!current || mediaExportHead(current) !== expected) return;
          const newer = latest.media[mediaId];
          if (newer?.upstream_revision === row.current.upstream_revision) {
            // Legacy remote records use read-only presence checks; never fetch under the file lock.
            if (isR2BackedStorageKey(newer.relative_blob_path)) return;
            try { const bytes = await this.readRecordBytes(creatorId, newer); if (bytes.length === newer.byte_length && createHash("sha256").update(bytes).digest("hex") === newer.sha256) return; } catch {}
          }
          normalizeExportIndex(latest);
          latest.export_failures![mediaId] = { message: error instanceof Error && error.message.startsWith("Download failed with status") ? error.message : "Media export needs a retry.", failed_at: new Date().toISOString(), upstream_revision: row.current.upstream_revision };
        });
      }
      throw error;
    }
  }

  private async readRecordBytes(creatorId: string, record: ExportMediaRecord, signal?: AbortSignal): Promise<Buffer> {
    if (record.creator_id !== creatorId) throw new Error("Export creator mismatch.");
    if (isR2BackedStorageKey(record.relative_blob_path)) {
      const r2 = getR2ClientConfigFromEnv();
      if (!r2) throw new Error("Object storage is not configured.");
      return getR2ObjectBuffer(r2, record.relative_blob_path, { timeoutMs: this.retryPolicy.timeout_ms, ...(signal ? { signal } : {}) });
    }
    return readFile(exportBlobPath(this.storageRoot, creatorId, record.relative_blob_path));
  }

  /**
   * Single resolution pass for `GET /api/v1/export/media/.../content` and `/preview` — avoids two R2 GETs
   * when the handler needs both metadata and bytes.
   * @description Loads `ExportMediaRecord` plus bytes via index, disk, R2, or upstream fetch.
   * @param creatorId Creator scope.
   * @param mediaId Media id.
   * @returns Record + buffer or `null` when unavailable.
   * @async
   * @throws {Error} R2 misconfiguration, path traversal issues, or unreadable files.
   */
  public async getExportContent(
    creatorId: string,
    mediaId: string
  ): Promise<{ record: ExportMediaRecord; buffer: Buffer } | null> {
    return this.loadExportRecordAndBuffer(creatorId, mediaId);
  }

  /**
   * @description Returns raw blob bytes for exported media, throwing when missing.
   * @param creatorId Creator scope.
   * @param mediaId Media id.
   * @returns File/R2/upstream buffer bytes.
   * @async
   * @throws {Error} When `loadExportRecordAndBuffer` returns null.
   */
  public async readBlob(creatorId: string, mediaId: string): Promise<Buffer> {
    const out = await this.loadExportRecordAndBuffer(creatorId, mediaId);
    if (!out) {
      throw new Error(`No export record for media ${mediaId}`);
    }
    return out.buffer;
  }

  /**
   * @description Re-hashes on-disk bytes and compares to export index metadata.
   * @param creatorId Creator scope.
   * @param mediaId Media id.
   * @returns `true` when record exists and hashes/lengths match.
   * @async
   * @throws {Error} Delegates to `readBlob` on failures.
   */
  public async verifyIntegrity(creatorId: string, mediaId: string): Promise<boolean> {
    const index = await this.exportIndex.load(creatorId);
    const rec = index.media[mediaId];
    if (!rec) {
      return false;
    }
    const bytes = await this.readBlob(creatorId, mediaId);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return sha256 === rec.sha256 && bytes.byteLength === rec.byte_length;
  }

  /**
   * Random subset of indexed media — re-hash on disk vs export_index (checksum sampling).
   * `limit` capped at 50; uses Fisher–Yates shuffle.
   * @description Statistical integrity sampling for Workstream C health checks.
   * @param creatorId Creator scope.
   * @param limit Requested sample count (capped).
   * @returns Checked count, match count, mismatched ids.
   * @async
   * @throws {Error} On index/load failures from `verifyIntegrity`.
   */
  public async sampleIntegrityChecks(
    creatorId: string,
    limit: number
  ): Promise<{
    checked: number;
    matched: number;
    mismatched: { media_id: string }[];
  }> {
    const index = await this.exportIndex.load(creatorId);
    const ids = Object.keys(index.media ?? {});
    if (ids.length === 0) {
      return { checked: 0, matched: 0, mismatched: [] };
    }
    const cap = Math.min(Math.max(1, limit), 50, ids.length);
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const pick = shuffled.slice(0, cap);
    const mismatched: { media_id: string }[] = [];
    let matched = 0;
    for (const mediaId of pick) {
      const ok = await this.verifyIntegrity(creatorId, mediaId);
      if (ok) matched += 1;
      else mismatched.push({ media_id: mediaId });
    }
    return { checked: pick.length, matched, mismatched };
  }

  /**
   * @description Returns export index record for media when resolvable (may synthesize from DB/R2/upstream).
   * @param creatorId Creator scope.
   * @param mediaId Media id.
   * @async
   */
  public async getExportRecord(
    creatorId: string,
    mediaId: string
  ): Promise<ExportMediaRecord | null> {
    const out = await this.loadExportRecordAndBuffer(creatorId, mediaId);
    return out?.record ?? null;
  }

  private async loadMediaRowAndIndex(
    creatorId: string,
    mediaId: string
  ): Promise<{
    fromIndex: ExportMediaRecord | null;
    row: MediaAssetExportSelect | null;
  }> {
    const index = await this.exportIndex.load(creatorId, { mediaIds: [mediaId] });
    const fromIndex = index.media[mediaId] ?? null;
    if (!this.prisma) {
      return { fromIndex, row: null };
    }
    const row = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, creatorId },
      select: {
        id: true,
        creatorId: true,
        currentStorageKey: true,
        currentMimeType: true,
        currentUpstreamUrl: true,
        currentUpstreamRevision: true,
        ingestOrigin: true,
        upstreamStatus: true
      }
    });
    return { fromIndex, row };
  }

  private buildExportRecordForUpstream(
    row: MediaAssetExportSelect,
    creatorId: string,
    mediaId: string,
    buffer: Buffer
  ): ExportMediaRecord {
    const url = row.currentUpstreamUrl!.trim();
    return {
      media_id: mediaId,
      creator_id: creatorId,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      byte_length: buffer.byteLength,
      relative_blob_path: `__upstream__/${mediaId}/asset`,
      upstream_revision: row.currentUpstreamRevision,
      mime_type: row.currentMimeType ?? undefined,
      exported_at: new Date().toISOString(),
      upstream_url: url
    };
  }

  private async loadExportRecordAndBuffer(
    creatorId: string,
    mediaId: string
  ): Promise<{ record: ExportMediaRecord; buffer: Buffer } | null> {
    const { fromIndex, row } = await this.loadMediaRowAndIndex(creatorId, mediaId);
    if (row?.upstreamStatus === "deleted") return null;
    if (row) {
      const current = fromIndex?.upstream_revision === row.currentUpstreamRevision ? fromIndex : null;
      if (current && (!row.currentStorageKey || current.relative_blob_path === row.currentStorageKey)) return { record: current, buffer: await this.readRecordBytes(creatorId, current) };
      const imported = row.ingestOrigin === "PATREON" || row.ingestOrigin === "SUBSCRIBESTAR";
      // Native uploads and legacy rows retain their established storage-key read path.
      if (row.currentStorageKey?.trim() && !imported) {
        const key = row.currentStorageKey.trim();
        const provisional: ExportMediaRecord = { media_id: mediaId, creator_id: creatorId, relative_blob_path: key, upstream_revision: row.currentUpstreamRevision,
          sha256: "", byte_length: 0, mime_type: row.currentMimeType ?? fromIndex?.mime_type, exported_at: fromIndex?.exported_at ?? new Date().toISOString() };
        const buffer = await this.readRecordBytes(creatorId, provisional);
        return { record: { ...provisional, sha256: createHash("sha256").update(buffer).digest("hex"), byte_length: buffer.length }, buffer };
      }
      const url = row.currentUpstreamUrl?.trim();
      if (url) {
        const buffer = await this.fetchUpstreamMediaBuffer(creatorId, url);
        return { record: this.buildExportRecordForUpstream(row, creatorId, mediaId, buffer), buffer };
      }
      return null;
    }
    const media = (await this.canonicalStore.loadForCreator(creatorId)).media[creatorId]?.[mediaId];
    if (fromIndex && media?.upstream_status === "active" && fromIndex.upstream_revision === media.current.upstream_revision) return { record: fromIndex, buffer: await this.readRecordBytes(creatorId, fromIndex) };
    return null;
  }

  /**
   * Attach creator OAuth Bearer only for `patreon.com` hosts. Signed CDN URLs must be fetched bare.
   */
  private async buildPatreonUpstreamFetchOpts(
    creatorId: string,
    url: string
  ): Promise<FetchUpstreamOptions | undefined> {
    if (!upstreamUrlNeedsPatreonOAuthBearer(url) || !this.getCreatorPatreonAccessToken) {
      return undefined;
    }
    const token = await this.getCreatorPatreonAccessToken(creatorId);
    const t = token?.trim();
    if (!t) return undefined;
    return { headers: { authorization: `Bearer ${t}` } };
  }

  private async fetchUpstreamMediaBuffer(creatorId: string, url: string): Promise<Buffer> {
    const fetchUrl = decodeHtmlEscapedUrl(url.trim());
    const fetchOpts = await this.buildPatreonUpstreamFetchOpts(creatorId, fetchUrl);
    const response = await fetchUpstreamWithRetries(
      fetchUrl,
      this.fetchImpl,
      this.retryPolicy,
      this.sleepFn,
      fetchOpts
    );
    return readExportBody(response, this.retryPolicy.timeout_ms);
  }

  /**
   * True when there is nothing to put in `GET /api/v1/export/library-zip`.
   * @description Detects empty export index for zip generation guardrails.
   * @param creatorId Creator scope.
   * @async
   * @throws {Error} On index load failure.
   */
  private async currentZipIndex(creatorId: string): Promise<CreatorExportIndex> {
    const index = await this.exportIndex.load(creatorId, { includeMissing: true });
    const snapshot = await this.canonicalStore.loadForCreator(creatorId);
    for (const [id, record] of Object.entries(index.media)) {
      const row = snapshot.media[creatorId]?.[id];
      // Legacy file-only indexes may predate canonical rows; preserve their read/502 contract.
      if (row && (row.upstream_status !== "active" || row.current.upstream_revision !== record.upstream_revision)) delete index.media[id];
    }
    return index;
  }

  public async isLibraryZipEmpty(creatorId: string): Promise<boolean> {
    const index = await this.currentZipIndex(creatorId);
    return Object.keys(index.media ?? {}).length === 0;
  }

  /**
   * Current blob paths that could not be verified within the shared presence-check budget.
   * @description Pre-flight list for the existing ZIP 502 response; this read schedules no work.
   * @param creatorId Creator scope.
   * @returns Missing or unverified current paths.
   * @async
   */
  public async listMissingLibraryZipBlobs(creatorId: string): Promise<string[]> {
    const raw = await this.currentZipIndex(creatorId);
    const verified = await this.exportIndex.load(creatorId, { mediaIds: Object.keys(raw.media) });
    return Object.entries(raw.media).filter(([id, record]) => verified.media[id]?.relative_blob_path !== record.relative_blob_path)
      .map(([, record]) => record.relative_blob_path);
  }

  /**
   * Stream a zip of all exported blobs (paths from `relative_blob_path`) plus manifests JSON.
   * Caller must set `Content-Type` / `Content-Disposition` on `dest` before calling, after `isLibraryZipEmpty` is false.
   * @description Archives indexed blobs and manifest JSON snapshots into `dest` stream.
   * @param creatorId Creator scope.
   * @param dest Writable HTTP response stream (or fs stream).
   * @async
   * @throws {Error} ENOENT/`archive` errors, empty index error tagged `LIBRARY_ZIP_EMPTY`, or finalize failures.
   */
  public async pipeLibraryZip(creatorId: string, dest: Writable): Promise<void> {
    const index = await this.currentZipIndex(creatorId);
    const mediaEntries = Object.entries(index.media ?? {});
    if (mediaEntries.length === 0) {
      const e = new Error("No exported media for library zip.");
      (e as NodeJS.ErrnoException).code = LIBRARY_ZIP_EMPTY_CODE;
      throw e;
    }

    const snapshot = await this.canonicalStore.loadForCreator(creatorId);
    const archive = archiver("zip", { zlib: { level: 6 } });

    const finished = new Promise<void>((resolvePromise, rejectPromise) => {
      archive.on("error", rejectPromise);
      archive.on("warning", (err: Error & { code?: string }) => {
        if (err.code === "ENOENT") {
          rejectPromise(err);
        }
      });
      dest.on("error", rejectPromise);
      archive.on("end", () => resolvePromise());
    });

    void finished.catch(() => {});
    const controller = new AbortController();
    const closed = () => { if (!dest.writableFinished) { const error = new Error("Export destination closed."); controller.abort(error); archive.destroy(error); } };
    dest.on("close", closed);
    dest.on("error", closed);
    archive.pipe(dest);
    try {
    const mediaManifest = buildMediaManifest(creatorId, snapshot, index);
    archive.append(JSON.stringify(mediaManifest, null, 2), {
      name: "manifests/media-manifest.json"
    });
    archive.append(JSON.stringify(buildPostMap(creatorId, snapshot), null, 2), {
      name: "manifests/post-map.json"
    });
    archive.append(JSON.stringify(buildTierMap(creatorId, snapshot), null, 2), {
      name: "manifests/tier-map.json"
    });

    for (const [, rec] of mediaEntries) {
      const parts = pathSegmentsFromRelativeBlob(rec.relative_blob_path);
      const abs = absoluteBlobPathUnderCreator(this.storageRoot, creatorId, parts);
      const nameInZip = parts.join("/");
      if (isR2BackedStorageKey(rec.relative_blob_path)) {
        if (dest.destroyed) throw new Error("Export destination closed.");
        let abort: (() => void) | undefined;
        const aborted = new Promise<never>((_, fail) => {
          abort = () => fail(controller.signal.reason);
          controller.signal.addEventListener("abort", abort, { once: true });
        });
        let bytes: Buffer;
        try { bytes = await Promise.race([this.readRecordBytes(creatorId, rec, controller.signal), aborted]); }
        finally { if (abort) controller.signal.removeEventListener("abort", abort); }
        if (dest.destroyed) throw new Error("Export destination closed.");
        // Wait for this entry to flow through compression before retaining another blob.
        await new Promise<void>((done, fail) => {
          const clean = () => { archive.off("entry", entry); archive.off("error", error); dest.off("close", close); };
          const entry = (value: { name: string }) => { if (value.name === nameInZip) { clean(); done(); } };
          const error = (value: Error) => { clean(); fail(value); };
          const close = () => error(new Error("Export destination closed."));
          archive.on("entry", entry); archive.on("error", error); dest.on("close", close);
          archive.append(bytes, { name: nameInZip });
        });
      } else archive.file(abs, { name: nameInZip });
    }

    await archive.finalize();
    await finished;
    } catch (error) { archive.abort(); throw error; }
    finally { controller.abort(new Error("Export complete.")); dest.off("close", closed); dest.off("error", closed); }
  }

  /**
   * @description Writes `media-manifest`, `post-map`, and `tier-map` JSON files under the creator manifests directory.
   * @param creatorId Creator scope.
   * @returns Relative POSIX paths for written files.
   * @async
   * @throws {Error} On canonical/index load or `writeFile` failure.
   */
  public async materializeManifests(creatorId: string): Promise<{
    relative_paths: string[];
  }> {
    const snapshot = await this.canonicalStore.loadForCreator(creatorId);
    const index = await this.exportIndex.load(creatorId);
    const dir = join(this.storageRoot, creatorId, "manifests");
    await mkdir(dir, { recursive: true });

    const mediaManifest = buildMediaManifest(creatorId, snapshot, index);
    const postMap = buildPostMap(creatorId, snapshot);
    const tierMap = buildTierMap(creatorId, snapshot);

    const names = [
      "media-manifest.json",
      "post-map.json",
      "tier-map.json"
    ] as const;
    await writeFile(
      join(dir, names[0]),
      JSON.stringify(mediaManifest, null, 2),
      "utf8"
    );
    await writeFile(join(dir, names[1]), JSON.stringify(postMap, null, 2), "utf8");
    await writeFile(join(dir, names[2]), JSON.stringify(tierMap, null, 2), "utf8");

    return {
      relative_paths: names.map(
        (n) => `${creatorId}/manifests/${n}`.replace(/\\/g, "/")
      )
    };
  }
}
