import type { FileCanonicalStore } from "../ingest/canonical-store.js";
import type { FileExportIndex } from "../export/export-index.js";
import {
  buildGalleryItems,
  collectFacets,
  listGalleryItems
} from "./query.js";
import type { FileGalleryOverridesStore } from "./overrides-store.js";
import type { FileCollectionsStore } from "./collections-store.js";
import type {
  GalleryListParams,
  GalleryListResult,
  GalleryPostDetail,
  GalleryTierFacet
} from "./types.js";

export class GalleryService {
  private readonly canonical: FileCanonicalStore;
  private readonly exportIndex: FileExportIndex;
  private readonly overrides: FileGalleryOverridesStore;
  private collections: FileCollectionsStore | null = null;

  public constructor(
    canonical: FileCanonicalStore,
    exportIndex: FileExportIndex,
    overrides: FileGalleryOverridesStore
  ) {
    this.canonical = canonical;
    this.exportIndex = exportIndex;
    this.overrides = overrides;
  }

  public setCollections(store: FileCollectionsStore): void {
    this.collections = store;
  }

  private async loadCollections(creatorId: string) {
    if (!this.collections) return [];
    return this.collections.listForCreator(creatorId);
  }

  public async list(params: GalleryListParams): Promise<GalleryListResult> {
    const snapshot = await this.canonical.load();
    const index = await this.exportIndex.load(params.creator_id);
    const ov = await this.overrides.load();
    const cols = await this.loadCollections(params.creator_id);
    const all = buildGalleryItems(params.creator_id, snapshot, index, ov, cols);
    return listGalleryItems(all, params);
  }

  public async facets(creatorId: string): Promise<{
    tag_ids: string[];
    tier_ids: string[];
    tiers: GalleryTierFacet[];
  }> {
    const snapshot = await this.canonical.load();
    const index = await this.exportIndex.load(creatorId);
    const ov = await this.overrides.load();
    const cols = await this.loadCollections(creatorId);
    const all = buildGalleryItems(creatorId, snapshot, index, ov, cols);
    const facetValues = collectFacets(all);
    const tierMap = snapshot.tiers[creatorId] ?? {};

    // Union of tier_ids seen on posts PLUS every tier stored in canonical for this
    // creator. This ensures the Access Review panel shows campaign tiers even before
    // all posts have been re-ingested with tier data.
    const allTierIds = new Set([...Object.keys(tierMap), ...facetValues.tier_ids]);
    const tiers = [...allTierIds].sort().map((tierId) => ({
      tier_id: tierId,
      title: tierMap[tierId]?.title ?? tierId
    }));
    return { ...facetValues, tiers };
  }

  public async postDetail(creatorId: string, postId: string): Promise<GalleryPostDetail | null> {
    const snapshot = await this.canonical.load();
    const post = snapshot.posts[creatorId]?.[postId];
    if (!post || post.upstream_status === "deleted") {
      return null;
    }
    const index = await this.exportIndex.load(creatorId);
    const ov = await this.overrides.load();
    const cols = await this.loadCollections(creatorId);
    const all = buildGalleryItems(creatorId, snapshot, index, ov, cols);
    const media = all.filter((item) => item.post_id === postId);
    const tierMap = snapshot.tiers[creatorId] ?? {};
    const tiers = post.current.tier_ids.map((tierId) => ({
      tier_id: tierId,
      title: tierMap[tierId]?.title ?? tierId
    }));
    return {
      post_id: postId,
      title: post.current.title,
      description: post.current.description,
      published_at: post.current.published_at,
      tag_ids: [...post.current.tag_ids],
      tiers,
      media
    };
  }
}
