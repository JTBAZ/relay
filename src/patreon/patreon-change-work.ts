import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type PatreonChangeWork } from "@prisma/client";
import { fingerprint } from "../export/media-repair-state.js";

export type PatreonChangeDescriptor = {
  creatorId: string; campaignId: string; resourceType: "post" | "member"; resourceId: string; eventType: string;
};
export const PATREON_CHANGE_DEBOUNCE_MS = 10_000;
export const PATREON_CHANGE_MAX_WAIT_MS = 60_000;
export const PATREON_CHANGE_LEASE_MS = 120_000;
export const PATREON_CHANGE_MAX_ATTEMPTS = 5;

/** Stores only identifiers, delivery fingerprints, progress and safe failure codes. */
export class PatreonChangeWorkStore {
  public constructor(private readonly db: PrismaClient) {}

  public async retryPost(id: string, creatorId: string, campaignId: string, generation: number, expectedHead: string): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"canonical-store:" + creatorId}, 0))::text`;
      const row = await tx.patreonChangeWork.findFirst({ where: { id, creatorId, campaignId, resourceType: "post", generation, status: "failed" } });
      if (!row) return false;
      const post = await tx.post.findFirst({ where: { id: `patreon_post_${row.resourceId}`, creatorId, campaignId: `patreon_campaign_${campaignId}`, source: "PATREON" }, include: { versions: { orderBy: { versionSeq: "desc" }, take: 1 } } });
      const v = post?.versions[0];
      if (!post || !v || fingerprint([creatorId, post.id, post.source, post.upstreamStatus, post.campaignId, v.versionSeq, v.upstreamRevision, v.mediaIds]) !== expectedHead) return false;
      const changed = await tx.patreonChangeWork.updateMany({ where: { id, creatorId, campaignId, generation, status: "failed" },
        data: { status: "pending", attempts: 0, dueAt: new Date(Math.max(Date.now(), row.retryNotBefore?.getTime() ?? 0)), lastErrorCode: null } });
      return changed.count === 1;
    });
  }

  public async accept(changes: PatreonChangeDescriptor[], deliveryHash: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      // Sorted keys avoid deadlocks when Patreon accumulates several resources in a retry.
      const unique = new Map(changes.map((change) => [JSON.stringify([change.creatorId, change.campaignId, change.resourceType, change.resourceId]), change]));
      for (const [key, change] of [...unique].sort(([a], [b]) => a.localeCompare(b))) {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`patreon-change:${key}`}, 0))`;
        const now = new Date();
        const identity = { creatorId_campaignId_resourceType_resourceId: { creatorId: change.creatorId, campaignId: change.campaignId, resourceType: change.resourceType, resourceId: change.resourceId } };
        await tx.$queryRaw`SELECT id FROM patreon_change_work WHERE creator_id = ${change.creatorId} AND campaign_id = ${change.campaignId} AND resource_type = ${change.resourceType} AND resource_id = ${change.resourceId} FOR UPDATE`;
        const row = await tx.patreonChangeWork.findUnique({ where: identity });
        const fingerprint = createHash("sha256").update(`${change.eventType}:${deliveryHash}`).digest("hex");
        // A thin webhook can look identical after a real edit. Once execution starts, retain a follow-up.
        if (row?.status === "pending" && row.deliveryHash === fingerprint) continue;
        const firstPendingAt = row?.firstPendingAt ?? now;
        const dueAt = new Date(Math.max(row?.retryNotBefore?.getTime() ?? 0, Math.min(now.getTime() + PATREON_CHANGE_DEBOUNCE_MS, firstPendingAt.getTime() + PATREON_CHANGE_MAX_WAIT_MS)));
        await tx.patreonChangeWork.upsert({ where: identity,
          create: { ...change, deliveryHash: fingerprint, firstPendingAt, dueAt, lastAcceptedAt: now },
          update: { eventType: row?.status !== "completed" && (row?.eventType === "posts:delete" || row?.eventType === "members:delete" || row?.eventType === "members:pledge:delete") ? row.eventType : change.eventType, deliveryHash: fingerprint, generation: { increment: 1 }, attempts: 0,
            status: row?.status === "running" ? "running" : "pending", firstPendingAt, dueAt, lastAcceptedAt: now, completedAt: null, lastErrorCode: null }
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });
  }

  public async dueIds(): Promise<string[]> {
    const now = new Date();
    const rows = await this.db.patreonChangeWork.findMany({ where: { OR: [
      { status: "pending", dueAt: { lte: now } }, { status: "running", leaseUntil: { lte: now }, dueAt: { lte: now } }
    ] }, orderBy: { dueAt: "asc" }, take: 10, select: { id: true } });
    return rows.map((r) => r.id);
  }

  public async claim(id: string): Promise<PatreonChangeWork | null> {
    return this.db.$transaction(async (tx) => {
      const now = new Date(), leaseToken = randomUUID();
      const changed = await tx.patreonChangeWork.updateMany({ where: { id, attempts: { lt: PATREON_CHANGE_MAX_ATTEMPTS }, OR: [
        { status: "pending", dueAt: { lte: now } }, { status: "running", leaseUntil: { lte: now }, dueAt: { lte: now } }
      ] }, data: { status: "running", leaseToken, leaseUntil: new Date(now.getTime() + PATREON_CHANGE_LEASE_MS), attempts: { increment: 1 }, firstPendingAt: null } });
      if (changed.count === 0) return null;
      return tx.patreonChangeWork.findFirst({ where: { id, leaseToken } });
    });
  }

  public async heartbeat(row: PatreonChangeWork): Promise<void> {
    const result = await this.db.patreonChangeWork.updateMany({ where: { id: row.id, status: "running", leaseToken: row.leaseToken }, data: { leaseUntil: new Date(Date.now() + PATREON_CHANGE_LEASE_MS) } });
    if (result.count !== 1) throw new Error("Patreon change work lease lost.");
  }

  public async finish(row: PatreonChangeWork, failure?: { retryAfterMs?: number }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      // Acceptance and completion share the same row lock; a new generation cannot be lost.
      await tx.$queryRaw`SELECT id FROM patreon_change_work WHERE id = ${row.id} FOR UPDATE`;
      const current = await tx.patreonChangeWork.findUnique({ where: { id: row.id } });
      if (!current || current.status !== "running" || !row.leaseToken || current.leaseToken !== row.leaseToken) return;
      const superseded = current.generation !== row.generation;
      const failed = failure !== undefined && !superseded;
      const retryNotBefore = failure ? new Date(Math.max(current.retryNotBefore?.getTime() ?? 0, Date.now() + Math.max(failure.retryAfterMs ?? 0, 2000 * 2 ** (row.attempts - 1)))) : null;
      await tx.patreonChangeWork.update({ where: { id: row.id }, data: {
        status: superseded ? "pending" : failed ? row.attempts >= PATREON_CHANGE_MAX_ATTEMPTS ? "failed" : "pending" : "completed",
        leaseToken: null, leaseUntil: null,
        ...(superseded ? { dueAt: new Date(Math.max(current.dueAt.getTime(), retryNotBefore?.getTime() ?? 0)) } : { firstPendingAt: null, dueAt: retryNotBefore ?? new Date() }),
        retryNotBefore: retryNotBefore ?? (superseded ? current.retryNotBefore : null),
        ...(!failure ? { completedGeneration: row.generation } : {}),
        completedAt: !failure && !superseded ? new Date() : null,
        lastErrorCode: failed ? "PATREON_CHANGE_RETRY_REQUIRED" : null
      } });
    });
  }

  /** Failed work is retained until a creator-scoped operator retry or a later delivery. */
  public async retryFailed(id: string, creatorId: string): Promise<boolean> {
    const changed = await this.db.$executeRaw`UPDATE patreon_change_work SET status = 'pending', attempts = 0,
      due_at = GREATEST(COALESCE(retry_not_before, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP), last_error_code = NULL
      WHERE id = ${id} AND creator_id = ${creatorId} AND status = 'failed'`;
    return changed === 1;
  }

  public async retain(): Promise<void> {
    await this.db.patreonChangeWork.deleteMany({ where: { status: "completed", completedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
    // A crash on the last attempt must remain visible rather than sitting forever in running.
    await this.db.patreonChangeWork.updateMany({ where: { status: "running", attempts: { gte: PATREON_CHANGE_MAX_ATTEMPTS }, leaseUntil: { lte: new Date() } }, data: { status: "failed", leaseToken: null, leaseUntil: null, lastErrorCode: "PATREON_CHANGE_RETRY_EXHAUSTED" } });
  }
}
