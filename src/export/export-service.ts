import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileCanonicalStore } from "../ingest/canonical-store.js";
import { FileExportIndex } from "./export-index.js";
import {
  buildMediaManifest,
  buildPostMap,
  buildTierMap
} from "./manifests.js";
import type { ExportOneResult } from "./types.js";

export class ExportService {
  private readonly canonicalStore: FileCanonicalStore;
  private readonly exportIndex: FileExportIndex;
  private readonly storageRoot: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(
    canonicalStore: FileCanonicalStore,
    exportIndex: FileExportIndex,
    storageRoot: string,
    fetchImpl?: typeof fetch
  ) {
    this.canonicalStore = canonicalStore;
    this.exportIndex = exportIndex;
    this.storageRoot = storageRoot;
    this.fetchImpl = fetchImpl ?? fetch;
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
    const existing = index.media[mediaId];
    if (
      existing &&
      existing.upstream_revision === row.current.upstream_revision
    ) {
      return {
        media_id: mediaId,
        creator_id: creatorId,
        sha256: existing.sha256,
        byte_length: existing.byte_length,
        idempotent_skip: true
      };
    }

    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }
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
    await this.exportIndex.save(index);

    return {
      media_id: mediaId,
      creator_id: creatorId,
      sha256,
      byte_length: buffer.byteLength,
      idempotent_skip: false
    };
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
