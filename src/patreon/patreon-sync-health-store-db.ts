import type { PrismaClient } from "@prisma/client";
import type {
  CreatorSyncHealthState,
  PatreonSyncHealthStoreAPI,
  SyncHealthError
} from "./patreon-sync-health-store.js";

const MAX_WARNINGS = 5;
const MAX_WARN_LEN = 200;

function truncateWarn(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_WARN_LEN) return t;
  return `${t.slice(0, MAX_WARN_LEN - 1)}…`;
}

export class DbPatreonSyncHealthStore implements PatreonSyncHealthStoreAPI {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getForCreator(creatorId: string): Promise<CreatorSyncHealthState | null> {
    const row = await this.prisma.creatorSyncState.findUnique({
      where: { creatorId }
    });
    if (!row) return null;
    const lastPost = row.lastPostScrape as CreatorSyncHealthState["last_post_scrape"];
    const lastMember = row.lastMemberSync as CreatorSyncHealthState["last_member_sync"];
    const out: CreatorSyncHealthState = {};
    if (lastPost !== null && lastPost !== undefined) {
      out.last_post_scrape = lastPost;
    }
    if (lastMember !== null && lastMember !== undefined) {
      out.last_member_sync = lastMember;
    }
    return out;
  }

  public async recordPostScrapeSuccess(args: {
    creator_id: string;
    patreon_campaign_id: string;
    posts_fetched: number;
    posts_written?: number;
    warnings: string[];
  }): Promise<void> {
    const prev = await this.getForCreator(args.creator_id);
    const snippets =
      args.warnings.length > 0
        ? args.warnings.slice(0, MAX_WARNINGS).map(truncateWarn)
        : undefined;
    const last_post_scrape = {
      finished_at: new Date().toISOString(),
      ok: true,
      patreon_campaign_id: args.patreon_campaign_id,
      posts_fetched: args.posts_fetched,
      posts_written: args.posts_written,
      warning_snippets: snippets
    };
    await this.prisma.creatorSyncState.upsert({
      where: { creatorId: args.creator_id },
      create: {
        creatorId: args.creator_id,
        lastPostScrape: last_post_scrape,
        lastMemberSync: prev?.last_member_sync ?? undefined
      },
      update: {
        lastPostScrape: last_post_scrape
      }
    });
  }

  public async recordPostScrapeFailure(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    error: SyncHealthError;
  }): Promise<void> {
    const prev = await this.getForCreator(args.creator_id);
    const last_post_scrape = {
      finished_at: new Date().toISOString(),
      ok: false,
      patreon_campaign_id: args.patreon_campaign_id,
      error: args.error
    };
    await this.prisma.creatorSyncState.upsert({
      where: { creatorId: args.creator_id },
      create: {
        creatorId: args.creator_id,
        lastPostScrape: last_post_scrape,
        lastMemberSync: prev?.last_member_sync ?? undefined
      },
      update: {
        lastPostScrape: last_post_scrape
      }
    });
  }

  public async recordMemberSyncSuccess(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    members_synced: number;
  }): Promise<void> {
    const prev = await this.getForCreator(args.creator_id);
    const last_member_sync = {
      finished_at: new Date().toISOString(),
      ok: true,
      patreon_campaign_id: args.patreon_campaign_id,
      members_synced: args.members_synced
    };
    await this.prisma.creatorSyncState.upsert({
      where: { creatorId: args.creator_id },
      create: {
        creatorId: args.creator_id,
        lastPostScrape: prev?.last_post_scrape ?? undefined,
        lastMemberSync: last_member_sync
      },
      update: {
        lastMemberSync: last_member_sync
      }
    });
  }

  public async recordMemberSyncFailure(args: {
    creator_id: string;
    patreon_campaign_id?: string;
    error: SyncHealthError;
  }): Promise<void> {
    const prev = await this.getForCreator(args.creator_id);
    const last_member_sync = {
      finished_at: new Date().toISOString(),
      ok: false,
      patreon_campaign_id: args.patreon_campaign_id,
      error: args.error
    };
    await this.prisma.creatorSyncState.upsert({
      where: { creatorId: args.creator_id },
      create: {
        creatorId: args.creator_id,
        lastPostScrape: prev?.last_post_scrape ?? undefined,
        lastMemberSync: last_member_sync
      },
      update: {
        lastMemberSync: last_member_sync
      }
    });
  }
}
