/**
 * @fileoverview Durable Patreon OAuth authorize/callback transactions (Unified Relay Identity).
 * @description Code/state hashes only — never plaintext authorization codes or tokens.
 * Enables idempotent callback replay after browser refresh / Strict Mode remount.
 */

import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  OAuthTransactionPurpose,
  OAuthTransactionStatus
} from "@prisma/client";

export { OAuthTransactionPurpose, OAuthTransactionStatus };

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export function hashOAuthSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function newOAuthStateNonce(): string {
  return randomBytes(24).toString("base64url");
}

export type ClaimOAuthCodeResult =
  | { kind: "replay"; resultJson: Prisma.JsonValue | null; errorCode: string | null; status: OAuthTransactionStatus }
  | { kind: "claimed"; transactionId: string }
  | { kind: "in_flight" }
  | { kind: "conflict"; reason: string };

function replayFromRow(row: {
  resultJson: Prisma.JsonValue | null;
  errorCode: string | null;
  status: OAuthTransactionStatus;
}): ClaimOAuthCodeResult {
  return {
    kind: "replay",
    resultJson: row.resultJson,
    errorCode: row.errorCode,
    status: row.status
  };
}

/**
 * Atomically claim an authorization code for exchange, or return a prior completed outcome.
 *
 * When `stateHash` is provided (creator prepare / signed-state flows), prefer the pending
 * prepare row and attach `codeHash` to it. Creating a second row with the same `state_hash`
 * violates the unique constraint and previously left the HTTP request failing mid-handler.
 */
export async function claimOAuthCodeExchange(
  prisma: PrismaClient,
  args: {
    accountId: string;
    purpose: OAuthTransactionPurpose;
    code: string;
    redirectUri: string;
    relayCreatorId?: string | null;
    stateHash?: string | null;
    ttlMs?: number;
  }
): Promise<ClaimOAuthCodeResult> {
  const codeHash = hashOAuthSecret(args.code);
  const stateHash = args.stateHash?.trim() || null;

  if (stateHash) {
    const byState = await prisma.oAuthTransaction.findUnique({
      where: { stateHash }
    });
    if (byState) {
      if (byState.accountId !== args.accountId) {
        return { kind: "conflict", reason: "state_bound_to_other_account" };
      }
      if (
        byState.status === OAuthTransactionStatus.completed ||
        byState.status === OAuthTransactionStatus.failed
      ) {
        if (byState.codeHash && byState.codeHash !== codeHash) {
          return { kind: "conflict", reason: "state_already_consumed" };
        }
        return replayFromRow(byState);
      }
      if (byState.status === OAuthTransactionStatus.in_progress) {
        return { kind: "in_flight" };
      }
      if (byState.status === OAuthTransactionStatus.pending) {
        if (byState.expiresAt.getTime() < Date.now()) {
          return { kind: "conflict", reason: "state_expired" };
        }
        try {
          const updated = await prisma.oAuthTransaction.updateMany({
            where: {
              id: byState.id,
              status: OAuthTransactionStatus.pending
            },
            data: {
              status: OAuthTransactionStatus.in_progress,
              codeHash,
              consumedAt: new Date(),
              redirectUri: args.redirectUri,
              relayCreatorId: args.relayCreatorId ?? byState.relayCreatorId
            }
          });
          if (updated.count === 0) return { kind: "in_flight" };
          return { kind: "claimed", transactionId: byState.id };
        } catch {
          const racedCode = await prisma.oAuthTransaction.findUnique({ where: { codeHash } });
          if (racedCode) {
            if (
              racedCode.status === OAuthTransactionStatus.completed ||
              racedCode.status === OAuthTransactionStatus.failed
            ) {
              return replayFromRow(racedCode);
            }
            return { kind: "in_flight" };
          }
          return { kind: "conflict", reason: "state_claim_failed" };
        }
      }
    }
  }

  const existing = await prisma.oAuthTransaction.findUnique({
    where: { codeHash }
  });
  if (existing) {
    if (
      existing.status === OAuthTransactionStatus.completed ||
      existing.status === OAuthTransactionStatus.failed
    ) {
      return replayFromRow(existing);
    }
    if (existing.status === OAuthTransactionStatus.in_progress) {
      return { kind: "in_flight" };
    }
    if (existing.accountId !== args.accountId) {
      return { kind: "conflict", reason: "code_bound_to_other_account" };
    }
  }

  const expiresAt = new Date(Date.now() + (args.ttlMs ?? DEFAULT_TTL_MS));
  try {
    if (existing?.status === OAuthTransactionStatus.pending) {
      const updated = await prisma.oAuthTransaction.updateMany({
        where: {
          id: existing.id,
          status: OAuthTransactionStatus.pending
        },
        data: {
          status: OAuthTransactionStatus.in_progress,
          consumedAt: new Date(),
          redirectUri: args.redirectUri,
          relayCreatorId: args.relayCreatorId ?? existing.relayCreatorId
        }
      });
      if (updated.count === 0) return { kind: "in_flight" };
      return { kind: "claimed", transactionId: existing.id };
    }

    const created = await prisma.oAuthTransaction.create({
      data: {
        accountId: args.accountId,
        purpose: args.purpose,
        status: OAuthTransactionStatus.in_progress,
        codeHash,
        stateHash,
        relayCreatorId: args.relayCreatorId ?? null,
        redirectUri: args.redirectUri,
        expiresAt,
        consumedAt: new Date()
      }
    });
    return { kind: "claimed", transactionId: created.id };
  } catch (err) {
    // Unique race on code_hash or state_hash — re-read for replay/in-flight.
    const racedCode = await prisma.oAuthTransaction.findUnique({ where: { codeHash } });
    if (racedCode) {
      if (
        racedCode.status === OAuthTransactionStatus.completed ||
        racedCode.status === OAuthTransactionStatus.failed
      ) {
        return replayFromRow(racedCode);
      }
      return { kind: "in_flight" };
    }
    if (stateHash) {
      const racedState = await prisma.oAuthTransaction.findUnique({ where: { stateHash } });
      if (racedState) {
        if (
          racedState.status === OAuthTransactionStatus.completed ||
          racedState.status === OAuthTransactionStatus.failed
        ) {
          return replayFromRow(racedState);
        }
        if (racedState.status === OAuthTransactionStatus.in_progress) {
          return { kind: "in_flight" };
        }
        if (
          racedState.status === OAuthTransactionStatus.pending &&
          racedState.accountId === args.accountId
        ) {
          const updated = await prisma.oAuthTransaction.updateMany({
            where: { id: racedState.id, status: OAuthTransactionStatus.pending },
            data: {
              status: OAuthTransactionStatus.in_progress,
              codeHash,
              consumedAt: new Date(),
              redirectUri: args.redirectUri,
              relayCreatorId: args.relayCreatorId ?? racedState.relayCreatorId
            }
          });
          if (updated.count === 0) return { kind: "in_flight" };
          return { kind: "claimed", transactionId: racedState.id };
        }
      }
    }
    throw err;
  }
}

