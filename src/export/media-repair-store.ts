import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type PatreonMediaRepair, type MediaAsset } from "@prisma/client";
import type { MediaVersionRow } from "../ingest/canonical-store.js";
import type { ExportMediaRecord } from "./types.js";
import { fingerprint } from "./media-repair-state.js";
import { exportBlobPath } from "./export-index.js";

export type RepairLease = PatreonMediaRepair & { leaseToken: string };
const VERIFY_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const dbMediaHead = (row: MediaAsset) => fingerprint([row.creatorId, row.id, row.upstreamStatus, row.currentVersionSeq, row.currentUpstreamRevision, row.currentUpstreamUrl, row.currentStorageKey]);
const key = (creatorId: string, kind: string, resourceId: string) => ({ creatorId_kind_resourceId: { creatorId, kind, resourceId } });
const lock = (tx: Prisma.TransactionClient, name: string) => tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text", name);

/** Durable bounded scheduling metadata. Blob records remain on MediaAsset versions. */
export class MediaRepairStore {
  public constructor(public readonly db: PrismaClient) {}
  /** Schedule current work only; retain provider backoff and never perform provider I/O here. */
  public async retryResource(creatorId: string, campaignId: string, kind: "post" | "media", resourceId: string, expectedHead: string, generation: number): Promise<"accepted" | "already_pending" | "changed"> {
    return this.db.$transaction(async (tx) => {
      await lock(tx, "canonical-store:" + creatorId);
      await lock(tx, "media-repair:" + creatorId);
      const row = await tx.patreonMediaRepair.findUnique({ where: key(creatorId, kind, resourceId) });
      if (!row || row.head !== expectedHead || row.generation !== generation || row.phase === "obsolete" || row.phase === "complete") return "changed";
      let head = "";
      if (kind === "media") {
        const media = await tx.mediaAsset.findFirst({ where: { creatorId, id: resourceId, ingestOrigin: "PATREON", upstreamStatus: "active" } });
        const bound = media && await tx.post.findFirst({ where: { creatorId, id: { in: media.postIds }, campaignId: `patreon_campaign_${campaignId}`, source: "PATREON", upstreamStatus: "active" }, select: { id: true } });
        if (media && bound) head = dbMediaHead(media);
      } else {
        const post = await tx.post.findFirst({ where: { creatorId, id: resourceId, campaignId: `patreon_campaign_${campaignId}`, source: "PATREON", upstreamStatus: "active" }, include: { versions: { orderBy: { versionSeq: "desc" }, take: 1 } } });
        const v = post?.versions[0];
        if (post && v) head = fingerprint([creatorId, post.id, post.source, post.upstreamStatus, post.campaignId, v.versionSeq, v.upstreamRevision, v.mediaIds]);
      }
      if (head !== expectedHead) return "changed";
      if (row.leaseToken || !row.lastError) return "already_pending";
      const updated = await tx.patreonMediaRepair.updateMany({ where: { creatorId, kind, resourceId, head: expectedHead, generation, leaseToken: null },
        data: { phase: "pending", lastError: null, attempts: 0, dueAt: new Date(Math.max(Date.now(), row.dueAt.getTime())) } });
      return updated.count === 1 ? "accepted" : "changed";
    });
  }
  public async ensure(creatorId: string, kind: "post" | "media", resourceId: string, head: string, wakeCookie = false): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await lock(tx, "media-repair:" + creatorId);
      const prior = await tx.patreonMediaRepair.findUnique({ where: key(creatorId, kind, resourceId) });
      if (!prior) await tx.patreonMediaRepair.create({ data: { creatorId, kind, resourceId, head } });
      else if (prior.head !== head || prior.phase === "obsolete") await tx.patreonMediaRepair.update({ where: key(creatorId, kind, resourceId), data: {
        head, generation: { increment: 1 }, phase: "pending", dueAt: new Date(), attempts: 0, leaseToken: null, leaseUntil: null, lastError: null, collection: null, verifiedAt: null } });
      else if (wakeCookie && prior.lastError === "cookie_required") await tx.patreonMediaRepair.update({ where: key(creatorId, kind, resourceId), data: { dueAt: new Date() } });
    });
  }
  public async claim(creatorId: string, kind: "post" | "media"): Promise<RepairLease | null> {
    return this.db.$transaction(async (tx) => {
      const now = new Date();
      const row = await tx.patreonMediaRepair.findFirst({ where: { creatorId, kind, phase: { not: "obsolete" }, dueAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: [{ dueAt: "asc" }, { resourceId: "asc" }] });
      if (!row) return null;
      const token = randomUUID();
      const claimed = await tx.patreonMediaRepair.updateMany({ where: { creatorId, kind, resourceId: row.resourceId, generation: row.generation, head: row.head, dueAt: row.dueAt, phase: { not: "obsolete" },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS) } });
      return claimed.count === 1 ? { ...row, leaseToken: token } : null;
    });
  }
  public async retireIfObsolete(lease: RepairLease): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      await lock(tx, "canonical-store:" + lease.creatorId);
      const active = lease.kind === "post"
        ? await tx.post.findFirst({ where: { creatorId: lease.creatorId, id: lease.resourceId, source: "PATREON", upstreamStatus: "active" }, select: { id: true } })
        : lease.kind === "media"
          ? await tx.mediaAsset.findFirst({ where: { creatorId: lease.creatorId, id: lease.resourceId, ingestOrigin: "PATREON", upstreamStatus: "active" }, select: { id: true } })
          : true;
      if (active) return false;
      const retired = await tx.patreonMediaRepair.updateMany({ where: { creatorId: lease.creatorId, kind: lease.kind, resourceId: lease.resourceId,
        head: lease.head, generation: lease.generation, leaseToken: lease.leaseToken, leaseUntil: { gt: new Date() }, phase: { not: "obsolete" } },
        data: { phase: "obsolete", leaseToken: null, leaseUntil: null, lastError: null, collection: null, verifiedAt: null } });
      return retired.count === 1;
    });
  }
  private async finish(tx: Prisma.TransactionClient, lease: RepairLease, head: string, collection?: string): Promise<void> {
    const result = await tx.patreonMediaRepair.updateMany({ where: { creatorId: lease.creatorId, kind: lease.kind, resourceId: lease.resourceId, generation: lease.generation, leaseToken: lease.leaseToken, leaseUntil: { gt: new Date() } },
      data: { head, phase: "complete", dueAt: new Date(Date.now() + VERIFY_MS), verifiedAt: new Date(), lastError: null, attempts: 0, leaseToken: null, leaseUntil: null, ...(collection ? { collection } : {}) } });
    if (result.count !== 1) throw new Error("Media repair lease changed; retry required.");
  }
  public async fail(lease: RepairLease, reason: string): Promise<void> {
    await this.db.patreonMediaRepair.updateMany({ where: { creatorId: lease.creatorId, kind: lease.kind, resourceId: lease.resourceId, generation: lease.generation, leaseToken: lease.leaseToken, leaseUntil: { gt: new Date() } },
      data: { phase: "pending", lastError: reason, attempts: { increment: 1 }, dueAt: new Date(Date.now() + Math.min(6 * 60 * 60 * 1000, 30_000 * 2 ** Math.min(10, lease.attempts))), leaseToken: null, leaseUntil: null } });
  }
  public async noteFailure(creatorId: string, mediaId: string, expectedHead: string, started: Date): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await lock(tx, "canonical-store:" + creatorId);
      const media = await tx.mediaAsset.findFirst({ where: { id: mediaId, creatorId, upstreamStatus: "active" } });
      if (!media || dbMediaHead(media) !== expectedHead) return;
      const where = key(creatorId, "media", mediaId), prior = await tx.patreonMediaRepair.findUnique({ where });
      if (prior?.phase === "complete" && prior.updatedAt > started) return;
      if (!prior) await tx.patreonMediaRepair.create({ data: { creatorId, kind: "media", resourceId: mediaId, head: expectedHead, lastError: "media_download_retry_required" } });
      else if (prior.head === expectedHead && !prior.leaseToken) await tx.patreonMediaRepair.update({ where, data: { phase: "pending", lastError: "media_download_retry_required", dueAt: new Date() } });
    });
  }
  public async acceptSource(lease: RepairLease, expectedHead: string, collection: "empty" | "media"): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await lock(tx, "canonical-store:" + lease.creatorId);
      const row = await tx.post.findFirst({ where: { id: lease.resourceId, creatorId: lease.creatorId, source: "PATREON", upstreamStatus: "active" }, include: { versions: { orderBy: { versionSeq: "desc" }, take: 1 } } });
      const v = row?.versions[0];
      const head = row && v ? fingerprint([row.creatorId, row.id, row.source, row.upstreamStatus, row.campaignId, v.versionSeq, v.upstreamRevision, v.mediaIds]) : "";
      if (head !== expectedHead) throw new Error("Post changed during media collection.");
      await this.finish(tx, lease, head, collection);
    });
  }
  /** No snapshot save: scalar key, version proof and work completion share the creator lock. */
  public async acceptExport(creatorId: string, mediaId: string, expectedHead: string, record: ExportMediaRecord, lease?: RepairLease): Promise<void> {
    exportBlobPath(".", creatorId, record.relative_blob_path);
    if (record.relative_blob_path.startsWith("relay/") && !record.relative_blob_path.startsWith("relay/tenants/" + encodeURIComponent(creatorId) + "/exports/")) throw new Error("Export blob belongs to another creator.");
    await this.db.$transaction(async (tx) => {
      await lock(tx, "canonical-store:" + creatorId);
      const row = await tx.mediaAsset.findFirst({ where: { id: mediaId, creatorId, upstreamStatus: "active" } });
      if (!row || dbMediaHead(row) !== expectedHead || record.creator_id !== creatorId || record.media_id !== mediaId || record.upstream_revision !== row.currentUpstreamRevision) throw new Error("Media changed during export; retry current revision.");
      const versions = row.versionsJson as unknown as MediaVersionRow[];
      if (!Array.isArray(versions) || !versions.some((v) => v.version_seq === row.currentVersionSeq && v.upstream_revision === row.currentUpstreamRevision)) throw new Error("Media version history is unavailable.");
      const updated = await tx.mediaAsset.updateMany({ where: { id: mediaId, creatorId, ingestOrigin: row.ingestOrigin, upstreamStatus: "active", currentVersionSeq: row.currentVersionSeq, currentUpstreamRevision: row.currentUpstreamRevision, currentUpstreamUrl: row.currentUpstreamUrl, currentStorageKey: row.currentStorageKey },
        data: { currentStorageKey: record.relative_blob_path, versionsJson: versions.map((v) => v.version_seq === row.currentVersionSeq && v.upstream_revision === row.currentUpstreamRevision ? { ...v, storage_key: record.relative_blob_path, export_record: record } : v) as unknown as Prisma.InputJsonValue } });
      if (updated.count !== 1) throw new Error("Media changed during export; retry current revision.");
      const head = dbMediaHead({ ...row, currentStorageKey: record.relative_blob_path });
      if (lease) await this.finish(tx, lease, head);
      else await tx.patreonMediaRepair.updateMany({ where: { creatorId, kind: "media", resourceId: mediaId, head: expectedHead },
        data: { head, phase: "complete", generation: { increment: 1 }, dueAt: new Date(Date.now() + VERIFY_MS), lastError: null, attempts: 0, verifiedAt: new Date(), leaseToken: null, leaseUntil: null } });
    });
  }
  public async seed(creatorId: string, wakeCookie: boolean, cap = 25): Promise<void> {
    const where = key(creatorId, "scan", "posts");
    const scan = await this.db.patreonMediaRepair.findUnique({ where });
    const posts = await this.db.post.findMany({ where: { creatorId, source: "PATREON", upstreamStatus: "active", ...(scan?.head ? { id: { gt: scan.head } } : {}) }, orderBy: { id: "asc" }, take: cap,
      include: { versions: { orderBy: { versionSeq: "desc" }, take: 1 } } });
    for (const post of posts) {
      const v = post.versions[0]; if (!v) continue;
      await this.ensure(creatorId, "post", post.id, fingerprint([creatorId, post.id, post.source, post.upstreamStatus, post.campaignId, v.versionSeq, v.upstreamRevision, v.mediaIds]), wakeCookie);
      const media = v.mediaIds.length ? await this.db.mediaAsset.findMany({ where: { creatorId, id: { in: v.mediaIds }, ingestOrigin: "PATREON", upstreamStatus: "active" } }) : [];
      for (const asset of media) await this.ensure(creatorId, "media", asset.id, dbMediaHead(asset));
    }
    const after = posts.length === cap ? posts.at(-1)!.id : "";
    await this.db.patreonMediaRepair.upsert({ where, create: { creatorId, kind: "scan", resourceId: "posts", head: after }, update: { head: after } });
  }
  public async selectCreators(ids: string[], cap = 5): Promise<string[]> {
    return this.db.$transaction(async (tx) => {
      await lock(tx, "patreon-media-scheduler");
      const prior = await tx.patreonPostScheduler.findUnique({ where: { id: "media-repair" } });
      const sorted = [...new Set(ids)].sort(), start = prior?.afterCreatorId ? sorted.findIndex((id) => id > prior.afterCreatorId!) : 0, at = start < 0 ? 0 : start;
      const selected = [...sorted.slice(at), ...sorted.slice(0, at)].slice(0, cap);
      if (selected.length) await tx.patreonPostScheduler.upsert({ where: { id: "media-repair" }, create: { id: "media-repair", afterCreatorId: selected.at(-1)! }, update: { afterCreatorId: selected.at(-1)! } });
      return selected;
    });
  }
}
