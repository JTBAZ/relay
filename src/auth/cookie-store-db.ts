/**
 * Creator-scoped encrypted browser sessions shared by hosted API and workers.
 * @security-audit-required Requires the server database role; a stored cookie proves no provider identity.
 */
import { Prisma, type PrismaClient, type PatreonSession } from "@prisma/client";
import { TokenEncryption } from "../lib/crypto.js";
import { PatreonCookieVault, type CookieState, type FilePatreonCookieStoreOptions } from "./cookie-store.js";
import { RELAY_TOKEN_KEY_ID } from "./token-store-db.js";

export async function reservePatreonSession(tx: Prisma.TransactionClient, creatorId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${"patreon-session:" + creatorId}, 0))`;
}

export class DbPatreonCookieStore extends PatreonCookieVault {
  public constructor(private readonly prisma: PrismaClient, encryption: TokenEncryption, options?: FilePatreonCookieStoreOptions) {
    super(encryption, options);
  }
  private state(row: PatreonSession | null): CookieState {
    if (!row) return {};
    if (row.keyId !== RELAY_TOKEN_KEY_ID) throw new Error("Patreon session encryption key is unavailable.");
    if ((row.encryptedSessionId === null) !== (row.storedAt === null) || row.encryptedSessionId === "") {
      throw new Error("Patreon session record is invalid.");
    }
    return {
      record: row.encryptedSessionId && row.storedAt ? {
        creator_id: row.creatorId, encrypted_session_id: row.encryptedSessionId, stored_at: row.storedAt.toISOString()
      } : undefined,
      rejectedAt: row.rejectedAt?.toISOString()
    };
  }
  protected async readState(creatorId: string): Promise<CookieState> {
    return this.state(await this.prisma.patreonSession.findUnique({ where: { creatorId } }));
  }
  protected async mutateState<T>(creatorId: string, fn: (state: CookieState) => T): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await reservePatreonSession(tx, creatorId);
      const state = this.state(await tx.patreonSession.findUnique({ where: { creatorId } }));
      const result = fn(state);
      const data = {
        encryptedSessionId: state.record?.encrypted_session_id ?? null,
        storedAt: state.record ? new Date(state.record.stored_at) : null,
        rejectedAt: state.rejectedAt ? new Date(state.rejectedAt) : null,
        keyId: RELAY_TOKEN_KEY_ID
      };
      await tx.patreonSession.upsert({ where: { creatorId }, create: { creatorId, ...data }, update: data });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 });
  }
}