export async function completeOAuthTransaction(
  prisma: PrismaClient,
  args: {
    transactionId: string;
    ok: boolean;
    resultJson?: Prisma.InputJsonValue;
    errorCode?: string | null;
  }
): Promise<void> {
  await prisma.oAuthTransaction.update({
    where: { id: args.transactionId },
    data: {
      status: args.ok ? OAuthTransactionStatus.completed : OAuthTransactionStatus.failed,
      resultJson: args.resultJson ?? undefined,
      errorCode: args.errorCode ?? null,
      completedAt: new Date()
    }
  });
}

/**
 * Mint a pending transaction bound to account + purpose (optional prepare step).
 */
export async function beginOAuthTransaction(
  prisma: PrismaClient,
  args: {
    accountId: string;
    purpose: OAuthTransactionPurpose;
    state: string;
    relayCreatorId?: string | null;
    redirectUri?: string | null;
    returnPath?: string | null;
    ttlMs?: number;
  }
): Promise<{ transactionId: string; stateHash: string; expiresAt: Date }> {
  const stateHash = hashOAuthSecret(args.state);
  const expiresAt = new Date(Date.now() + (args.ttlMs ?? DEFAULT_TTL_MS));
  const row = await prisma.oAuthTransaction.create({
    data: {
      accountId: args.accountId,
      purpose: args.purpose,
      status: OAuthTransactionStatus.pending,
      stateHash,
      relayCreatorId: args.relayCreatorId ?? null,
      redirectUri: args.redirectUri ?? null,
      returnPath: args.returnPath ?? null,
      expiresAt
    }
  });
  return { transactionId: row.id, stateHash, expiresAt };
}
