import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CloneSiteModel, CloneSiteStoreRoot } from "./types.js";

export class FileCloneSiteStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<CloneSiteStoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as CloneSiteStoreRoot;
    } catch {
      return { sites: {} };
    }
  }

  public async save(root: CloneSiteStoreRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async upsert(model: CloneSiteModel): Promise<void> {
    const root = await this.load();
    root.sites[model.creator_id] = model;
    await this.save(root);
  }

  public async getByCreator(creatorId: string): Promise<CloneSiteModel | null> {
    const root = await this.load();
    return root.sites[creatorId] ?? null;
  }
}
