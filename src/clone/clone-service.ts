import type { FileCanonicalStore } from "../ingest/canonical-store.js";
import type { FileExportIndex } from "../export/export-index.js";
import { generateCloneSiteModel } from "./clone-generator.js";
import type { FileCloneSiteStore } from "./clone-store.js";
import type { ClonePreviewPage, CloneSiteModel } from "./types.js";

export class CloneService {
  private readonly canonical: FileCanonicalStore;
  private readonly exportIndex: FileExportIndex;
  private readonly cloneStore: FileCloneSiteStore;

  public constructor(
    canonical: FileCanonicalStore,
    exportIndex: FileExportIndex,
    cloneStore: FileCloneSiteStore
  ) {
    this.canonical = canonical;
    this.exportIndex = exportIndex;
    this.cloneStore = cloneStore;
  }

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

  public async getLatest(creatorId: string): Promise<CloneSiteModel | null> {
    return this.cloneStore.getByCreator(creatorId);
  }

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
