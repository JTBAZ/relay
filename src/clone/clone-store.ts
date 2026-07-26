/**
 * @fileoverview File-backed `CloneSiteStore` with optional full-document load/save helpers.
 * @description Persists `sites` map as JSON for local/dev parity with `DbCloneSiteStore`.
 * @see ./clone-store-db.js
 * @see prisma/schema.prisma CloneSite
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CloneSiteModel, CloneSiteStoreRoot } from "./types.js";

/**
 * @description Minimal contract for CRUD on generated clone bundles.
 * @security-audit-required Clone models describe creator content; callers must enforce scope.
 */
export interface CloneSiteStore {
  /**
   * @description Saves or replaces clone model for its `creator_id`.
   * @param model Clone graph.
   * @async
   * @throws {Error} Storage failures from implementations.
   */
  upsert(model: CloneSiteModel): Promise<void>;
  /**
   * @description Reads latest model for a creator.
   * @param creatorId Creator key.
   * @returns Model or `null`.
   * @async
   * @throws {Error} Read failures from implementations.
   */
  getByCreator(creatorId: string): Promise<CloneSiteModel | null>;
}

/**
 * @description JSON filesystem implementation with whole-file `load`/`save` helpers.
 * @security-audit-required Filesystem path must be protected on multi-tenant hosts.
 */
export class FileCloneSiteStore implements CloneSiteStore {
  private readonly filePath: string;

  /**
   * @param filePath Path to JSON document backing clone sites.
   */
  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * @description Parses entire JSON root or returns empty map if missing/invalid.
   * @returns Parsed `CloneSiteStoreRoot`.
   * @async
   * @throws {Error} When file exists but cannot be read (I/O); JSON parse errors yield empty root via catch.
   * @todo Surface parse errors to operators instead of silently returning `{ sites: {} }`.
   */
  public async load(): Promise<CloneSiteStoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as CloneSiteStoreRoot;
    } catch {
      return { sites: {} };
    }
  }

  /**
   * @description Writes full root to disk, creating parent dirs.
   * @param root Aggregate to persist.
   * @async
   * @throws {Error} On `mkdir`/`writeFile` failure.
   */
  public async save(root: CloneSiteStoreRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  /**
   * @description Loads, merges `model.creator_id`, and saves.
   * @param model Model to upsert.
   * @async
   * @throws {Error} On read/write failure.
   */
  public async upsert(model: CloneSiteModel): Promise<void> {
    const root = await this.load();
    root.sites[model.creator_id] = model;
    await this.save(root);
  }

  /**
   * @description Reads keyed entry for creator.
   * @param creatorId Creator key.
   * @returns Model or `null`.
   * @async
   * @throws {Error} On load failure.
   */
  public async getByCreator(creatorId: string): Promise<CloneSiteModel | null> {
    const root = await this.load();
    return root.sites[creatorId] ?? null;
  }
}
