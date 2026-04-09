import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type IndexRoot = {
  /** Patreon numeric campaign id → Relay creator_id */
  campaign_to_creator: Record<string, string>;
};

/**
 * Persisted map `patreon_campaign_numeric_id` → `creator_id`.
 * Used to route Patreon webhook payloads when only the campaign id is known.
 */
export class PatreonCampaignCreatorIndex {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async readRoot(): Promise<IndexRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as IndexRoot;
    } catch {
      return { campaign_to_creator: {} };
    }
  }

  private async writeRoot(root: IndexRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async getCreatorId(campaignNumericId: string): Promise<string | null> {
    const id = campaignNumericId.trim();
    if (!id) return null;
    const root = await this.readRoot();
    return root.campaign_to_creator[id] ?? null;
  }

  /**
   * Refuse overwrite when another creator already owns this Patreon campaign id.
   */
  public async upsert(
    campaignNumericId: string,
    creatorId: string
  ): Promise<{ ok: true } | { ok: false; reason: "collision"; existing_creator_id: string }> {
    const c = campaignNumericId.trim();
    const cr = creatorId.trim();
    if (!c || !cr) return { ok: true };
    const root = await this.readRoot();
    const prev = root.campaign_to_creator[c];
    if (prev && prev !== cr) {
      return { ok: false, reason: "collision", existing_creator_id: prev };
    }
    root.campaign_to_creator[c] = cr;
    await this.writeRoot(root);
    return { ok: true };
  }
}
