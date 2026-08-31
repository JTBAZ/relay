/**
 * Command selection completeness/perf probe (RC-P5-T05).
 *
 * Usage:
 *   npm run probe:command-selection
 *
 * JSON Lab 2 always. DATABASE_URL also probes seeded Lab 2 + Dev Ava.
 * Does not apply indexes. Exit 1 on completeness or p95 miss.
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const samples = Math.max(1, Number(process.env.RELAY_LAB2_PROBE_SAMPLES ?? 7));
const budgetMs = Number(process.env.RELAY_LAB2_WARM_P95_MS ?? 1000);

const { prisma } = await import("../dist/src/lib/db.js");
const { runCommandSelectionProbe } = await import("../dist/src/studio/eval/command-selection-probe.js");

try {
  const hasDb = Boolean(process.env.DATABASE_URL?.trim());
  const report = await runCommandSelectionProbe({
    prisma: hasDb ? prisma : null,
    samples,
    budgetMs
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
