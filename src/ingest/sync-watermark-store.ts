import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type WatermarkRow = {
  last_synced_at: string;
  updated_at: string;
};

type WatermarkRoot = {
  records: Record<string, WatermarkRow>;
};

function keyFor(creatorId: string, campaignId: string): string {
  return `${creatorId}:${campaignId}`;
}

export class SyncWatermarkStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async get(
    creatorId: string,
    campaignId: string
  ): Promise<string | null> {
    const row = await this.getRow(creatorId, campaignId);
    return row?.last_synced_at ?? null;
  }

  /** Full row for UI (newest post `published_at` at last successful apply + wall time). */
  public async getRow(
    creatorId: string,
    campaignId: string
  ): Promise<WatermarkRow | null> {
    const root = await this.readRoot();
    return root.records[keyFor(creatorId, campaignId)] ?? null;
  }

  public async set(
    creatorId: string,
    campaignId: string,
    lastSyncedAt: string
  ): Promise<void> {
    const root = await this.readRoot();
    root.records[keyFor(creatorId, campaignId)] = {
      last_synced_at: lastSyncedAt,
      updated_at: new Date().toISOString()
    };
    await this.writeRoot(root);
  }

  private async readRoot(): Promise<WatermarkRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as WatermarkRoot;
    } catch {
      return { records: {} };
    }
  }

  private async writeRoot(root: WatermarkRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }
}
