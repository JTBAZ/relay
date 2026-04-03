import type { FileCanonicalStore } from "../ingest/canonical-store.js";
import type { FileExportIndex } from "../export/export-index.js";
import type { FileGalleryOverridesStore } from "./overrides-store.js";

export type TriageResult = {
  text_only_post_ids: string[];
  duplicate_groups: { canonical_post_id: string; duplicate_post_ids: string[] }[];
  small_media_ids: string[];
  cover_media_ids: string[];
  /** Count of posts/media rows that auto-clean would move to Review (for UI summaries). */
  total_review_items: number;
};

export const TRIAGE_CATEGORY_KEYS = [
  "text_only",
  "duplicates",
  "small_media",
  "cover_images"
] as const;
export type TriageCategory = (typeof TRIAGE_CATEGORY_KEYS)[number];

const SMALL_BYTE_THRESHOLD = 5_120; // 5 KB

function normalizeTriageCategories(raw: string[] | undefined): Set<TriageCategory> {
  if (!raw?.length) {
    return new Set(TRIAGE_CATEGORY_KEYS);
  }
  const out = new Set<TriageCategory>();
  for (const x of raw) {
    if ((TRIAGE_CATEGORY_KEYS as readonly string[]).includes(x)) {
      out.add(x as TriageCategory);
    }
  }
  return out.size > 0 ? out : new Set(TRIAGE_CATEGORY_KEYS);
}

type PostDupDigest = {
  post_id: string;
  norm_title: string;
  published_at: string;
  shas: string[];
  non_cover_count: number;
  cover_count: number;
};

class UnionFind {
  private readonly parent = new Map<string, string>();

  public find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }

  public union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent.set(ra, rb);
    }
  }
}

function pickCanonical(posts: PostDupDigest[]): PostDupDigest {
  let best = posts[0]!;
  for (let i = 1; i < posts.length; i++) {
    const p = posts[i]!;
    if (p.non_cover_count !== best.non_cover_count) {
      best = p.non_cover_count > best.non_cover_count ? p : best;
      continue;
    }
    if (p.cover_count !== best.cover_count) {
      best = p.cover_count < best.cover_count ? p : best;
      continue;
    }
    if (p.published_at !== best.published_at) {
      best = p.published_at < best.published_at ? p : best;
      continue;
    }
    best = p.post_id < best.post_id ? p : best;
  }
  return best;
}

