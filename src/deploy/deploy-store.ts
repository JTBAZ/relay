/**
 * @fileoverview File-backed deployment store with active pointer map.
 * @description JSON persistence for `Deployment` records and `active_by_creator`.
 * @see ./deploy-store-db.js
 * @see prisma/schema.prisma Deployment, CreatorActiveDeployment
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Deployment, DeployStoreRoot } from "./types.js";

/**
 * @description Contract used by `DeployService` for persistence.
 * @security-audit-required Stores deployment metadata per creator; enforce authz at API boundary.
 */
export interface DeployStore {
  /**
   * @description Inserts or replaces a deployment row.
   * @param deployment Deployment snapshot.
   * @async
   * @throws {Error} On I/O failure from implementations.
   */
  upsert(deployment: Deployment): Promise<void>;
  /**
   * @description Fetches deployment by id.
   * @param deploymentId Provider/relay deployment id.
   * @returns Deployment or `null`.
   * @async
   */
  get(deploymentId: string): Promise<Deployment | null>;
  /**
   * @description Marks which deployment is considered active for rollout UX.
   * @param creatorId Creator scope.
   * @param deploymentId Active deployment id pointer.
   * @async
   */
  setActive(creatorId: string, deploymentId: string): Promise<void>;
  /**
   * @description Resolves active deployment for a creator when pointer exists.
   * @param creatorId Creator scope.
   * @returns Active deployment or `null`.
   * @async
   */
  getActive(creatorId: string): Promise<Deployment | null>;
  /**
   * @description Lists deployments for a creator newest-first (file impl sorts in memory).
   * @param creatorId Creator scope.
   * @async
   */
  listByCreator(creatorId: string): Promise<Deployment[]>;
}

/**
 * @description JSON filesystem-backed `DeployStore`.
 * @security-audit-required Path must be restricted; records reference external URLs.
 */
export class FileDeployStore implements DeployStore {
  private readonly filePath: string;

  /**
   * @param filePath Deploy JSON path.
   */
  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * @description Reads JSON root or empty aggregate on missing file.
   * @returns Parsed root.
   * @async
   * @throws {Error} Unexpected read errors; parse errors swallowed to empty root.
   */
  public async load(): Promise<DeployStoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as DeployStoreRoot;
    } catch {
      return { deployments: {}, active_by_creator: {} };
    }
  }

  /**
   * @description Persists full deploy store document.
   * @param root Aggregate to write.
   * @async
   * @throws {Error} On mkdir/write failure.
   */
  public async save(root: DeployStoreRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  /**
   * @description Upserts into `deployments` map and persists.
   * @param deployment Deployment record.
   * @async
   * @throws {Error} On read/write failure.
   */
  public async upsert(deployment: Deployment): Promise<void> {
    const root = await this.load();
    root.deployments[deployment.deployment_id] = deployment;
    await this.save(root);
  }

  /**
   * @description Loads keyed deployment.
   * @param deploymentId Deployment id.
   * @async
   * @throws {Error} On load failure.
   */
  public async get(deploymentId: string): Promise<Deployment | null> {
    const root = await this.load();
    return root.deployments[deploymentId] ?? null;
  }

  /**
   * @description Updates `active_by_creator` entry.
   * @param creatorId Creator key.
   * @param deploymentId Active deployment id.
   * @async
   * @throws {Error} On load/write failure.
   */
  public async setActive(creatorId: string, deploymentId: string): Promise<void> {
    const root = await this.load();
    root.active_by_creator[creatorId] = deploymentId;
    await this.save(root);
  }

  /**
   * @description Resolves active deployment via pointer when present.
   * @param creatorId Creator key.
   * @async
   * @throws {Error} On load failure.
   */
  public async getActive(creatorId: string): Promise<Deployment | null> {
    const root = await this.load();
    const activeId = root.active_by_creator[creatorId];
    if (!activeId) return null;
    return root.deployments[activeId] ?? null;
  }

  /**
   * @description Filters deployments for creator and sorts descending by `created_at`.
   * @param creatorId Creator key.
   * @async
   * @throws {Error} On load failure.
   */
  public async listByCreator(creatorId: string): Promise<Deployment[]> {
    const root = await this.load();
    return Object.values(root.deployments)
      .filter((d) => d.creator_id === creatorId)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }
}
