import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

/** Resolve repo root from this file so `.env` loads even when cwd is not the repo (e.g. `node dist/src/main.js` from elsewhere). */
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

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
loadEnv({ path: join(repoRoot, ".env") });

type GlobalWithPrisma = typeof globalThis & { __prisma?: PrismaClient };

const g = globalThis as GlobalWithPrisma;

function prismaLogLevels(): ("query" | "info" | "warn" | "error")[] | undefined {
  const dev =
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "dev" ||
    process.env.RELAY_PRISMA_DEBUG === "1" ||
    process.env.RELAY_PRISMA_DEBUG === "true";
  if (!dev) return ["error"];
  return ["query", "warn", "error"];
}

/** Single PrismaClient per process; reuses `globalThis.__prisma` in dev to survive hot reload. */
export const prisma = g.__prisma ?? new PrismaClient({ log: prismaLogLevels() });

if (process.env.NODE_ENV !== "production") {
  g.__prisma = prisma;
}
