/**
 * Studio Lab 2 corpus eval CLI (RC-P2-T03). Exit 1 on miss.
 *
 * Usage:
 *   RELAY_ALLOW_STUDIO_LAB2_SEED=1 npm run eval:studio-lab2-corpus
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const fixtureArg = process.argv.find((a) => a.startsWith("--fixture="))?.slice("--fixture=".length);

const { prisma } = await import("../dist/src/lib/db.js");
const { evalStudioLab2Corpus } = await import("../dist/src/studio/lab2/seed-studio-lab2.js");

try {
  const result = await evalStudioLab2Corpus(prisma, { fixturePath: fixtureArg?.trim() || undefined });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