/** Exported for unit tests. */
export function buildDuplicateGroupsByTitleAndSha(
  posts: Record<string, { upstream_status?: string; current: { title: string; published_at: string; media_ids: string[] } }>,
  mediaMap: Record<string, { upstream_status?: string; current: { role?: string } }>,
  index: { media: Record<string, { sha256?: string } | undefined> }
): { canonical_post_id: string; duplicate_post_ids: string[] }[] {
  const digests: PostDupDigest[] = [];
  for (const [postId, row] of Object.entries(posts)) {
    if (row.upstream_status === "deleted") continue;
    if (row.current.media_ids.length === 0) continue;
    const shaSet = new Set<string>();
    let nonCover = 0;
    let cover = 0;
    for (const mid of row.current.media_ids) {
      const mrow = mediaMap[mid];
      if (!mrow || mrow.upstream_status === "deleted") continue;
      const sha = index.media[mid]?.sha256;
      if (sha) {
        shaSet.add(sha);
      }
      if (mrow.current.role === "cover") {
        cover += 1;
      } else {
        nonCover += 1;
      }
    }
    const shas = [...shaSet].sort();
    if (shas.length === 0) {
      continue;
    }
    digests.push({
      post_id: postId,
      norm_title: row.current.title.trim().toLowerCase(),
      published_at: row.current.published_at,
      shas,
      non_cover_count: nonCover,
      cover_count: cover
    });
  }

  const byTitle = new Map<string, PostDupDigest[]>();
  for (const d of digests) {
    const arr = byTitle.get(d.norm_title);
    if (arr) {
      arr.push(d);
    } else {
      byTitle.set(d.norm_title, [d]);
    }
  }

  const groupsOut: { canonical_post_id: string; duplicate_post_ids: string[] }[] = [];

  for (const titleGroup of byTitle.values()) {
    if (titleGroup.length < 2) {
      continue;
    }
    const uf = new UnionFind();
    const shaToPosts = new Map<string, string[]>();
    for (const d of titleGroup) {
      for (const sha of d.shas) {
        const list = shaToPosts.get(sha);
        if (list) {
          list.push(d.post_id);
        } else {
          shaToPosts.set(sha, [d.post_id]);
        }
      }
    }
    for (const ids of shaToPosts.values()) {
      if (ids.length < 2) {
        continue;
      }
      const first = ids[0]!;
      for (let i = 1; i < ids.length; i++) {
        uf.union(first, ids[i]!);
      }
    }

    const componentMap = new Map<string, PostDupDigest[]>();
    const idToDigest = new Map(titleGroup.map((d) => [d.post_id, d] as const));
    for (const d of titleGroup) {
      const root = uf.find(d.post_id);
      const arr = componentMap.get(root);
      if (arr) {
        arr.push(d);
      } else {
        componentMap.set(root, [d]);
      }
    }

    for (const cluster of componentMap.values()) {
      if (cluster.length < 2) {
        continue;
      }
      const canonical = pickCanonical(cluster);
      const duplicate_post_ids = cluster
        .filter((d) => d.post_id !== canonical.post_id)
        .map((d) => d.post_id)
        .sort();
      groupsOut.push({
        canonical_post_id: canonical.post_id,
        duplicate_post_ids
      });
    }
  }

  return groupsOut;
}

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
    const mediaMap = snapshot.media[creatorId] ?? {};

    const textOnlyIds: string[] = [];
    const smallMediaIds: string[] = [];
    const coverMediaIds: string[] = [];

    for (const [postId, row] of Object.entries(posts)) {
      if (row.upstream_status === "deleted") continue;

      if (row.current.media_ids.length === 0) {
        textOnlyIds.push(postId);
        continue;
      }

      for (const mediaId of row.current.media_ids) {
        const exp = index.media[mediaId];
        if (exp && exp.byte_length < SMALL_BYTE_THRESHOLD) {
          smallMediaIds.push(mediaId);
        }

        const mediaRow = mediaMap[mediaId];
        if (mediaRow?.current.role === "cover") {
          coverMediaIds.push(mediaId);
        }
      }
    }

    const duplicateGroups = buildDuplicateGroupsByTitleAndSha(posts, mediaMap, index);

    const total_review_items =
      textOnlyIds.length +
      duplicateGroups.reduce((n, g) => n + g.duplicate_post_ids.length, 0) +
      smallMediaIds.length +
      coverMediaIds.length;

    return {
      text_only_post_ids: textOnlyIds,
      duplicate_groups: duplicateGroups,
      small_media_ids: smallMediaIds,
      cover_media_ids: coverMediaIds,
      total_review_items
    };
  }

  public async autoFlag(
    creatorId: string,
    overrides: FileGalleryOverridesStore,
    categories?: string[]
  ): Promise<TriageResult> {
    const result = await this.analyze(creatorId);
    const cat = normalizeTriageCategories(categories);

    const postIdsToFlag = new Set<string>();
    const mediaFlagTargets: { post_id: string; media_id: string }[] = [];

    if (cat.has("text_only")) {
      for (const id of result.text_only_post_ids) {
        postIdsToFlag.add(id);
      }
    }
    if (cat.has("duplicates")) {
      for (const g of result.duplicate_groups) {
        for (const id of g.duplicate_post_ids) {
          postIdsToFlag.add(id);
        }
      }
    }

    const smallSet = cat.has("small_media") ? new Set(result.small_media_ids) : null;
    const coverSet = cat.has("cover_images") ? new Set(result.cover_media_ids) : null;
    if (smallSet?.size || coverSet?.size) {
      const snapshot = await this.canonical.load();
      const posts = snapshot.posts[creatorId] ?? {};
      for (const [postId, row] of Object.entries(posts)) {
        if (row.upstream_status === "deleted") continue;
        for (const mid of row.current.media_ids) {
          const hitSmall = smallSet?.has(mid) ?? false;
          const hitCover = coverSet?.has(mid) ?? false;
          if (hitSmall || hitCover) {
            mediaFlagTargets.push({ post_id: postId, media_id: mid });
          }
        }
      }
    }

    if (postIdsToFlag.size > 0) {
      await overrides.setVisibility(creatorId, [...postIdsToFlag], "review");
    }
    if (mediaFlagTargets.length > 0) {
      await overrides.setMediaVisibility(
        creatorId,
        mediaFlagTargets.map((t) => ({ ...t, visibility: "review" }))
      );
    }

    return result;
  }
}
