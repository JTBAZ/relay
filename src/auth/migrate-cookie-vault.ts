/**
 * Explicit file-to-database cutover. Hosted rows, including deletion markers, always win.
 * @security-audit-required Operator-only encrypted migration; keep source/backup and never log credential material.
 */
import { randomUUID } from "node:crypto";
import { link, open, readFile, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import { TokenEncryption } from "../lib/crypto.js";
import { FilePatreonCookieStore } from "./cookie-store.js";
import { reservePatreonSession } from "./cookie-store-db.js";
import { RELAY_TOKEN_KEY_ID } from "./token-store-db.js";

async function retainBackup(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(contents, "utf8"); await file.sync(); } finally { await file.close(); }
    try { await link(temporary, path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    if (await readFile(path, "utf8") !== contents) throw new Error("Cookie migration source changed; retain the existing backup and resolve the cutover before retrying.");
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
}

export async function migratePatreonCookieVault(input: {
  prisma: PrismaClient; encryption: TokenEncryption; sourcePath: string; apply?: boolean;
}) {
  const sourcePath = resolve(input.sourcePath);
  if (!(await stat(sourcePath)).isFile()) throw new Error("Cookie migration requires an existing encrypted vault file.");
  const source = new FilePatreonCookieStore(sourcePath, input.encryption);
  return source.withMigrationSnapshot(async (data) => {
    // Verify the source key before persisting anything; do not echo decryption errors or material.
    for (const record of Object.values(data.records)) input.encryption.decrypt(record.encrypted_session_id);
    const result = { dryRun: !input.apply, imported: 0, preserved: 0, wouldImport: 0 };
    if (input.apply) await retainBackup(`${sourcePath}.ps06-backup.json`, await readFile(sourcePath, "utf8"));
    const ids = new Set([...Object.keys(data.records), ...Object.keys(data.last_remote_rejections ?? {})]);
    for (const creatorId of ids) {
      const outcome = await input.prisma.$transaction(async (tx) => {
        await reservePatreonSession(tx, creatorId);
        if (await tx.patreonSession.findUnique({ where: { creatorId } })) return "preserved" as const;
        if (!await tx.tenant.findUnique({ where: { relayCreatorId: creatorId }, select: { id: true } })) {
          throw new Error("Cookie migration requires an existing studio for every source creator; no identity reassignment is performed.");
        }
        if (!input.apply) return "wouldImport" as const;
        const record = Object.hasOwn(data.records, creatorId) ? data.records[creatorId] : undefined;
        const rejection = Object.hasOwn(data.last_remote_rejections ?? {}, creatorId) ? data.last_remote_rejections![creatorId] : undefined;
        const fields = {
          creatorId, keyId: RELAY_TOKEN_KEY_ID,
          encryptedSessionId: rejection ? null : record?.encrypted_session_id ?? null,
          storedAt: !rejection && record ? new Date(record.stored_at) : null,
          rejectedAt: rejection ? new Date(rejection.at) : null
        };
        await tx.patreonSession.create({ data: fields });
        const verified = await tx.patreonSession.findUnique({ where: { creatorId } });
        if (!verified || verified.encryptedSessionId !== fields.encryptedSessionId || verified.keyId !== fields.keyId ||
          verified.storedAt?.getTime() !== fields.storedAt?.getTime() || verified.rejectedAt?.getTime() !== fields.rejectedAt?.getTime()) {
          throw new Error("Cookie migration read-back failed; source and backup are retained.");
        }
        return "imported" as const;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 });
      result[outcome]++;
    }
    return result;
  });
}
