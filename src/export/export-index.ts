/**
 * @fileoverview Per-creator `export_index.json` load/save helpers on local disk.
 * @description JSON persistence for `CreatorExportIndex` under `{baseRoot}/{creatorId}/`.
 * @see ./types.js CreatorExportIndex
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CreatorExportIndex } from "./types.js";

/**
 * @description Resolves index path and performs JSON I/O with automatic directory creation.
 */
export class FileExportIndex {
  private readonly baseRoot: string;

  /**
   * @param baseRoot Root folder containing per-creator export state.
   */
  public constructor(baseRoot: string) {
    this.baseRoot = baseRoot;
  }

  private indexPath(creatorId: string): string {
    return join(this.baseRoot, creatorId, "export_index.json");
  }

  /**
   * @description Reads parsed index or empty media map when missing.
   * @param creatorId Creator scope.
   * @async
   * @throws {Error} On unexpected read failure (non-ENOENT).
   */
  public async load(creatorId: string): Promise<CreatorExportIndex> {
    try {
      const raw = await readFile(this.indexPath(creatorId), "utf8");
      return JSON.parse(raw) as CreatorExportIndex;
    } catch {
      return { creator_id: creatorId, media: {} };
    }
  }

  /**
   * @description Writes index JSON after ensuring parent dirs exist.
   * @param index Aggregate to persist (`creator_id` must match path).
   * @async
   * @throws {Error} On mkdir/write failure.
   */
  public async save(index: CreatorExportIndex): Promise<void> {
    const path = this.indexPath(index.creator_id);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(index, null, 2), "utf8");
  }
}
