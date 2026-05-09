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
import { createHash, randomInt } from "node:crypto";
import { access, constants, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Writable } from "node:stream";
import type { CanonicalStore } from "../ingest/canonical-store.js";
import { applyStorageKeyToCanonicalSnapshot } from "../ingest/media-storage-key.js";
import { getR2ClientConfigFromEnv } from "../storage/r2-config.js";
import { getR2ObjectBuffer } from "../storage/relay-upload-r2.js";
import { FileExportIndex } from "./export-index.js";
import {
  buildMediaManifest,
  buildPostMap,
  buildTierMap
} from "./manifests.js";
import { fetchUpstreamWithRetries, type FetchUpstreamOptions } from "./fetch-retry.js";
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

/** R2 object keys for Relay uploads (ADR 002). */
function isRelayR2StorageKey(key: string): boolean {
  return key.startsWith("relay/");
}

type MediaAssetExportSelect = {
  id: string;
  creatorId: string;
  currentStorageKey: string | null;
  currentMimeType: string | null;
  currentUpstreamUrl: string | null;
  currentUpstreamRevision: string;
};

/**
 * Patreon media URLs often return 403 without the creator OAuth token; plain `fetch(url)` is not enough.
 * @description Hostname heuristic to decide when to attach Patreon OAuth headers during export fetch.
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
 * @description Stateful export worker bound to canonical snapshot, filesystem roots, fetch, Prisma/R2 helpers.
 * @security-audit-required Downloads and stores creator-owned media blobs; callers must enforce `creatorId` authorization on every route.
 */
export class ExportService {
  private readonly canonicalStore: CanonicalStore;
  private readonly exportIndex: FileExportIndex;
  private readonly storageRoot: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retryPolicy: ExportFetchRetryPolicy;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly getCreatorPatreonAccessToken?: (
    creatorId: string
  ) => Promise<string | null>;
  private readonly prisma: PrismaClient | undefined;

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
    exportIndex: FileExportIndex,
    storageRoot: string,
    fetchImpl?: typeof fetch,
    retryPolicy?: Partial<ExportFetchRetryPolicy>,
    sleepFn?: (ms: number) => Promise<void>,
    getCreatorPatreonAccessToken?: (creatorId: string) => Promise<string | null>,
    prisma?: PrismaClient
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

