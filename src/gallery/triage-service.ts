import type { FileCanonicalStore } from "../ingest/canonical-store.js";
import type { FileExportIndex } from "../export/export-index.js";
import type { FileGalleryOverridesStore } from "./overrides-store.js";

export type TriageResult = {
  text_only_post_ids: string[];
  duplicate_groups: { canonical_post_id: string; duplicate_post_ids: string[] }[];
  small_media_ids: string[];
  total_flagged: number;
};

const SMALL_BYTE_THRESHOLD = 5_120; // 5 KB

export class TriageService {
  private readonly canonical: FileCanonicalStore;
  private readonly exportIndex: FileExportIndex;

  public constructor(
    canonical: FileCanonicalStore,
    exportIndex: FileExportIndex
  ) {
    this.canonical = canonical;
    this.exportIndex = exportIndex;
  }

  public async analyze(creatorId: string): Promise<TriageResult> {
    const snapshot = await this.canonical.load();
    const index = await this.exportIndex.load(creatorId);
    const posts = snapshot.posts[creatorId] ?? {};

    const textOnlyIds: string[] = [];
    const smallMediaIds: string[] = [];

    // title+sha -> first postId seen, used for duplicate detection
    const signatureMap = new Map<string, string>();
    const duplicateMap = new Map<string, string[]>();

    for (const [postId, row] of Object.entries(posts)) {
      if (row.upstream_status === "deleted") continue;

      // Text-only: posts with no media
      if (row.current.media_ids.length === 0) {
        textOnlyIds.push(postId);
        continue;
      }

      // Small media detection
      for (const mediaId of row.current.media_ids) {
        const exp = index.media[mediaId];
        if (exp && exp.byte_length < SMALL_BYTE_THRESHOLD) {
          smallMediaIds.push(mediaId);
        }
      }

      // Duplicate detection: title + sha256 set
      const shas = row.current.media_ids
        .map((mid) => index.media[mid]?.sha256)
        .filter(Boolean)
        .sort();
      if (shas.length > 0) {
        const sig = `${row.current.title.trim().toLowerCase()}::${shas.join(",")}`;
        const existing = signatureMap.get(sig);
        if (existing) {
          if (!duplicateMap.has(existing)) {
            duplicateMap.set(existing, []);
          }
          duplicateMap.get(existing)!.push(postId);
        } else {
          signatureMap.set(sig, postId);
        }
      }
    }

    const duplicateGroups = Array.from(duplicateMap.entries()).map(
      ([canonical_post_id, duplicate_post_ids]) => ({
        canonical_post_id,
        duplicate_post_ids
      })
    );

    const total_flagged =
      textOnlyIds.length +
      duplicateGroups.reduce((n, g) => n + g.duplicate_post_ids.length, 0) +
      smallMediaIds.length;

    return {
      text_only_post_ids: textOnlyIds,
      duplicate_groups: duplicateGroups,
      small_media_ids: smallMediaIds,
      total_flagged
    };
  }

  public async autoFlag(
    creatorId: string,
    overrides: FileGalleryOverridesStore
  ): Promise<TriageResult> {
    const result = await this.analyze(creatorId);

    const postIdsToFlag = new Set<string>();
    for (const id of result.text_only_post_ids) postIdsToFlag.add(id);
    for (const g of result.duplicate_groups) {
      for (const id of g.duplicate_post_ids) postIdsToFlag.add(id);
    }

    // Map small media back to post IDs
    const snapshot = await this.canonical.load();
    const posts = snapshot.posts[creatorId] ?? {};
    for (const [postId, row] of Object.entries(posts)) {
      if (row.upstream_status === "deleted") continue;
      for (const mid of row.current.media_ids) {
        if (result.small_media_ids.includes(mid)) {
          postIdsToFlag.add(postId);
        }
      }
    }

    if (postIdsToFlag.size > 0) {
      await overrides.setVisibility(creatorId, [...postIdsToFlag], "flagged");
    }

    return result;
  }
}
