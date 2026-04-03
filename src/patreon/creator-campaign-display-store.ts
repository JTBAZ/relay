import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Patreon campaign art + patron count snapshot (OAuth); updated on each successful scrape campaign fetch. */
export type CampaignDisplaySnapshot = {
  patreon_campaign_id: string;
  /** Campaign `vanity` / public page slug (normalized lowercase). */
  patreon_name?: string;
  image_url?: string;
  image_small_url?: string;
  patron_count?: number;
  captured_at: string;
};

type Root = {
  records: Record<string, CampaignDisplaySnapshot>;
};

export class CreatorCampaignDisplayStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async readRoot(): Promise<Root> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as Root;
    } catch {
      return { records: {} };
    }
  }

  private async writeRoot(root: Root): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async get(creatorId: string): Promise<CampaignDisplaySnapshot | null> {
    const root = await this.readRoot();
    return root.records[creatorId] ?? null;
  }

  public async upsert(creatorId: string, snapshot: CampaignDisplaySnapshot): Promise<void> {
    const root = await this.readRoot();
    root.records[creatorId] = snapshot;
    await this.writeRoot(root);
  }
}
