import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Deployment, DeployStoreRoot } from "./types.js";

export class FileDeployStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<DeployStoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as DeployStoreRoot;
    } catch {
      return { deployments: {}, active_by_creator: {} };
    }
  }

  public async save(root: DeployStoreRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async upsert(deployment: Deployment): Promise<void> {
    const root = await this.load();
    root.deployments[deployment.deployment_id] = deployment;
    await this.save(root);
  }

  public async get(deploymentId: string): Promise<Deployment | null> {
    const root = await this.load();
    return root.deployments[deploymentId] ?? null;
  }

  public async setActive(creatorId: string, deploymentId: string): Promise<void> {
    const root = await this.load();
    root.active_by_creator[creatorId] = deploymentId;
    await this.save(root);
  }

  public async getActive(creatorId: string): Promise<Deployment | null> {
    const root = await this.load();
    const activeId = root.active_by_creator[creatorId];
    if (!activeId) return null;
    return root.deployments[activeId] ?? null;
  }

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
