import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  PatronCollectionEntryRecord,
  PatronCollectionRecord,
  PatronCollectionsRoot
} from "./types.js";

function emptyRoot(): PatronCollectionsRoot {
  return { collections: [], entries: [] };
}

function entryDupKey(
  userId: string,
  creatorId: string,
  collectionId: string,
  mediaId: string
): string {
  return `${userId}\0${creatorId}\0${collectionId}\0${mediaId}`;
}

export class FilePatronCollectionsStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<PatronCollectionsRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as PatronCollectionsRoot;
    } catch {
      return emptyRoot();
    }
  }

  public async save(root: PatronCollectionsRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async listCollectionsWithEntries(
    creatorId: string,
    userId: string
  ): Promise<Array<PatronCollectionRecord & { entries: PatronCollectionEntryRecord[] }>> {
    const root = await this.load();
    const cols = root.collections
      .filter((c) => c.creator_id === creatorId && c.user_id === userId)
      .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
    return cols.map((c) => ({
      ...c,
      entries: root.entries
        .filter((e) => e.collection_id === c.collection_id && e.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }));
  }

  public async createCollection(
    creatorId: string,
    userId: string,
    title: string
  ): Promise<PatronCollectionRecord> {
    const root = await this.load();
    const now = new Date().toISOString();
    const maxOrder = root.collections
      .filter((c) => c.creator_id === creatorId && c.user_id === userId)
      .reduce((m, c) => Math.max(m, c.sort_order), -1);
    const record: PatronCollectionRecord = {
      collection_id: `pcol_${randomUUID()}`,
      user_id: userId,
      creator_id: creatorId,
      title: title.trim() || "Untitled",
      sort_order: maxOrder + 1,
      created_at: now,
      updated_at: now
    };
    root.collections.push(record);
    await this.save(root);
    return record;
  }

  public async updateCollection(
    creatorId: string,
    userId: string,
    collectionId: string,
    patch: { title?: string; sort_order?: number }
  ): Promise<PatronCollectionRecord | null> {
    const root = await this.load();
    const c = root.collections.find(
      (x) =>
        x.collection_id === collectionId &&
        x.creator_id === creatorId &&
        x.user_id === userId
    );
    if (!c) return null;
    if (typeof patch.title === "string") {
      c.title = patch.title.trim() || "Untitled";
    }
    if (typeof patch.sort_order === "number" && Number.isFinite(patch.sort_order)) {
      c.sort_order = patch.sort_order;
    }
    c.updated_at = new Date().toISOString();
    await this.save(root);
    return c;
  }

  public async deleteCollection(
    creatorId: string,
    userId: string,
    collectionId: string
  ): Promise<boolean> {
    const root = await this.load();
    const before = root.collections.length;
    root.collections = root.collections.filter(
      (c) =>
        !(
          c.collection_id === collectionId &&
          c.creator_id === creatorId &&
          c.user_id === userId
        )
    );
    root.entries = root.entries.filter(
      (e) => !(e.collection_id === collectionId && e.user_id === userId)
    );
    await this.save(root);
    return root.collections.length < before;
  }

  /** Idempotent: returns existing entry if duplicate media in same collection. */
  public async addEntry(
    creatorId: string,
    userId: string,
    collectionId: string,
    postId: string,
    mediaId: string
  ): Promise<PatronCollectionEntryRecord> {
    const root = await this.load();
    const col = root.collections.find(
      (c) =>
        c.collection_id === collectionId &&
        c.creator_id === creatorId &&
        c.user_id === userId
    );
    if (!col) {
      throw new Error("Collection not found.");
    }
    const key = entryDupKey(userId, creatorId, collectionId, mediaId);
    const existing = root.entries.find(
      (e) => entryDupKey(e.user_id, e.creator_id, e.collection_id, e.media_id) === key
    );
    if (existing) {
      return existing;
    }
    const entry: PatronCollectionEntryRecord = {
      entry_id: `pent_${randomUUID()}`,
      collection_id: collectionId,
      user_id: userId,
      creator_id: creatorId,
      post_id: postId,
      media_id: mediaId,
      created_at: new Date().toISOString()
    };
    root.entries.push(entry);
    col.updated_at = new Date().toISOString();
    await this.save(root);
    return entry;
  }

  public async removeEntry(
    creatorId: string,
    userId: string,
    collectionId: string,
    postId: string,
    mediaId: string
  ): Promise<boolean> {
    const root = await this.load();
    const before = root.entries.length;
    root.entries = root.entries.filter(
      (e) =>
        !(
          e.collection_id === collectionId &&
          e.user_id === userId &&
          e.creator_id === creatorId &&
          e.post_id === postId &&
          e.media_id === mediaId
        )
    );
    const col = root.collections.find((c) => c.collection_id === collectionId);
    if (col && col.user_id === userId && col.creator_id === creatorId) {
      col.updated_at = new Date().toISOString();
    }
    await this.save(root);
    return root.entries.length < before;
  }

  /** Media IDs that appear in any patron collection for this user+creator. */
  public async listSnippedMediaIds(creatorId: string, userId: string): Promise<Set<string>> {
    const root = await this.load();
    const ids = new Set<string>();
    for (const e of root.entries) {
      if (e.creator_id === creatorId && e.user_id === userId) {
        ids.add(e.media_id);
      }
    }
    return ids;
  }
}
