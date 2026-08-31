/**
 * Studio Lab 2 seed CLI — apply | status | cleanup (RC-P2-T02).
 *
 * Usage:
 *   RELAY_ALLOW_STUDIO_LAB2_SEED=1 npm run seed:studio-lab2 apply
 *   RELAY_ALLOW_STUDIO_LAB2_SEED=1 npm run seed:studio-lab2 status
 *   RELAY_ALLOW_STUDIO_LAB2_SEED=1 npm run seed:studio-lab2 cleanup
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const command = (process.argv[2] ?? "status").trim().toLowerCase();
const fixtureArg = process.argv.find((a) => a.startsWith("--fixture="))?.slice("--fixture=".length);

const { prisma } = await import("../dist/src/lib/db.js");
const {
  applyStudioLab2Corpus,
  statusStudioLab2Corpus,
  cleanupStudioLab2Corpus
} = await import("../dist/src/studio/lab2/seed-studio-lab2.js");

const fixturePath = fixtureArg?.trim() || undefined;

try {
  if (command === "apply") {
    const out = await applyStudioLab2Corpus(prisma, { fixturePath });
    console.log(
      `apply: ok\n` +
        `  creator=${out.creator_id}\n` +
        `  account=${out.account_id}\n` +
        `  posts=${out.post_count}\n` +
        `  fixture_hash=${out.fixture_hash}`
    );
  } else if (command === "status") {
    const s = await statusStudioLab2Corpus(prisma, { fixturePath });
    console.log(JSON.stringify(s, null, 2));
  } else if (command === "cleanup") {
    const out = await cleanupStudioLab2Corpus(prisma);
    console.log(
      `cleanup: deleted_posts=${out.deleted_posts} deleted_collections=${out.deleted_collections} deleted_metrics=${out.deleted_metrics}`
    );
  } else {
    console.error(`Unknown command ${command}. Use apply | status | cleanup.`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
