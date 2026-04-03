import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type SyncHealthError = {
  code: string;
  message: string;
  hint: string;
};

export type LastPostScrapeHealth = {
  finished_at: string;
  ok: boolean;
  patreon_campaign_id?: string;
  error?: SyncHealthError;
  posts_fetched?: number;
  posts_written?: number;
  warning_snippets?: string[];
};

export type LastMemberSyncHealth = {
  finished_at: string;
  ok: boolean;
  patreon_campaign_id?: string;
  members_synced?: number;
  error?: SyncHealthError;
};

type CreatorSyncHealth = {
  last_post_scrape?: LastPostScrapeHealth;
  last_member_sync?: LastMemberSyncHealth;
};

type HealthRoot = {
  records: Record<string, CreatorSyncHealth>;
};

const MAX_WARNINGS = 5;
const MAX_WARN_LEN = 200;

function truncateWarn(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_WARN_LEN) return t;
  return `${t.slice(0, MAX_WARN_LEN - 1)}…`;
}

export class PatreonSyncHealthStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async readRoot(): Promise<HealthRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as HealthRoot;
    } catch {
      return { records: {} };
    }
  }

  private async writeRoot(root: HealthRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async getForCreator(creatorId: string): Promise<CreatorSyncHealth | null> {
    const root = await this.readRoot();
    return root.records[creatorId] ?? null;
  }

  public async recordPostScrapeSuccess(args: {
    creator_id: string;
    patreon_campaign_id: string;
    posts_fetched: number;
    posts_written?: number;
    warnings: string[];
  }): Promise<void> {
    const root = await this.readRoot();
    const prev = root.records[args.creator_id] ?? {};
    const snippets =
      args.warnings.length > 0
        ? args.warnings.slice(0, MAX_WARNINGS).map(truncateWarn)
        : undefined;
    root.records[args.creator_id] = {
      ...prev,
      last_post_scrape: {
        finished_at: new Date().toISOString(),
        ok: true,
        patreon_campaign_id: args.patreon_campaign_id,
        posts_fetched: args.posts_fetched,
        posts_written: args.posts_written,
        warning_snippets: snippets
      }
    };
    await this.writeRoot(root);
  }

  public async recordPostScrapeFailure(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    error: SyncHealthError;
  }): Promise<void> {
    const root = await this.readRoot();
    const prev = root.records[args.creator_id] ?? {};
    root.records[args.creator_id] = {
      ...prev,
      last_post_scrape: {
        finished_at: new Date().toISOString(),
        ok: false,
        patreon_campaign_id: args.patreon_campaign_id,
        error: args.error
      }
    };
    await this.writeRoot(root);
  }

  public async recordMemberSyncSuccess(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    members_synced: number;
  }): Promise<void> {
    const root = await this.readRoot();
    const prev = root.records[args.creator_id] ?? {};
    root.records[args.creator_id] = {
      ...prev,
      last_member_sync: {
        finished_at: new Date().toISOString(),
        ok: true,
        patreon_campaign_id: args.patreon_campaign_id,
        members_synced: args.members_synced
      }
    };
    await this.writeRoot(root);
  }

  public async recordMemberSyncFailure(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    error: SyncHealthError;
  }): Promise<void> {
    const root = await this.readRoot();
    const prev = root.records[args.creator_id] ?? {};
    root.records[args.creator_id] = {
      ...prev,
      last_member_sync: {
        finished_at: new Date().toISOString(),
        ok: false,
        patreon_campaign_id: args.patreon_campaign_id,
        error: args.error
      }
    };
    await this.writeRoot(root);
  }
}
