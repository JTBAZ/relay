import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Collection, CollectionsRoot } from "./types.js";

function emptyRoot(): CollectionsRoot {
  return { collections: [] };
}

function normalizeCollection(c: Collection): Collection {
  return {
    ...c,
    theme_tag_ids: Array.isArray(c.theme_tag_ids) ? c.theme_tag_ids : []
  };
}

export class FileCollectionsStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<CollectionsRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as CollectionsRoot;
    } catch {
      return emptyRoot();
    }
  }

  private async save(root: CollectionsRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async listForCreator(creatorId: string): Promise<Collection[]> {
    const root = await this.load();
    return root.collections
      .filter((c) => c.creator_id === creatorId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => normalizeCollection(c));
  }

  public async getById(collectionId: string): Promise<Collection | null> {
    const root = await this.load();
    const col = root.collections.find((c) => c.collection_id === collectionId);
    return col ? normalizeCollection(col) : null;
  }

  public async create(
    creatorId: string,
    title: string,
    description?: string,
    extras?: {
      access_ceiling_tier_id?: string;
      theme_tag_ids?: string[];
    }
  ): Promise<Collection> {
    const root = await this.load();
    const existing = root.collections.filter((c) => c.creator_id === creatorId);
    const maxOrder = existing.reduce((m, c) => Math.max(m, c.sort_order), -1);
    const now = new Date().toISOString();
    const collection: Collection = {
      collection_id: `col_${randomUUID()}`,
      creator_id: creatorId,
      title,
      description,
      ...(extras?.access_ceiling_tier_id
        ? { access_ceiling_tier_id: extras.access_ceiling_tier_id }
        : {}),
      theme_tag_ids: extras?.theme_tag_ids?.length ? [...extras.theme_tag_ids] : [],
      post_ids: [],
      sort_order: maxOrder + 1,
      created_at: now,
      updated_at: now
    };
    root.collections.push(collection);
    await this.save(root);
    return normalizeCollection(collection);
  }

  public async update(
    collectionId: string,
    patch: Partial<
      Pick<
        Collection,
        | "title"
        | "description"
        | "cover_media_id"
        | "sort_order"
        | "theme_tag_ids"
      > & { access_ceiling_tier_id?: string | null }
    >
  ): Promise<Collection | null> {
    const root = await this.load();
    const col = root.collections.find((c) => c.collection_id === collectionId);
    if (!col) return null;
    if (patch.title !== undefined) col.title = patch.title;
    if (patch.description !== undefined) col.description = patch.description;
    if (patch.cover_media_id !== undefined) col.cover_media_id = patch.cover_media_id;
    if (patch.sort_order !== undefined) col.sort_order = patch.sort_order;
    if (patch.access_ceiling_tier_id !== undefined) {
      const v = patch.access_ceiling_tier_id;
      if (v === null || v === "") {
        delete col.access_ceiling_tier_id;
      } else {
        col.access_ceiling_tier_id = v;
      }
    }
    if (patch.theme_tag_ids !== undefined) {
      col.theme_tag_ids = [...patch.theme_tag_ids];
    }
    col.updated_at = new Date().toISOString();
    await this.save(root);
    return normalizeCollection(col);
  }

  public async delete(collectionId: string): Promise<boolean> {
    const root = await this.load();
    const idx = root.collections.findIndex((c) => c.collection_id === collectionId);
    if (idx < 0) return false;
    root.collections.splice(idx, 1);
    await this.save(root);
    return true;
  }

  public async addPosts(collectionId: string, postIds: string[]): Promise<Collection | null> {
    const root = await this.load();
    const col = root.collections.find((c) => c.collection_id === collectionId);
    if (!col) return null;
    const existing = new Set(col.post_ids);
    for (const id of postIds) existing.add(id);
    col.post_ids = [...existing];
    col.updated_at = new Date().toISOString();
    await this.save(root);
    return normalizeCollection(col);
  }

  public async removePosts(collectionId: string, postIds: string[]): Promise<Collection | null> {
    const root = await this.load();
    const col = root.collections.find((c) => c.collection_id === collectionId);
    if (!col) return null;
    const removeSet = new Set(postIds);
    col.post_ids = col.post_ids.filter((id) => !removeSet.has(id));
    col.updated_at = new Date().toISOString();
    await this.save(root);
    return normalizeCollection(col);
  }

  public async reorder(creatorId: string, orderedIds: string[]): Promise<void> {
    const root = await this.load();
    for (let i = 0; i < orderedIds.length; i++) {
      const col = root.collections.find(
        (c) => c.collection_id === orderedIds[i] && c.creator_id === creatorId
      );
      if (col) col.sort_order = i;
    }
    await this.save(root);
  }
}
