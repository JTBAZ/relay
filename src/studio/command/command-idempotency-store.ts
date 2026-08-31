/**
 * Postgres IdempotencyStore for Command Layer apply (RC-P8-T05).
 * Falls back to no-ops when the table is absent (pre-HUMAN-MIGRATE).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  IdempotencyResponseSnapshot,
  IdempotencyStore,
  ReserveOutcome
} from "../../middleware/idempotency-store.js";

function isMissingRelation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code === "P2021" || code === "P2022" || code === "P2010") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /does not exist in the current database/i.test(msg);
}

function snapshotFromRow(row: {
  bodyHash: string;
  status: number | null;
  responseJson: Prisma.JsonValue | null;
  headersJson: Prisma.JsonValue | null;
  snapshotExpiresAt: Date | null;
}): IdempotencyResponseSnapshot | null {
  if (row.status == null || row.responseJson === null || row.responseJson === undefined) return null;
  if (row.snapshotExpiresAt && row.snapshotExpiresAt.getTime() <= Date.now()) return null;
  const headers =
    row.headersJson && typeof row.headersJson === "object" && !Array.isArray(row.headersJson)
      ? (row.headersJson as Record<string, string>)
      : { "content-type": "application/json" };
  return {
    status: row.status,
    body: row.responseJson,
    headers,
    bodyHash: row.bodyHash,
    recordedAt: row.snapshotExpiresAt ? row.snapshotExpiresAt.getTime() : Date.now()
  };
}

export class PrismaCommandIdempotencyStore implements IdempotencyStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async tryReserve(key: string, lockTtlMs: number): Promise<ReserveOutcome> {
    if (typeof this.prisma.commandIdempotencyKey?.upsert !== "function") {
      return { state: "fresh" };
    }
    const now = new Date();
    try {
      const existing = await this.prisma.commandIdempotencyKey.findUnique({
        where: { storageKey: key }
      });
      const replay = existing ? snapshotFromRow(existing) : null;
      if (replay) return { state: "replay", snapshot: replay };
      if (existing?.lockedUntil && existing.lockedUntil.getTime() > now.getTime()) {
        return { state: "in_flight" };
      }
      await this.prisma.commandIdempotencyKey.upsert({
        where: { storageKey: key },
        create: {
          storageKey: key,
          bodyHash: "",
          lockedUntil: new Date(Date.now() + lockTtlMs)
        },
        update: {
          lockedUntil: new Date(Date.now() + lockTtlMs)
        }
      });
      return { state: "fresh" };
    } catch (err) {
      if (isMissingRelation(err)) return { state: "fresh" };
      const code = err && typeof err === "object" ? (err as { code?: string }).code : undefined;
      if (code === "P2002") {
        const raced = await this.prisma.commandIdempotencyKey.findUnique({
          where: { storageKey: key }
        });
        const replay = raced ? snapshotFromRow(raced) : null;
        if (replay) return { state: "replay", snapshot: replay };
        return { state: "in_flight" };
      }
      throw err;
    }
  }

  public async recordResponse(
    key: string,
    snapshot: IdempotencyResponseSnapshot,
    responseTtlMs: number
  ): Promise<void> {
    if (typeof this.prisma.commandIdempotencyKey?.upsert !== "function") return;
    try {
      await this.prisma.commandIdempotencyKey.upsert({
        where: { storageKey: key },
        create: {
          storageKey: key,
          bodyHash: snapshot.bodyHash,
          status: snapshot.status,
          responseJson: snapshot.body as Prisma.InputJsonValue,
          headersJson: snapshot.headers as Prisma.InputJsonValue,
          lockedUntil: null,
          snapshotExpiresAt: new Date(Date.now() + responseTtlMs)
        },
        update: {
          bodyHash: snapshot.bodyHash,
          status: snapshot.status,
          responseJson: snapshot.body as Prisma.InputJsonValue,
          headersJson: snapshot.headers as Prisma.InputJsonValue,
          lockedUntil: null,
          snapshotExpiresAt: new Date(Date.now() + responseTtlMs)
        }
      });
    } catch (err) {
      if (isMissingRelation(err)) return;
      throw err;
    }
  }

  public async getResponse(key: string): Promise<IdempotencyResponseSnapshot | null> {
    if (typeof this.prisma.commandIdempotencyKey?.findUnique !== "function") return null;
    try {
      const row = await this.prisma.commandIdempotencyKey.findUnique({
        where: { storageKey: key }
      });
      return row ? snapshotFromRow(row) : null;
    } catch (err) {
      if (isMissingRelation(err)) return null;
      throw err;
    }
  }

  public async release(key: string): Promise<void> {
    if (typeof this.prisma.commandIdempotencyKey?.updateMany !== "function") return;
    try {
      await this.prisma.commandIdempotencyKey.updateMany({
        where: { storageKey: key, status: null },
        data: { lockedUntil: null }
      });
    } catch (err) {
      if (isMissingRelation(err)) return;
      throw err;
    }
  }
}

export async function deleteCommandIdempotencyForCreator(
  prisma: PrismaClient,
  creatorId: string
): Promise<void> {
  if (typeof prisma.commandIdempotencyKey?.deleteMany !== "function") return;
  const prefix = `command-apply:${creatorId}`;
  try {
    await prisma.commandIdempotencyKey.deleteMany({
      where: { storageKey: { startsWith: prefix } }
    });
  } catch (err) {
    if (isMissingRelation(err)) return;
    throw err;
  }
}
