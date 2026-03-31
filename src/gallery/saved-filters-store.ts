import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { SavedFilterRecord, SavedFiltersRoot } from "./types.js";

export class FileSavedFiltersStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<SavedFiltersRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as SavedFiltersRoot;
    } catch {
      return { filters: [] };
    }
  }

  public async save(root: SavedFiltersRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async listForCreator(creatorId: string): Promise<SavedFilterRecord[]> {
    const root = await this.load();
    return root.filters.filter((f) => f.creator_id === creatorId);
  }

  public async create(
    creatorId: string,
    name: string,
    query: SavedFilterRecord["query"]
  ): Promise<SavedFilterRecord> {
    const root = await this.load();
    const record: SavedFilterRecord = {
      filter_id: `flt_${randomUUID()}`,
      creator_id: creatorId,
      name,
      query,
      created_at: new Date().toISOString()
    };
    root.filters.push(record);
    await this.save(root);
    return record;
  }

  public async delete(creatorId: string, filterId: string): Promise<boolean> {
    const root = await this.load();
    const before = root.filters.length;
    root.filters = root.filters.filter(
      (f) => !(f.filter_id === filterId && f.creator_id === creatorId)
    );
    await this.save(root);
    return root.filters.length < before;
  }
}
