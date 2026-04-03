import type { FileCanonicalStore } from "../ingest/canonical-store.js";
import type { FileExportIndex } from "../export/export-index.js";
import { evaluateTierRules } from "../clone/tier-rules.js";
import type { SessionToken } from "../identity/types.js";
import {
  buildGalleryItems,
  collectFacets,
  effectiveTags,
  galleryItemsPostPrimaryView,
  listGalleryItems
} from "./query.js";
import { redactGalleryItemExportIfLocked } from "./patron-media-access.js";
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

  public async list(
    params: GalleryListParams & { patron_session?: SessionToken | null }
  ): Promise<GalleryListResult> {
    const snapshot = await this.canonical.load();
    const index = await this.exportIndex.load(params.creator_id);
    const ov = await this.overrides.load();
    const cols = await this.loadCollections(params.creator_id);
    let all = buildGalleryItems(params.creator_id, snapshot, index, ov, cols);
    const wantsSearchFocus = params.display === "post_primary" && Boolean(params.q?.trim());
    if (params.display === "post_primary" && !wantsSearchFocus) {
      all = galleryItemsPostPrimaryView(all);
    }
    const result = listGalleryItems(all, params);
    if (params.visitor_catalog) {
      const tierRules = evaluateTierRules(snapshot.tiers[params.creator_id] ?? {});
      const session = params.patron_session ?? null;
      result.items = result.items.map((item) =>
        redactGalleryItemExportIfLocked(item, params.creator_id, session, tierRules)
      );
    }
    return result;
  }

  public async facets(
    creatorId: string,
    options?: { visitor_catalog?: boolean }
  ): Promise<{
    tag_ids: string[];
    tier_ids: string[];
    tiers: GalleryTierFacet[];
    tag_counts: Record<string, number>;
  }> {
    const snapshot = await this.canonical.load();
    const index = await this.exportIndex.load(creatorId);
    const ov = await this.overrides.load();
    const cols = await this.loadCollections(creatorId);
    let all = buildGalleryItems(creatorId, snapshot, index, ov, cols);
    if (options?.visitor_catalog) {
      all = all.filter((i) => i.visibility !== "hidden");
    }
    const facetValues = collectFacets(all);
    const tierMap = snapshot.tiers[creatorId] ?? {};

    // Union of tier_ids seen on posts PLUS every tier stored in canonical for this
    // creator. This ensures the Access Review panel shows campaign tiers even before
    // all posts have been re-ingested with tier data.
    const allTierIds = new Set([...Object.keys(tierMap), ...facetValues.tier_ids]);
    const tiers = [...allTierIds].sort().map((tierId) => {
      const row = tierMap[tierId];
      const facet: import("./types.js").GalleryTierFacet = {
        tier_id: tierId,
        title: row?.title ?? tierId
      };
      if (typeof row?.amount_cents === "number" && Number.isFinite(row.amount_cents)) {
        facet.amount_cents = row.amount_cents;
      }
      return facet;
    });
    return { ...facetValues, tiers };
  }

  public async postDetail(
    creatorId: string,
    postId: string,
    options?: { visitor_catalog?: boolean; patron_session?: SessionToken | null }
  ): Promise<GalleryPostDetail | null> {
    const snapshot = await this.canonical.load();
    const post = snapshot.posts[creatorId]?.[postId];
    if (!post || post.upstream_status === "deleted") {
      return null;
    }
    const index = await this.exportIndex.load(creatorId);
    const ov = await this.overrides.load();
    const cols = await this.loadCollections(creatorId);
    const all = buildGalleryItems(creatorId, snapshot, index, ov, cols);
    let media = all.filter((item) => item.post_id === postId);
    if (options?.visitor_catalog) {
      media = media.filter((m) => m.visibility !== "hidden");
      if (media.length === 0) {
        return null;
      }
    }
    if (options?.visitor_catalog) {
      const tierRules = evaluateTierRules(snapshot.tiers[creatorId] ?? {});
      const session = options.patron_session ?? null;
      media = media.map((item) =>
        redactGalleryItemExportIfLocked(item, creatorId, session, tierRules)
      );
    }
    const tierMap = snapshot.tiers[creatorId] ?? {};
    const tiers = post.current.tier_ids.map((tierId) => {
      const row = tierMap[tierId];
      const facet: import("./types.js").GalleryTierFacet = {
        tier_id: tierId,
        title: row?.title ?? tierId
      };
      if (typeof row?.amount_cents === "number" && Number.isFinite(row.amount_cents)) {
        facet.amount_cents = row.amount_cents;
      }
      return facet;
    });
    return {
      post_id: postId,
      title: post.current.title,
      description: post.current.description,
      published_at: post.current.published_at,
      tag_ids: effectiveTags(post.current.tag_ids, creatorId, postId, ov),
      tiers,
      media
    };
  }

  /** Post ids that have at least one non-hidden gallery row (visitor-safe catalog). */
  public async visitorVisiblePostIdSet(creatorId: string): Promise<Set<string>> {
    const snapshot = await this.canonical.load();
    const index = await this.exportIndex.load(creatorId);
    const ov = await this.overrides.load();
    const cols = await this.loadCollections(creatorId);
    const all = buildGalleryItems(creatorId, snapshot, index, ov, cols);
    const set = new Set<string>();
    for (const it of all) {
      if (it.visibility !== "hidden") {
        set.add(it.post_id);
      }
    }
    return set;
  }
}
