import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PatronFavoriteRecord, PatronFavoritesRoot, PatronFavoriteTargetKind } from "./types.js";

function emptyRoot(): PatronFavoritesRoot {
  return { favorites: [] };
}

function favoriteKey(
  userId: string,
  creatorId: string,
  kind: PatronFavoriteTargetKind,
  targetId: string
): string {
  return `${userId}\0${creatorId}\0${kind}\0${targetId}`;
}

export class FilePatronFavoritesStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<PatronFavoritesRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as PatronFavoritesRoot;
    } catch {
      return emptyRoot();
    }
  }

  public async save(root: PatronFavoritesRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async listForUser(creatorId: string, userId: string): Promise<PatronFavoriteRecord[]> {
    const root = await this.load();
    return root.favorites.filter((f) => f.creator_id === creatorId && f.user_id === userId);
  }

  /** Idempotent add; returns the stored record (existing or new). */
  public async add(record: Omit<PatronFavoriteRecord, "created_at">): Promise<PatronFavoriteRecord> {
    const root = await this.load();
    const key = favoriteKey(
      record.user_id,
      record.creator_id,
      record.target_kind,
      record.target_id
    );
    const existing = root.favorites.find(
      (f) =>
        favoriteKey(f.user_id, f.creator_id, f.target_kind, f.target_id) === key
    );
    if (existing) {
      return existing;
    }
    const full: PatronFavoriteRecord = {
      ...record,
      created_at: new Date().toISOString()
    };
    root.favorites.push(full);
    await this.save(root);
    return full;
  }

  public async remove(
    creatorId: string,
    userId: string,
    targetKind: PatronFavoriteTargetKind,
    targetId: string
  ): Promise<boolean> {
    const root = await this.load();
    const before = root.favorites.length;
    root.favorites = root.favorites.filter(
      (f) =>
        !(
          f.creator_id === creatorId &&
          f.user_id === userId &&
          f.target_kind === targetKind &&
          f.target_id === targetId
        )
    );
    await this.save(root);
    return root.favorites.length < before;
  }
}
