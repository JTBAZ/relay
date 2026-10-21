/**
 * @fileoverview File-backed store for last Patreon post scrape and member sync health snapshots per creator.
 * @description Human-readable JSON for operators; superseded in multi-node by `DbPatreonSyncHealthStore` where configured.
 * @async All API methods.
 * @throws {Error} Disk failures.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma `CreatorSyncState` for DB analogue
 */
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";

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
  last_verified_at?: string | null;
  last_verified_campaign_id?: string | null;
};

export type LastMemberSyncHealth = {
  finished_at: string;
  ok: boolean;
  patreon_campaign_id?: string;
  members_synced?: number;
  error?: SyncHealthError;
  last_verified_at?: string | null;
  last_verified_campaign_id?: string | null;
};

export type UpstreamProbeHealth = { campaign_id: string; observed_at: string; newest_published_at: string | null };

export type CreatorSyncHealthState = {
  last_post_scrape?: LastPostScrapeHealth;
  last_member_sync?: LastMemberSyncHealth;
  upstream_probe?: UpstreamProbeHealth;
};

type CreatorSyncHealth = CreatorSyncHealthState;

export function validateCreatorSyncHealth(value: CreatorSyncHealthState | null): CreatorSyncHealthState | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid saved Patreon health.");
  for (const item of [value.last_post_scrape, value.last_member_sync]) {
    if (item && (typeof item.ok !== "boolean" || typeof item.finished_at !== "string" || !Number.isFinite(Date.parse(item.finished_at)) || (item.last_verified_at != null && (typeof item.last_verified_at !== "string" || !Number.isFinite(Date.parse(item.last_verified_at)))) || (item.patreon_campaign_id != null && typeof item.patreon_campaign_id !== "string") || (item.last_verified_campaign_id != null && typeof item.last_verified_campaign_id !== "string"))) throw new Error("Invalid saved Patreon health.");
  }
  const probe = value.upstream_probe;
  if (probe && (typeof probe.campaign_id !== "string" || !/^\d{1,32}$/.test(probe.campaign_id) || !Number.isFinite(Date.parse(probe.observed_at)) || (probe.newest_published_at !== null && !Number.isFinite(Date.parse(probe.newest_published_at))))) throw new Error("Invalid saved Patreon probe.");
  return value;
}

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

/** Implemented by `PatreonSyncHealthStore` and `DbPatreonSyncHealthStore` (`patreon-sync-health-store-db.ts`). */
export interface PatreonSyncHealthStoreAPI {
  recordUpstreamProbe?(creatorId: string, probe: UpstreamProbeHealth): Promise<void>;
  getForCreator(creatorId: string): Promise<CreatorSyncHealthState | null>;
  recordPostScrapeSuccess(args: {
    creator_id: string;
    patreon_campaign_id: string;
    posts_fetched: number;
    posts_written?: number;
    warnings: string[];
  }): Promise<void>;
  recordPostScrapeFailure(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    error: SyncHealthError;
  }): Promise<void>;
  recordMemberSyncSuccess(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    members_synced: number;
  }): Promise<void>;
  recordMemberSyncFailure(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    error: SyncHealthError;
  }): Promise<void>;
}

export class PatreonSyncHealthStore implements PatreonSyncHealthStoreAPI {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async getForCreator(creatorId: string): Promise<CreatorSyncHealthState | null> {
    const root = await this.readRoot();
    return validateCreatorSyncHealth(root.records[creatorId] ?? null);
  }

  private async readRoot(): Promise<HealthRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as HealthRoot;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: {} };
      throw error;
    }
  }

  private async writeRoot(root: HealthRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${randomUUID()}.tmp`;
    try { await writeFile(temp, JSON.stringify(root, null, 2), "utf8"); await rename(temp, this.filePath); }
    finally { await unlink(temp).catch(() => {}); }
  }

  private async mutate(change: (root: HealthRoot) => void): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const release = await lockfile.lock(this.filePath, { realpath: false, retries: { retries: 30, minTimeout: 10, maxTimeout: 100 } });
    try { const root = await this.readRoot(); change(root); await this.writeRoot(root); }
    finally { await release(); }
  }

  public async recordUpstreamProbe(creatorId: string, probe: UpstreamProbeHealth): Promise<void> {
    await this.mutate((root) => {
      const prior = root.records[creatorId];
      if (prior?.upstream_probe && prior.upstream_probe.observed_at > probe.observed_at) return;
      root.records[creatorId] = { ...prior, upstream_probe: probe };
    });
  }

  public async recordPostScrapeSuccess(args: {
    creator_id: string;
    patreon_campaign_id: string;
    posts_fetched: number;
    posts_written?: number;
    warnings: string[];
  }): Promise<void> {
    await this.mutate((root) => {
    const prev = root.records[args.creator_id] ?? {};
    const snippets =
      args.warnings.length > 0
        ? args.warnings.slice(0, MAX_WARNINGS).map(truncateWarn)
        : undefined;
    root.records[args.creator_id] = {
      ...prev,
      last_post_scrape: {
        finished_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
        last_verified_campaign_id: args.patreon_campaign_id,
        ok: true,
        patreon_campaign_id: args.patreon_campaign_id,
        posts_fetched: args.posts_fetched,
        posts_written: args.posts_written,
        warning_snippets: snippets
      }
    };
    });
  }

  public async recordPostScrapeFailure(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    error: SyncHealthError;
  }): Promise<void> {
    await this.mutate((root) => {
    const prev = root.records[args.creator_id] ?? {};
    root.records[args.creator_id] = {
      ...prev,
      last_post_scrape: {
        finished_at: new Date().toISOString(),
        last_verified_at: prev.last_post_scrape?.last_verified_at ?? (prev.last_post_scrape?.ok ? prev.last_post_scrape.finished_at : null),
        last_verified_campaign_id: prev.last_post_scrape?.last_verified_campaign_id ?? (prev.last_post_scrape?.ok ? prev.last_post_scrape.patreon_campaign_id : null),
        ok: false,
        patreon_campaign_id: args.patreon_campaign_id ?? prev.last_post_scrape?.patreon_campaign_id,
        error: args.error
      }
    };
    });
  }

  public async recordMemberSyncSuccess(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    members_synced: number;
  }): Promise<void> {
    await this.mutate((root) => {
    const prev = root.records[args.creator_id] ?? {};
    root.records[args.creator_id] = {
      ...prev,
      last_member_sync: {
        finished_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
        last_verified_campaign_id: args.patreon_campaign_id,
        ok: true,
        patreon_campaign_id: args.patreon_campaign_id,
        members_synced: args.members_synced
      }
    };
    });
  }

  public async recordMemberSyncFailure(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    error: SyncHealthError;
  }): Promise<void> {
    await this.mutate((root) => {
    const prev = root.records[args.creator_id] ?? {};
    root.records[args.creator_id] = {
      ...prev,
      last_member_sync: {
        finished_at: new Date().toISOString(),
        last_verified_at: prev.last_member_sync?.last_verified_at ?? (prev.last_member_sync?.ok ? prev.last_member_sync.finished_at : null),
        last_verified_campaign_id: prev.last_member_sync?.last_verified_campaign_id ?? (prev.last_member_sync?.ok ? prev.last_member_sync.patreon_campaign_id : null),
        ok: false,
        patreon_campaign_id: args.patreon_campaign_id ?? prev.last_member_sync?.patreon_campaign_id,
        error: args.error
      }
    };
    });
  }
}
