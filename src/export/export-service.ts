import archiver from "archiver";
import { createHash } from "node:crypto";
import { access, constants, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Writable } from "node:stream";
import type { FileCanonicalStore } from "../ingest/canonical-store.js";
import { FileExportIndex } from "./export-index.js";
import {
  buildMediaManifest,
  buildPostMap,
  buildTierMap
} from "./manifests.js";
import { fetchUpstreamWithRetries } from "./fetch-retry.js";
import type {
  CreatorExportIndex,
  ExportFetchRetryPolicy,
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

export class ExportService {
  private readonly canonicalStore: FileCanonicalStore;
  private readonly exportIndex: FileExportIndex;
  private readonly storageRoot: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retryPolicy: ExportFetchRetryPolicy;
  private readonly sleepFn: (ms: number) => Promise<void>;

  public constructor(
    canonicalStore: FileCanonicalStore,
    exportIndex: FileExportIndex,
    storageRoot: string,
    fetchImpl?: typeof fetch,
    retryPolicy?: Partial<ExportFetchRetryPolicy>,
    sleepFn?: (ms: number) => Promise<void>
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
  }

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
      return {
        media_id: mediaId,
        creator_id: creatorId,
        sha256: existing.sha256,
        byte_length: existing.byte_length,
        idempotent_skip: true
      };
    }

    try {
      const response = await fetchUpstreamWithRetries(
        url,
        this.fetchImpl,
        this.retryPolicy,
        this.sleepFn
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

  public async readBlob(creatorId: string, mediaId: string): Promise<Buffer> {
    const index = await this.exportIndex.load(creatorId);
    const rec = index.media[mediaId];
    if (!rec) {
      throw new Error(`No export record for media ${mediaId}`);
    }
    const absolutePath = join(
      this.storageRoot,
      creatorId,
      ...rec.relative_blob_path.split("/")
    );
    return readFile(absolutePath);
  }

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

  public async getExportRecord(creatorId: string, mediaId: string) {
    const index = await this.exportIndex.load(creatorId);
    return index.media[mediaId] ?? null;
  }

  /** True when there is nothing to put in `GET /api/v1/export/library-zip`. */
  public async isLibraryZipEmpty(creatorId: string): Promise<boolean> {
    const index = await this.exportIndex.load(creatorId);
    return Object.keys(index.media ?? {}).length === 0;
  }

  /**
   * `relative_blob_path` values in the export index that are not readable on disk.
   * Stale index rows (e.g. files removed manually) cause archiver to fail mid-stream unless checked first.
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
