/**
 * @fileoverview Orchestrates canonical snapshot + overrides + collections + presentation overlays into gallery API shapes.
 * @description Async façade over {@link ./query.js} builders with optional patron redaction.
 * @see ./types.js Wire DTOs
 * @see src/jsdoc-core-entities.ts Artist/Gallery/SyncStatus mapping notes
 */

import type { CanonicalStore } from "../ingest/canonical-store.js";
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
import type { GalleryOverridesStore } from "./overrides-store.js";
import type { RelayCollectionsStore } from "./collections-store.js";
import type {
  GalleryListParams,
  GalleryListResult,
  GalleryPostDetail,
  GalleryTierFacet
} from "./types.js";
import { mergePostPresentation } from "./effective-presentation.js";
import type { PostPresentationOverlay } from "./effective-presentation.js";

/**
 * @description Injected loader for DB-backed {@link PostPresentation} merges (`creatorId` scoped).
 */
export type LoadPostPresentationOverlays = (
  creatorId: string
) => Promise<Readonly<Record<string, PostPresentationOverlay>>>;

/**
 * @description Gallery read model service (list, facets, post detail, visitor-visible ids).
 * @security-audit-required All entrypoints take caller-supplied `creatorId`; HTTP layer must authorize tenant/creator alignment before use.
 */
export class GalleryService {
  private readonly canonical: CanonicalStore;
  private readonly exportIndex: FileExportIndex;
  private readonly overrides: GalleryOverridesStore;
  private collections: RelayCollectionsStore | null = null;
  private readonly loadPostPresentations?: LoadPostPresentationOverlays;

  /**
   * @description Constructs service with canonical/export/overrides stores and optional presentation loader.
   * @param canonical Canonical snapshot store.
   * @param exportIndex Export index accessor.
   * @param overrides Gallery overrides store.
   * @param options Optional `loadPostPresentations` for DB merge.
   */
  public constructor(
    canonical: CanonicalStore,
    exportIndex: FileExportIndex,
    overrides: GalleryOverridesStore,
    options?: { loadPostPresentations?: LoadPostPresentationOverlays }
  ) {
    this.canonical = canonical;
    this.exportIndex = exportIndex;
    this.overrides = overrides;
    this.loadPostPresentations = options?.loadPostPresentations;
  }

  /**
   * @description Attaches collections store for theme tags / membership in gallery rows.
   * @param store Collections implementation.
   */
  public setCollections(store: RelayCollectionsStore): void {
    this.collections = store;
  }

  private async loadCollections(creatorId: string) {
    if (!this.collections) return [];
    return this.collections.listForCreator(creatorId);
  }

  private async presentationByPostId(creatorId: string): Promise<
    Readonly<Partial<Record<string, PostPresentationOverlay>>> | undefined
  > {
    if (!this.loadPostPresentations) return undefined;
    return this.loadPostPresentations(creatorId);
  }

  /**
   * @description Paginated gallery list with filters; optionally redacts exports for visitor catalog mode.
   * @param params List params plus optional `patron_session` for visitor redaction.
   * @returns Sliced items + cursor.
   * @async
   * @throws Propagates failures from canonical/export/overrides/collections/presentation loaders.
   */
  public async list(
    params: GalleryListParams & { patron_session?: SessionToken | null }
  ): Promise<GalleryListResult> {
    const snapshot = await this.canonical.load();
    const index = await this.exportIndex.load(params.creator_id);
    const ov = await this.overrides.load();
    const cols = await this.loadCollections(params.creator_id);
    const pres = await this.presentationByPostId(params.creator_id);
    let all = buildGalleryItems(params.creator_id, snapshot, index, ov, cols, pres);
    const wantsSearchFocus = params.display === "post_primary" && Boolean(params.q?.trim());
    if (params.display === "post_primary" && !wantsSearchFocus) {
      all = galleryItemsPostPrimaryView(all);
    }
    const result = listGalleryItems(all, params);
    if (params.visitor_catalog) {
      const tierMap = snapshot.tiers[params.creator_id] ?? {};
      const tierRules = evaluateTierRules(tierMap);
      const session = params.patron_session ?? null;
      result.items = result.items.map((item) =>
        redactGalleryItemExportIfLocked(item, params.creator_id, session, tierRules, tierMap)
      );
    }
    return result;
  }

