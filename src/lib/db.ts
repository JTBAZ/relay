/**
 * @fileoverview Prisma ORM bootstrap: loads repo `.env`, constructs a driver-adapter client, and exports the process-wide singleton.
 * @description Uses `@prisma/adapter-pg` with `DATABASE_URL`. Reuses `globalThis.__prisma` in non-production for dev hot reload.
 * @see prisma/schema.prisma Database models
 * @see src/jsdoc-core-entities.ts `SupabaseTenantScopedRow` conceptual mapping
 * @throws {Error} From `requireDatabaseUrl()` when `DATABASE_URL` is missing.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

/**
 * @description Walks parent directories to locate `package.json` + `prisma/schema.prisma` (max 12 hops).
 * @param {string} startDir Starting directory (typically this module's folder).
 * @returns {string} Repository root, or `startDir` if not found.
 */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    const pkg = join(dir, "package.json");
    const schema = join(dir, "prisma", "schema.prisma");
    if (existsSync(pkg) && existsSync(schema)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

/**
 * @description Resolved repository root used to load `.env` for `DATABASE_URL` discovery.
 * @const {string} repoRoot
 */
const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
loadEnv({ path: join(repoRoot, ".env") });

/**
 * @description Global object augmented with optional cached Prisma client (`__prisma`).
 */
type GlobalWithPrisma = typeof globalThis & { __prisma?: PrismaClient };

/**
 * @description Typed handle to `globalThis` for Prisma singleton attachment.
 * @const g
 */
const g = globalThis as GlobalWithPrisma;

/**
 * @description Selects Prisma log levels from `NODE_ENV` and `RELAY_PRISMA_DEBUG`.
 * @returns {("query"|"info"|"warn"|"error")[]|undefined} Verbose query logging in development when enabled.
 */
function prismaLogLevels(): ("query" | "info" | "warn" | "error")[] | undefined {
  const dev =
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "dev" ||
    process.env.RELAY_PRISMA_DEBUG === "1" ||
    process.env.RELAY_PRISMA_DEBUG === "true";
  if (!dev) return ["error"];
  return ["query", "warn", "error"];
}

/**
 * @description Reads `DATABASE_URL` from environment (post-dotenv load).
 * @returns {string} Non-empty connection string.
 * @throws {Error} When `DATABASE_URL` is missing or blank.
 */
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required for Prisma (repo root `.env`). Prisma ORM 7 uses `@prisma/adapter-pg`; see `.env.example`."
    );
  }
  return url;
}

/**
 * @description Builds a `PrismaClient` with Postgres adapter and selected log levels.
 * @returns {PrismaClient} New client instance (not yet attached to global).
 */
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: requireDatabaseUrl() });
  return new PrismaClient({ adapter, log: prismaLogLevels() });
}

/**
 * @description Single `PrismaClient` per process; reuses `globalThis.__prisma` in dev to survive hot reload.
 * @const {PrismaClient} prisma
 * @throws {Error} Lazy-throws on first query if `DATABASE_URL` was invalid (driver connection).
 * @see src/main.ts `createApp({ prisma })` wiring
 */
export const prisma = g.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  g.__prisma = prisma;
}