  /**
   * @description Downloads (or reuses) upstream asset bytes, persists under `storageRoot`, updates export index and canonical storage hints.
   * @param creatorId Owning creator id.
   * @param mediaId Media id to export.
   * @returns Summary with checksum and whether this was an idempotent skip.
   * @async
   * @throws {Error} Missing media, upstream fetch failures after retries, filesystem errors, or OAuth token resolution failures.
   */
  public async exportMedia(creatorId: string, mediaId: string): Promise<ExportOneResult> {
    const snapshot = await this.canonicalStore.load();
    const mediaMap = snapshot.media[creatorId];
    if (!mediaMap || !mediaMap[mediaId]) {
      throw new Error(`Media not found: ${mediaId}`);
    }
    const row = mediaMap[mediaId];
    const url = row.current.upstream_url;
    if (!url || url.trim() === "") {
      throw new Error("upstream_url is required to export media.");
    }

    const index = await this.exportIndex.load(creatorId);
    normalizeExportIndex(index);
    const existing = index.media[mediaId];
    if (
      existing &&
      existing.upstream_revision === row.current.upstream_revision
    ) {
      clearExportFailure(index, mediaId);
      await this.exportIndex.save(index);
      try {
        await this.canonicalStore.mutateForCreator(creatorId, async (snapshot) => {
          applyStorageKeyToCanonicalSnapshot(
            snapshot,
            creatorId,
            mediaId,
            existing.relative_blob_path
          );
        });
      } catch {
        /* best-effort: canonical may be file-backed or save may fail */
      }
      return {
        media_id: mediaId,
        creator_id: creatorId,
        sha256: existing.sha256,
        byte_length: existing.byte_length,
        idempotent_skip: true
      };
    }

    try {
      let fetchOpts: FetchUpstreamOptions | undefined;
      if (upstreamUrlLooksLikePatreonHosted(url) && this.getCreatorPatreonAccessToken) {
        const token = await this.getCreatorPatreonAccessToken(creatorId);
        const t = token?.trim();
        if (t) {
          fetchOpts = { headers: { authorization: `Bearer ${t}` } };
        }
      }
      const response = await fetchUpstreamWithRetries(
        url,
        this.fetchImpl,
        this.retryPolicy,
        this.sleepFn,
        fetchOpts
      );
      const buffer = Buffer.from(await response.arrayBuffer());
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const relativeBlobPath = `media/${mediaId}/asset`;
      const absoluteBlobPath = join(
        this.storageRoot,
        creatorId,
        ...relativeBlobPath.split("/")
      );

      await mkdir(join(this.storageRoot, creatorId, "media", mediaId), {
        recursive: true
      });
      await writeFile(absoluteBlobPath, buffer);

      const record = {
        media_id: mediaId,
        creator_id: creatorId,
        sha256,
        byte_length: buffer.byteLength,
        relative_blob_path: relativeBlobPath,
        upstream_revision: row.current.upstream_revision,
        mime_type: row.current.mime_type,
        exported_at: new Date().toISOString(),
        upstream_url: url
      };
      index.creator_id = creatorId;
      index.media[mediaId] = record;
      clearExportFailure(index, mediaId);
      await this.exportIndex.save(index);

      try {
        await this.canonicalStore.mutateForCreator(creatorId, async (snapshot) => {
          applyStorageKeyToCanonicalSnapshot(
            snapshot,
            creatorId,
            mediaId,
            record.relative_blob_path
          );
        });
      } catch {
        /* best-effort */
      }

      return {
        media_id: mediaId,
        creator_id: creatorId,
        sha256,
        byte_length: buffer.byteLength,
        idempotent_skip: false
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const truncated =
        message.length > 500 ? `${message.slice(0, 497)}...` : message;
      normalizeExportIndex(index);
      index.export_failures![mediaId] = {
        message: truncated,
        failed_at: new Date().toISOString()
      };
      index.creator_id = creatorId;
      await this.exportIndex.save(index);
      throw err instanceof Error ? err : new Error(message);
    }
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
    const index = await this.exportIndex.load(creatorId);
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
        currentUpstreamRevision: true
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
    if (row?.currentStorageKey?.trim()) {
      const key = row.currentStorageKey.trim();
      if (fromIndex && fromIndex.relative_blob_path === key) {
        const parts = fromIndex.relative_blob_path.split("/");
        const absolutePath = join(this.storageRoot, creatorId, ...parts);
        const buffer = await readFile(absolutePath);
        return { record: fromIndex, buffer };
      }
      if (isRelayR2StorageKey(key)) {
        const r2 = getR2ClientConfigFromEnv();
        if (!r2) {
          throw new Error(
            "Object storage (R2) is not configured but media has an R2 storage key."
          );
        }
        const buffer = await getR2ObjectBuffer(r2, key);
        const record: ExportMediaRecord = {
          media_id: mediaId,
          creator_id: creatorId,
          sha256: createHash("sha256").update(buffer).digest("hex"),
          byte_length: buffer.byteLength,
          relative_blob_path: key,
          upstream_revision: row.currentUpstreamRevision,
          mime_type: row.currentMimeType ?? fromIndex?.mime_type ?? "application/octet-stream",
          exported_at: fromIndex?.exported_at ?? new Date().toISOString(),
          upstream_url: fromIndex?.upstream_url
        };
        return { record, buffer };
      }
      const parts = pathSegmentsFromRelativeBlob(key);
      const abs = absoluteBlobPathUnderCreator(this.storageRoot, creatorId, parts);
      const buffer = await readFile(abs);
      const record: ExportMediaRecord = {
        media_id: mediaId,
        creator_id: creatorId,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        byte_length: buffer.byteLength,
        relative_blob_path: key,
        upstream_revision: row.currentUpstreamRevision,
        mime_type: row.currentMimeType ?? fromIndex?.mime_type ?? "application/octet-stream",
        exported_at: new Date().toISOString(),
        upstream_url: fromIndex?.upstream_url
      };
      return { record, buffer };
    }
    if (fromIndex) {
      const absolutePath = join(
        this.storageRoot,
        creatorId,
        ...fromIndex.relative_blob_path.split("/")
      );
      const buffer = await readFile(absolutePath);
      return { record: fromIndex, buffer };
    }
    const url = row?.currentUpstreamUrl?.trim();
    if (url && row) {
      const buffer = await this.fetchUpstreamMediaBuffer(creatorId, url);
      return {
        record: this.buildExportRecordForUpstream(row, creatorId, mediaId, buffer),
        buffer
      };
    }
    return null;
  }

  private async fetchUpstreamMediaBuffer(creatorId: string, url: string): Promise<Buffer> {
    let fetchOpts: FetchUpstreamOptions | undefined;
    if (upstreamUrlLooksLikePatreonHosted(url) && this.getCreatorPatreonAccessToken) {
      const token = await this.getCreatorPatreonAccessToken(creatorId);
      const t = token?.trim();
      if (t) {
        fetchOpts = { headers: { authorization: `Bearer ${t}` } };
      }
    }
    const response = await fetchUpstreamWithRetries(
      url,
      this.fetchImpl,
      this.retryPolicy,
      this.sleepFn,
      fetchOpts
    );
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * True when there is nothing to put in `GET /api/v1/export/library-zip`.
   * @description Detects empty export index for zip generation guardrails.
   * @param creatorId Creator scope.
   * @async
   * @throws {Error} On index load failure.
   */
  public async isLibraryZipEmpty(creatorId: string): Promise<boolean> {
    const index = await this.exportIndex.load(creatorId);
    return Object.keys(index.media ?? {}).length === 0;
  }

  /**
   * `relative_blob_path` values in the export index that are not readable on disk.
   * Stale index rows (e.g. files removed manually) cause archiver to fail mid-stream unless checked first.
   * @description Pre-flight list of missing blob paths for zip endpoints.
   * @param creatorId Creator scope.
   * @returns Paths that failed `access`.
   * @async
   */
  public async listMissingLibraryZipBlobs(creatorId: string): Promise<string[]> {
    const index = await this.exportIndex.load(creatorId);
    const missing: string[] = [];
    for (const rec of Object.values(index.media ?? {})) {
      try {
        const parts = pathSegmentsFromRelativeBlob(rec.relative_blob_path);
        const abs = absoluteBlobPathUnderCreator(this.storageRoot, creatorId, parts);
        await access(abs, constants.R_OK);
      } catch {
        missing.push(rec.relative_blob_path);
      }
    }
    return missing;
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
    const index = await this.exportIndex.load(creatorId);
    const mediaEntries = Object.entries(index.media ?? {});
    if (mediaEntries.length === 0) {
      const e = new Error("No exported media for library zip.");
      (e as NodeJS.ErrnoException).code = LIBRARY_ZIP_EMPTY_CODE;
      throw e;
    }

    const snapshot = await this.canonicalStore.load();
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

    archive.pipe(dest);

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
      archive.file(abs, { name: nameInZip });
    }

    await archive.finalize();
    await finished;
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
    const snapshot = await this.canonicalStore.load();
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
