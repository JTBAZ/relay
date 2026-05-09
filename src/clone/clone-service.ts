/**
 * @fileoverview Application service wiring canonical ingest, export index, and clone persistence.
 * @description Regenerates clone models and offers preview/parity helpers for operators.
 * @see ./clone-generator.js
 * @see ./clone-store.js
 * @see ../export/export-index.js FileExportIndex
 */

import type { CanonicalStore } from "../ingest/canonical-store.js";
import type { FileExportIndex } from "../export/export-index.js";
import { generateCloneSiteModel } from "./clone-generator.js";
import type { CloneSiteStore } from "./clone-store.js";
import type { ClonePreviewPage, CloneSiteModel } from "./types.js";

/**
 * @description Coordinates clone regeneration and read paths.
 * @security-audit-required All methods are `creatorId`-scoped; HTTP must verify the caller owns the creator/tenant.
 */
export class CloneService {
  private readonly canonical: CanonicalStore;
  private readonly exportIndex: FileExportIndex;
  private readonly cloneStore: CloneSiteStore;

  /**
   * @param canonical Canonical ingest store.
   * @param exportIndex Per-creator export manifest reader.
   * @param cloneStore File or DB-backed clone persistence.
   */
  public constructor(
    canonical: CanonicalStore,
    exportIndex: FileExportIndex,
    cloneStore: CloneSiteStore
  ) {
    this.canonical = canonical;
    this.exportIndex = exportIndex;
    this.cloneStore = cloneStore;
  }

  /**
   * @description Loads canonical + export index, builds model, persists, returns model.
   * @param creatorId Creator scope.
   * @param baseUrl Public base URL for links.
   * @returns Freshly generated `CloneSiteModel`.
   * @async
   * @throws {Error} On canonical/export/clone store failures.
   */
  public async generate(
    creatorId: string,
    baseUrl: string
  ): Promise<CloneSiteModel> {
    const snap = await this.canonical.load();
    const idx = await this.exportIndex.load(creatorId);
    const model = generateCloneSiteModel(creatorId, snap, idx, baseUrl);
    await this.cloneStore.upsert(model);
    return model;
  }

  /**
   * @description Loads persisted clone snapshot when present.
   * @param creatorId Creator scope.
   * @returns Stored model or `null`.
   * @async
   * @throws {Error} Persistence read failures propagate.
   */
  public async getLatest(creatorId: string): Promise<CloneSiteModel | null> {
    return this.cloneStore.getByCreator(creatorId);
  }

  /**
   * @description Maps stored posts into lightweight URLs for previews.
   * @param creatorId Creator scope.
   * @returns Preview rows or `null` when no clone exists.
   * @async
   * @throws {Error} On store read failure.
   */
  public async previewPages(
    creatorId: string
  ): Promise<ClonePreviewPage[] | null> {
    const model = await this.cloneStore.getByCreator(creatorId);
    if (!model) return null;
    return model.posts.map((p) => ({
      url: `${model.base_url}/posts/${p.slug}`,
      post_id: p.post_id,
      title: p.title,
      access: p.access,
      media_count: p.media.length
    }));
  }

  /**
   * @description Compares canonical active posts against clone snapshot for QA metrics.
   * @param creatorId Creator scope.
   * @returns Counts and missing post identifiers.
   * @async
   * @throws {Error} On canonical or clone load failure.
   */
  public async parityCheck(
    creatorId: string
  ): Promise<{
    canonical_active_posts: number;
    clone_posts: number;
    parity_percent: number;
    missing_post_ids: string[];
  }> {
    const snap = await this.canonical.load();
    const posts = snap.posts[creatorId] ?? {};
    const activeIds = Object.keys(posts).filter(
      (id) => posts[id].upstream_status === "active"
    );

    const model = await this.cloneStore.getByCreator(creatorId);
    if (!model) {
      return {
        canonical_active_posts: activeIds.length,
        clone_posts: 0,
        parity_percent: 0,
        missing_post_ids: activeIds
      };
    }

    const clonePostIds = new Set(model.posts.map((p) => p.post_id));
    const missing = activeIds.filter((id) => !clonePostIds.has(id));
    const parity =
      activeIds.length === 0
        ? 100
        : Math.round(
            ((activeIds.length - missing.length) / activeIds.length) * 10000
          ) / 100;

    return {
      canonical_active_posts: activeIds.length,
      clone_posts: model.posts.length,
      parity_percent: parity,
      missing_post_ids: missing
    };
  }
}