  /**
   * @description Aggregate tag/tier facets (and export stats when not visitor catalog).
   * @param creatorId Creator id.
   * @param options When `visitor_catalog`, omits export byte totals.
   * @returns Facet payload for UI filters.
   * @async
   * @throws Propagates backing store failures.
   */
  public async facets(
    creatorId: string,
    options?: { visitor_catalog?: boolean }
  ): Promise<{
    tag_ids: string[];
    tier_ids: string[];
    tiers: GalleryTierFacet[];
    tag_counts: Record<string, number>;
    /** Sum of exported blob sizes (export index only). Omitted for `visitor_catalog`. */
    export_total_bytes?: number;
    /** Count of entries in export index. Omitted for `visitor_catalog`. */
    export_media_count?: number;
  }> {
    const snapshot = await this.canonical.load();
    const index = await this.exportIndex.load(creatorId);
    const ov = await this.overrides.load();
    const cols = await this.loadCollections(creatorId);
    const pres = await this.presentationByPostId(creatorId);
    let all = buildGalleryItems(creatorId, snapshot, index, ov, cols, pres);
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
    const base = { ...facetValues, tiers };
    if (options?.visitor_catalog) {
      return base;
    }
    let exportTotalBytes = 0;
    for (const rec of Object.values(index.media ?? {})) {
      const n = rec.byte_length;
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
        exportTotalBytes += n;
      }
    }
    return {
      ...base,
      export_total_bytes: exportTotalBytes,
      export_media_count: Object.keys(index.media ?? {}).length
    };
  }

  /**
   * @description Single-post gallery detail with merged presentation and optional patron redaction.
   * @param creatorId Creator id.
   * @param postId Post id.
   * @param options Visitor catalog + patron session options.
   * @returns Detail DTO or null when missing/hidden for visitors.
   * @async
   * @throws Propagates backing store failures.
   */
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
    const pres = await this.presentationByPostId(creatorId);
    const all = buildGalleryItems(creatorId, snapshot, index, ov, cols, pres);
    let media = all.filter((item) => item.post_id === postId);
    if (options?.visitor_catalog) {
      media = media.filter((m) => m.visibility !== "hidden");
      if (media.length === 0) {
        return null;
      }
    }
    if (options?.visitor_catalog) {
      const tierMap = snapshot.tiers[creatorId] ?? {};
      const tierRules = evaluateTierRules(tierMap);
      const session = options.patron_session ?? null;
      media = media.map((item) =>
        redactGalleryItemExportIfLocked(item, creatorId, session, tierRules, tierMap)
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

    const overlay = pres?.[postId];
    const merged = mergePostPresentation(
      {
        title: post.current.title,
        description: post.current.description,
        media_ids: post.current.media_ids
      },
      overlay ?? undefined
    );

    return {
      post_id: postId,
      title: merged.title,
      description: merged.description,
      published_at: post.current.published_at,
      tag_ids: effectiveTags(post.current.tag_ids, creatorId, postId, ov),
      tiers,
      media,
      ...("tier_preview_settings" in merged
        ? { tier_preview_settings: merged.tier_preview_settings }
        : {})
    };
  }

  /**
   * @description Post ids that have at least one non-hidden gallery row (visitor-safe catalog seed).
   * @param creatorId Creator id.
   * @returns Set of post ids.
   * @async
   * @throws Propagates backing store failures.
   */
  public async visitorVisiblePostIdSet(creatorId: string): Promise<Set<string>> {
    const snapshot = await this.canonical.load();
    const index = await this.exportIndex.load(creatorId);
    const ov = await this.overrides.load();
    const cols = await this.loadCollections(creatorId);
    const pres = await this.presentationByPostId(creatorId);
    const all = buildGalleryItems(creatorId, snapshot, index, ov, cols, pres);
    const set = new Set<string>();
    for (const it of all) {
      if (it.visibility !== "hidden") {
        set.add(it.post_id);
      }
    }
    return set;
  }
}
