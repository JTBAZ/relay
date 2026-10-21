import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { POST_SYNC_LEASE_MS, readPostSyncProgress, type PatreonPostProgressStore, type PostSyncLease, type PostSyncCheckpoint } from "./post-sync-progress.js";

/** Called inside the same canonical transaction as accepted page data. */
export async function checkpointPostSync(tx: Prisma.TransactionClient, command: PostSyncCheckpoint): Promise<void> {
  const { lease, progress, watermark } = command;
  const changed = await tx.syncCursor.updateMany({ where: { creatorId: lease.creatorId, campaignId: lease.campaignId,
    postLeaseToken: lease.token, postVersion: lease.version, postLeaseUntil: { gt: new Date() } },
    data: { postProgress: progress as unknown as Prisma.InputJsonValue, postVersion: { increment: 1 },
      ...(watermark ? { lastSyncedAt: new Date(watermark) } : {}), updatedAt: new Date() } });
  if (changed.count !== 1) throw new Error("Patreon post progress lease changed; retry collection.");
}
export class DbPatreonPostProgressStore implements PatreonPostProgressStore {
  public readonly shared = true;
  public constructor(private readonly db: PrismaClient) {}
  public async get(creatorId: string, campaignId: string) {
    const row = await this.db.syncCursor.findUnique({ where: { creatorId_campaignId: { creatorId, campaignId } }, select: { postProgress: true } });
    return row?.postProgress ? readPostSyncProgress(row.postProgress) : null;
  }
  public async claim(creatorId: string, campaignId: string): Promise<PostSyncLease | null> {
    return this.db.$transaction(async (tx) => {
      await tx.syncCursor.upsert({ where: { creatorId_campaignId: { creatorId, campaignId } },
        create: { creatorId, campaignId, updatedAt: new Date() }, update: {} });
      const token = randomUUID();
      const claimed = await tx.syncCursor.updateMany({ where: { creatorId, campaignId, OR: [{ postLeaseUntil: null }, { postLeaseUntil: { lte: new Date() } }] },
        data: { postLeaseToken: token, postLeaseUntil: new Date(Date.now() + POST_SYNC_LEASE_MS) } });
      if (!claimed.count) return null;
      const row = await tx.syncCursor.findUniqueOrThrow({ where: { creatorId_campaignId: { creatorId, campaignId } } });
      return { creatorId, campaignId, token, version: row.postVersion, progress: readPostSyncProgress(row.postProgress) };
    });
  }
  public async checkpoint(command: PostSyncCheckpoint): Promise<void> {
    await this.db.$transaction((tx) => checkpointPostSync(tx, command));
    command.lease.version++; command.lease.progress = structuredClone(command.progress);
  }
  public async heartbeat(lease: PostSyncLease): Promise<void> {
    const changed = await this.db.syncCursor.updateMany({ where: { creatorId: lease.creatorId, campaignId: lease.campaignId, postLeaseToken: lease.token, postLeaseUntil: { gt: new Date() } }, data: { postLeaseUntil: new Date(Date.now() + POST_SYNC_LEASE_MS) } });
    if (changed.count !== 1) throw new Error("Patreon post progress lease lost.");
  }
  public async release(lease: PostSyncLease): Promise<void> {
    await this.db.syncCursor.updateMany({ where: { creatorId: lease.creatorId, campaignId: lease.campaignId, postLeaseToken: lease.token }, data: { postLeaseToken: null, postLeaseUntil: null } });
  }
  public async selectCreators(ids: string[], cap: number): Promise<string[]> {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('patreon-post-scheduler', 0))::text`;
      const row = await tx.patreonPostScheduler.findUnique({ where: { id: "posts" } });
      const sorted = [...new Set(ids)].sort();
      const start = row?.afterCreatorId ? sorted.findIndex((id) => id > row.afterCreatorId!) : 0;
      const at = start < 0 ? 0 : start;
      const selected = [...sorted.slice(at), ...sorted.slice(0, at)].slice(0, cap > 0 ? cap : sorted.length);
      if (selected.length) await tx.patreonPostScheduler.upsert({ where: { id: "posts" }, create: { id: "posts", afterCreatorId: selected.at(-1)! }, update: { afterCreatorId: selected.at(-1)! } });
      return selected;
    });
  }
}
