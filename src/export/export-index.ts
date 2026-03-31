import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CreatorExportIndex } from "./types.js";

export class FileExportIndex {
  private readonly baseRoot: string;

  public constructor(baseRoot: string) {
    this.baseRoot = baseRoot;
  }

  private indexPath(creatorId: string): string {
    return join(this.baseRoot, creatorId, "export_index.json");
  }

  public async load(creatorId: string): Promise<CreatorExportIndex> {
    try {
      const raw = await readFile(this.indexPath(creatorId), "utf8");
      return JSON.parse(raw) as CreatorExportIndex;
    } catch {
      return { creator_id: creatorId, media: {} };
    }
  }

  public async save(index: CreatorExportIndex): Promise<void> {
    const path = this.indexPath(index.creator_id);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(index, null, 2), "utf8");
  }
}
