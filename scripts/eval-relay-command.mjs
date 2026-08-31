/**
 * Relay Command eval CLI (RC-P3-T04 / RC-P7-T04).
 *
 * Usage:
 *   npm run eval:relay-command -- --facade-only
 *   npm run eval:relay-command -- --live-model
 *
 * `--facade-only` maps the eval corpus through a deterministic intent fixture
 * (no LLM). Requires a seeded Lab 2 creator when DATABASE_URL is set.
 * `--allow-unseeded` runs JSON-fixture assertions only (records db: skipped).
 * `--live-model` runs held-out planner eval when RELAY_COMMAND_EVAL_MODEL=1
 * and a key exists; otherwise it skips cleanly (exit 0).
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const args = process.argv.slice(2);
const liveModel = args.includes("--live-model");
const allowUnseeded = args.includes("--allow-unseeded");
const fixtureArg = args.find((a) => a.startsWith("--eval-corpus="))?.slice("--eval-corpus=".length);

const { prisma } = await import("../dist/src/lib/db.js");
const { runCommandEvalFacade } = await import("../dist/src/studio/eval/command-eval-runner.js");
try {
  const requireDb = !allowUnseeded;
  const report = await runCommandEvalFacade({
    facadeOnly: true,
    requireDb,
    evalCorpusPath: fixtureArg?.trim() || undefined,
    prisma,
    env: process.env
  });
  /** @type {Record<string, unknown>} */
  const out = { ...report };
  if (liveModel) {
    const { runCommandPlannerEval } = await import("../dist/src/studio/eval/command-planner-eval.js");
    const live = await runCommandPlannerEval({ env: process.env });
    out.live_model = live.status;
    if (live.skip_reason) out.live_model_skip_reason = live.skip_reason;
    out.planner_eval = {
      ok: live.ok,
      schema_version: live.schema_version,
      model: live.model ?? null,
      provider: live.provider ?? null,
      case_count: live.case_count,
      run_count: live.run_count,
      match_rate: live.match_rate,
      safety_reject_rate: live.safety_reject_rate,
      thresholds: live.thresholds,
      cases: live.cases
    };
    if (live.status === "ran" && !live.ok) out.ok = false;
  }
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exitCode = 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
