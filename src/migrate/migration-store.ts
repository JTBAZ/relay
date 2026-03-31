import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AuditEntry,
  MigrationCampaign,
  MigrationStoreRoot,
  SignedLink
} from "./types.js";

function emptyRoot(): MigrationStoreRoot {
  return {
    campaigns: {},
    suppression_list: {},
    audit_log: [],
    signed_links: {}
  };
}

export class FileMigrationStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<MigrationStoreRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as MigrationStoreRoot;
    } catch {
      return emptyRoot();
    }
  }

  public async save(root: MigrationStoreRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async upsertCampaign(campaign: MigrationCampaign): Promise<void> {
    const root = await this.load();
    root.campaigns[campaign.campaign_id] = campaign;
    await this.save(root);
  }

  public async getCampaign(campaignId: string): Promise<MigrationCampaign | null> {
    const root = await this.load();
    return root.campaigns[campaignId] ?? null;
  }

  public async appendAudit(entry: AuditEntry): Promise<void> {
    const root = await this.load();
    root.audit_log.push(entry);
    await this.save(root);
  }

  public async getSuppressionList(creatorId: string): Promise<string[]> {
    const root = await this.load();
    return root.suppression_list[creatorId] ?? [];
  }

  public async addToSuppression(creatorId: string, emails: string[]): Promise<void> {
    const root = await this.load();
    const existing = new Set(root.suppression_list[creatorId] ?? []);
    for (const e of emails) {
      existing.add(e.toLowerCase().trim());
    }
    root.suppression_list[creatorId] = [...existing];
    await this.save(root);
  }

  public async storeSignedLink(link: SignedLink): Promise<void> {
    const root = await this.load();
    root.signed_links[link.token] = link;
    await this.save(root);
  }

  public async resolveSignedLink(token: string): Promise<SignedLink | null> {
    const root = await this.load();
    const link = root.signed_links[token];
    if (!link) return null;
    if (new Date(link.expires_at).getTime() < Date.now()) return null;
    return link;
  }
}
