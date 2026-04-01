import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { GalleryOverridesRoot, PostVisibility } from "./types.js";

function emptyRoot(): GalleryOverridesRoot {
  return { creators: {} };
}

export class FileGalleryOverridesStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<GalleryOverridesRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as GalleryOverridesRoot;
    } catch {
      return emptyRoot();
    }
  }

  public async save(root: GalleryOverridesRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async mergePostTagDelta(
    creatorId: string,
    postId: string,
    delta: { add_tag_ids: string[]; remove_tag_ids: string[] }
  ): Promise<void> {
    const root = await this.load();
    if (!root.creators[creatorId]) {
      root.creators[creatorId] = { posts: {} };
    }
    const existing = root.creators[creatorId].posts[postId] ?? {
      add_tag_ids: [],
      remove_tag_ids: []
    };
    const addSet = new Set(existing.add_tag_ids);
    const remSet = new Set(existing.remove_tag_ids);
    for (const t of delta.add_tag_ids) {
      addSet.add(t);
      remSet.delete(t);
    }
    for (const t of delta.remove_tag_ids) {
      remSet.add(t);
      addSet.delete(t);
    }
    root.creators[creatorId].posts[postId] = {
      add_tag_ids: [...addSet],
      remove_tag_ids: [...remSet],
      ...(existing.visibility !== undefined ? { visibility: existing.visibility } : {}),
      ...(existing.media && Object.keys(existing.media).length > 0 ? { media: existing.media } : {})
    };
    await this.save(root);
  }

  public async setVisibility(
    creatorId: string,
    postIds: string[],
    visibility: PostVisibility
  ): Promise<void> {
    const root = await this.load();
    if (!root.creators[creatorId]) {
      root.creators[creatorId] = { posts: {} };
    }
    for (const postId of postIds) {
      const existing = root.creators[creatorId].posts[postId] ?? {
        add_tag_ids: [],
        remove_tag_ids: []
      };
      existing.visibility = visibility;
      root.creators[creatorId].posts[postId] = existing;
    }
    await this.save(root);
  }

  public async setMediaVisibility(
    creatorId: string,
    entries: { post_id: string; media_id: string; visibility: PostVisibility }[]
  ): Promise<void> {
    if (entries.length === 0) return;
    const root = await this.load();
    if (!root.creators[creatorId]) {
      root.creators[creatorId] = { posts: {} };
    }
    for (const { post_id: postId, media_id: mediaId, visibility } of entries) {
      const existing = root.creators[creatorId].posts[postId] ?? {
        add_tag_ids: [],
        remove_tag_ids: []
      };
      const media = { ...(existing.media ?? {}) };
      media[mediaId] = { visibility };
      existing.media = media;
      root.creators[creatorId].posts[postId] = existing;
    }
    await this.save(root);
  }
}
