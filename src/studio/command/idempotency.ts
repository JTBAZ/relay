/**
 * Command Layer idempotency wrapper over `IdempotencyStore` (RC-P1-T07).
 * Callers depend on this module, not a Map, so P2 can swap memory → Redis/Postgres.
 *
 * Body hashing lives here (not on the store) to match `idempotency-middleware.ts`.
 * Replay of the same key+body is COMMAND_IDEMPOTENT_REPLAY at the HTTP/MCP edge;
 * a different body under the same key is COMMAND_VALIDATION body_mismatch.
 */

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type {
  IdempotencyResponseSnapshot,
  IdempotencyStore
} from "../../middleware/idempotency-store.js";
import { InMemoryIdempotencyStore } from "../../middleware/idempotency-store.js";
import { CommandContractError } from "./contracts.js";
import { PrismaCommandIdempotencyStore } from "./command-idempotency-store.js";

const DEFAULT_LOCK_TTL_MS = 60_000;
const DEFAULT_RESPONSE_TTL_MS = 24 * 60 * 60 * 1000;

export function createCommandIdempotencyStore(
  prisma?: PrismaClient | null
): IdempotencyStore {
  if (prisma && typeof prisma.commandIdempotencyKey?.upsert === "function") {
    return new PrismaCommandIdempotencyStore(prisma);
  }
  return new InMemoryIdempotencyStore();
}

function canonicalBody(body: unknown): string {
  if (body === undefined || body === null) return "";
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  return JSON.stringify(body, sortedReplacer());
}

function sortedReplacer(): (this: unknown, k: string, v: unknown) => unknown {
  return function replacer(_k, v) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[key] = (v as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return v;
  };
}

export function hashCommandBody(body: unknown): string {
  return createHash("sha256").update(canonicalBody(body)).digest("hex");
}

export function commandIdempotencyStorageKey(scope: string, key: string): string {
  return `${scope}\u001f${key}`;
}

export type CommandIdempotencyBegin =
  | { state: "fresh" }
  | { state: "in_flight" }
  | { state: "replay"; snapshot: IdempotencyResponseSnapshot };

export async function beginCommandIdempotency(
  store: IdempotencyStore,
  args: { scope: string; key: string; body: unknown; lockTtlMs?: number }
): Promise<CommandIdempotencyBegin> {
  const storageKey = commandIdempotencyStorageKey(args.scope, args.key);
  const bodyHash = hashCommandBody(args.body);
  const reserve = await store.tryReserve(storageKey, args.lockTtlMs ?? DEFAULT_LOCK_TTL_MS);
  if (reserve.state === "replay") {
    if (reserve.snapshot.bodyHash !== bodyHash) {
      throw new CommandContractError(
        "COMMAND_VALIDATION",
        "Idempotency-Key was previously used with a different request body.",
        [{ field: "idempotency_key", issue: "body_mismatch" }]
      );
    }
    return reserve;
  }
  return reserve;
}

export async function recordCommandIdempotency(
  store: IdempotencyStore,
  args: {
    scope: string;
    key: string;
    body: unknown;
    status: number;
    responseBody: unknown;
    responseTtlMs?: number;
  }
): Promise<void> {
  const storageKey = commandIdempotencyStorageKey(args.scope, args.key);
  await store.recordResponse(
    storageKey,
    {
      status: args.status,
      body: args.responseBody,
      headers: { "content-type": "application/json" },
      bodyHash: hashCommandBody(args.body),
      recordedAt: Date.now()
    },
    args.responseTtlMs ?? DEFAULT_RESPONSE_TTL_MS
  );
}

export function commandIdempotentReplayError(changeSetId: string): CommandContractError {
  return new CommandContractError(
    "COMMAND_IDEMPOTENT_REPLAY",
    "Identical command was already applied.",
    [{ field: "change_set_id", issue: changeSetId }]
  );
}
