import { Prisma, type PrismaClient } from "@prisma/client";
import type { CreatorSyncHealthState, PatreonSyncHealthStoreAPI, SyncHealthError, UpstreamProbeHealth } from "./patreon-sync-health-store.js";
import { validateCreatorSyncHealth } from "./patreon-sync-health-store.js";

/** Existing JSON columns hold evidence; all writers share the same creator lock. */
export class DbPatreonSyncHealthStore implements PatreonSyncHealthStoreAPI {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getForCreator(creatorId: string): Promise<CreatorSyncHealthState | null> {
    const row = await this.prisma.creatorSyncState.findUnique({ where: { creatorId } });
    if (!row) return null;
    const post = row.lastPostScrape as (CreatorSyncHealthState["last_post_scrape"] & { upstream_probe?: UpstreamProbeHealth }) | null;
    const member = row.lastMemberSync as CreatorSyncHealthState["last_member_sync"];
    if (post != null && (typeof post !== "object" || Array.isArray(post))) throw new Error("Invalid saved Patreon health.");
    if ((post?.finished_at !== undefined && (typeof post.finished_at !== "string" || typeof post.ok !== "boolean")) || (member != null && (typeof member.finished_at !== "string" || typeof member.ok !== "boolean"))) throw new Error("Invalid saved Patreon health.");
    return validateCreatorSyncHealth({ ...(post?.finished_at ? { last_post_scrape: post } : {}), ...(post?.upstream_probe ? { upstream_probe: post.upstream_probe } : {}), ...(member ? { last_member_sync: member } : {}) });
  }

  private async update(creatorId: string, column: "lastPostScrape" | "lastMemberSync", change: (prior: Record<string, unknown>) => Record<string, unknown>) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"patreon-health:" + creatorId}, 0))::text`;
      const row = await tx.creatorSyncState.findUnique({ where: { creatorId } });
      const prior = row?.[column];
      if (prior != null && (typeof prior !== "object" || Array.isArray(prior))) throw new Error("Invalid saved Patreon health.");
      const next = change((prior ?? {}) as Record<string, unknown>) as Prisma.InputJsonValue;
      const data = column === "lastPostScrape" ? { lastPostScrape: next } : { lastMemberSync: next };
      await tx.creatorSyncState.upsert({ where: { creatorId }, create: { creatorId, ...data }, update: data });
    });
  }

  public async recordUpstreamProbe(creatorId: string, probe: UpstreamProbeHealth): Promise<void> {
    await this.update(creatorId, "lastPostScrape", (prior) => {
      const previous = prior.upstream_probe as UpstreamProbeHealth | undefined;
      return previous && previous.observed_at > probe.observed_at ? prior : { ...prior, upstream_probe: probe };
    });
  }

  private async record(creatorId: string, column: "lastPostScrape" | "lastMemberSync", result: Record<string, unknown>) {
    await this.update(creatorId, column, (prior) => {
      const finished_at = new Date().toISOString();
      const campaign = result.patreon_campaign_id ?? prior.patreon_campaign_id;
      return { ...result, ...(campaign ? { patreon_campaign_id: campaign } : {}), finished_at, last_verified_at: result.ok ? finished_at : prior.last_verified_at ?? (prior.ok ? prior.finished_at : null),
        last_verified_campaign_id: result.ok ? campaign ?? null : prior.last_verified_campaign_id ?? (prior.ok ? prior.patreon_campaign_id ?? null : null),
        ...(column === "lastPostScrape" && prior.upstream_probe ? { upstream_probe: prior.upstream_probe } : {}) };
    });
  }

  public async recordPostScrapeSuccess(args: { creator_id: string; patreon_campaign_id: string; posts_fetched: number; posts_written?: number; warnings: string[] }): Promise<void> {
    await this.record(args.creator_id, "lastPostScrape", { ok: true, patreon_campaign_id: args.patreon_campaign_id,
      posts_fetched: args.posts_fetched, ...(args.posts_written !== undefined ? { posts_written: args.posts_written } : {}),
      ...(args.warnings.length ? { warning_snippets: args.warnings.slice(0, 5).map((s) => s.trim().length > 200 ? `${s.trim().slice(0, 199)}…` : s.trim()) } : {}) });
  }
  public async recordPostScrapeFailure(args: { creator_id: string; patreon_campaign_id?: string; error: SyncHealthError }): Promise<void> {
    await this.record(args.creator_id, "lastPostScrape", { ok: false, ...(args.patreon_campaign_id ? { patreon_campaign_id: args.patreon_campaign_id } : {}), error: args.error });
  }
  public async recordMemberSyncSuccess(args: { creator_id: string; patreon_campaign_id?: string; members_synced: number }): Promise<void> {
    await this.record(args.creator_id, "lastMemberSync", { ok: true, ...(args.patreon_campaign_id ? { patreon_campaign_id: args.patreon_campaign_id } : {}), members_synced: args.members_synced });
  }
  public async recordMemberSyncFailure(args: { creator_id: string; patreon_campaign_id?: string; error: SyncHealthError }): Promise<void> {
    await this.record(args.creator_id, "lastMemberSync", { ok: false, ...(args.patreon_campaign_id ? { patreon_campaign_id: args.patreon_campaign_id } : {}), error: args.error });
  }
}
