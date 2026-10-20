import type { PrismaClient } from "@prisma/client";
import { TokenEncryption } from "../lib/crypto.js";
import { parseOptionalEnvBool } from "../security/production-env-defaults.js";
import { FilePatreonCookieStore, type PatreonCookieStore } from "./cookie-store.js";
import { DbPatreonCookieStore } from "./cookie-store-db.js";

/** Used by createApp in both API and worker processes. No fallback after a database failure. */
export function createPatreonCookieStore(input: {
  prisma?: PrismaClient; encryption: TokenEncryption; filePath: string; dbEnabled?: boolean; requireShared?: boolean;
}, env: NodeJS.ProcessEnv = process.env): PatreonCookieStore {
  const raw = env.RELAY_DB_STORE_PATREON_COOKIE;
  const configured = input.dbEnabled ?? parseOptionalEnvBool(raw);
  if (input.dbEnabled === undefined && raw?.trim() && configured === undefined) {
    throw new Error("RELAY_DB_STORE_PATREON_COOKIE must be a boolean.");
  }
  const hosted = env.NODE_ENV === "production" && Boolean(input.prisma);
  const sharedRequired = hosted || input.requireShared === true;
  const useDb = configured ?? hosted;
  if (sharedRequired && !useDb) throw new Error("Shared Patreon session storage is required; enable RELAY_DB_STORE_PATREON_COOKIE for API and workers.");
  if (useDb && !input.prisma) throw new Error("Shared Patreon session storage requires config.prisma and the session-vault migration.");
  return useDb ? new DbPatreonCookieStore(input.prisma!, input.encryption) : new FilePatreonCookieStore(input.filePath, input.encryption);
}
