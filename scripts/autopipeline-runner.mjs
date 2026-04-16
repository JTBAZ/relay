/**
 * Airtable writing-pipeline orchestration (MVP scaffold).
 * Syncs Airtable queue ↔ Story Blocks/Airtable Drops/incoming/ (or STORY_BLOCKS_DIR), appends Sessions (Runs), advances Status,
 * optionally enforces a single Ready row (winner = lowest Sort Order among eligible).
 *
 * Env (repo root .env):
 *   Airtable PAT — prefers autopipeline-specific vars first:
 *   AIRTABLE_AUTOPIPELINE_TOKEN, AIRTABLE_AUTOPIPELINE_PAT, then AIRTABLE_PAT, AIRTABLE_TOKEN,
 *   AIRTABLE_ACCESS_TOKEN, AIRTABLE_API_KEY (first set wins)
 *   AIRTABLE_AUTOPIPELINE_BASE_ID — default: Relay Patreon Milestones (see below)
 *   AIRTABLE_AUTOPIPELINE_TASKS_TABLE / _RUNS_TABLE / _SYSTEM_STATE_TABLE — override if you duplicate the base
 *   STORY_BLOCKS_DIR — absolute path to Story Blocks pack if not at <repo>/Story Blocks (incoming/sync-in target)
 *
 * Field name overrides (when Airtable columns differ, e.g. Beat Key vs Task Key):
 *   AUTOPIPELINE_FIELD_TASK_KEY, _TITLE, _SORT_ORDER, _STATUS, _PROMPT_PATH,
 *   _DELTA_IN, _DELTA_OUT, _NEXT_TASK, _RETRY_COUNT, _MAX_RETRIES,
 *   _OFF_SCRIPT, _OFF_SCRIPT_REASON, _AUTOMATION_ALLOWED,
 *   _RUN_LABEL, _RUN_TASK, _RUN_STARTED_AT, _RUN_FINISHED_AT, _RUN_CLI_EXIT_CODE,
 *   _RUN_PROMPT_SNAPSHOT, _RUN_OUTPUT_SUMMARY, _RUN_OUTCOME,
 *   _SYSTEM_AUTOMATION_MASTER, _SYSTEM_CURRENT_TASK
 *
 * Usage:
 *   node scripts/autopipeline-runner.mjs status
 *   node scripts/autopipeline-runner.mjs sync-in [--taskKey T-007]
 *   node scripts/autopipeline-runner.mjs enforce-ready [--dry-run]
 *   node scripts/autopipeline-runner.mjs complete --taskKey T-006 --exitCode 0 [--stdoutFile out.txt] [--deltaOutFile delta.md]
 *   node scripts/autopipeline-runner.mjs prepare   # sync-in for winner + print suggested agent command
 *   node scripts/autopipeline-runner.mjs run-until-barrier [--dry-run] [--max-runs N]
 *
 *   node scripts/autopipeline-runner.mjs run-until-t011  # deprecated alias → run-until-barrier
 *
 * npm: npm run autopipeline -- status
 * PowerShell: npm strips args after the first `--token` unless you add a second `--`:
 *   npm run autopipeline -- -- run-until-barrier --dry-run
 * Or use: npm run autopipeline:run-until-barrier:dry
 */
import { config } from "dotenv";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
config({ path: join(ROOT, ".env") });
/** Optional overrides / secrets not committed — same pattern as many JS toolchains */
config({ path: join(ROOT, ".env.local"), override: true });

const TOKEN =
  process.env.AIRTABLE_AUTOPIPELINE_TOKEN ||
  process.env.AIRTABLE_AUTOPIPELINE_PAT ||
  process.env.AIRTABLE_PAT ||
  process.env.AIRTABLE_TOKEN ||
  process.env.AIRTABLE_ACCESS_TOKEN ||
  process.env.AIRTABLE_API_KEY ||
  "";
/** Relay Patreon Milestones — Tasks / Runs / System State from autopipeline setup */
const BASE_ID =
  process.env.AIRTABLE_AUTOPIPELINE_BASE_ID || "appiJUmsc0vRwNn9j";
const TABLE_TASKS =
  process.env.AIRTABLE_AUTOPIPELINE_TASKS_TABLE || "tbl5z2yym2yUvSsvk";
const TABLE_RUNS =
  process.env.AIRTABLE_AUTOPIPELINE_RUNS_TABLE || "tblcfiYUt4Skh5YDI";
const TABLE_SYSTEM =
  process.env.AIRTABLE_AUTOPIPELINE_SYSTEM_STATE_TABLE || "tbl7wVkvUIApZ16Cj";

const STORY_BLOCKS_ROOT = process.env.STORY_BLOCKS_DIR
  ? process.env.STORY_BLOCKS_DIR
  : join(ROOT, "Story Blocks");
const INCOMING_DIR = join(STORY_BLOCKS_ROOT, "Airtable Drops", "incoming");

/** @returns {Record<string, string>} */
function resolveFields() {
  return {
    taskKey: process.env.AUTOPIPELINE_FIELD_TASK_KEY || "Task Key",
    title: process.env.AUTOPIPELINE_FIELD_TITLE || "Title",
    sortOrder: process.env.AUTOPIPELINE_FIELD_SORT_ORDER || "Sort Order",
    status: process.env.AUTOPIPELINE_FIELD_STATUS || "Status",
    promptPath: process.env.AUTOPIPELINE_FIELD_PROMPT_PATH || "Prompt Path",
    deltaIn: process.env.AUTOPIPELINE_FIELD_DELTA_IN || "Delta In",
    deltaOut: process.env.AUTOPIPELINE_FIELD_DELTA_OUT || "Delta Out",
    nextTask: process.env.AUTOPIPELINE_FIELD_NEXT_TASK || "Next Task",
    retryCount: process.env.AUTOPIPELINE_FIELD_RETRY_COUNT || "Retry Count",
    maxRetries: process.env.AUTOPIPELINE_FIELD_MAX_RETRIES || "Max Retries",
    offScript: process.env.AUTOPIPELINE_FIELD_OFF_SCRIPT || "Off Script",
    offScriptReason:
      process.env.AUTOPIPELINE_FIELD_OFF_SCRIPT_REASON || "Off Script Reason",
    automationAllowed:
      process.env.AUTOPIPELINE_FIELD_AUTOMATION_ALLOWED || "Automation Allowed",
    runLabel: process.env.AUTOPIPELINE_FIELD_RUN_LABEL || "Label",
    runTask: process.env.AUTOPIPELINE_FIELD_RUN_TASK || "Task",
    runStartedAt: process.env.AUTOPIPELINE_FIELD_RUN_STARTED_AT || "Started At",
    runFinishedAt:
      process.env.AUTOPIPELINE_FIELD_RUN_FINISHED_AT || "Finished At",
    runCliExitCode:
      process.env.AUTOPIPELINE_FIELD_RUN_CLI_EXIT_CODE || "CLI Exit Code",
    runPromptSnapshot:
      process.env.AUTOPIPELINE_FIELD_RUN_PROMPT_SNAPSHOT || "Prompt Snapshot",
    runOutputSummary:
      process.env.AUTOPIPELINE_FIELD_RUN_OUTPUT_SUMMARY || "Output Summary",
    runOutcome: process.env.AUTOPIPELINE_FIELD_RUN_OUTCOME || "Outcome",
    systemAutomationMaster:
      process.env.AUTOPIPELINE_FIELD_SYSTEM_AUTOMATION_MASTER ||
      "Automation Master Enabled",
    systemCurrentTask:
      process.env.AUTOPIPELINE_FIELD_SYSTEM_CURRENT_TASK || "Current Task"
  };
}

const F = resolveFields();

function usage() {
  console.log(`autopipeline-runner.mjs — Airtable ↔ files, Sessions (Runs), Status (MVP)

Commands:
  status              System State + eligible Ready beats (winner = lowest Sort Order)
  sync-in             Write queue Delta In → Story Blocks/Airtable Drops/incoming/<TaskKey>-delta-in.md
  enforce-ready       Demote extra Ready rows to Pending (keeps one winner)
  complete            Log a session, update beat, optional handoff to Next Task (--taskKey, --exitCode, …)
  prepare             sync-in for winner + print suggested PowerShell agent command
  run-until-barrier   Loop: lowest Ready beat before barrier → agent → complete
  run-until-t011      Deprecated alias for run-until-barrier (same behavior)

Options:
  --taskKey T-00N     For sync-in / complete
  --dry-run           For enforce-ready: print only; for run-until-barrier: show first task only
                      (from PowerShell via npm, use npm run autopipeline -- -- run-until-barrier --dry-run
                      or npm run autopipeline:run-until-barrier:dry)
  --exitCode N        For complete (default 0)
  --stdoutFile PATH   For complete: read agent stdout log
  --deltaOutFile PATH For complete: delta text for Done + next beat Delta In
  --no-handoff        For complete: skip next-beat promotion
  --max-runs N        For run-until-barrier: safety cap (default 25)

Barrier env (human-review row): AUTOPIPELINE_STOP_SORT_ORDER (default 11), AUTOPIPELINE_STOP_TASK_KEY (default T-011)
`);
}

function sha12(s) {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 12);
}

/** Drop undefined/null so optional future fields do not break PATCH/POST. */
function compactFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

function field(formulaName) {
  return `{${formulaName}}`;
}

async function airtableFetch(path, init = {}) {
  const url = `https://api.airtable.com/v0/${BASE_ID}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Airtable non-JSON (${res.status}): ${text.slice(0, 400)}`);
  }
  if (!res.ok) {
    const msg = json.error?.message || text.slice(0, 400);
    let hint = "";
    if (res.status === 403 || res.status === 404) {
      hint =
        `\n\n→ Fix: In Airtable → **Developer hub** → **Personal access tokens** → open this PAT → **Add base** and select **Relay Patreon Milestones** (or whatever base holds the queue/Sessions).` +
        `\n   Enable scopes **data.records:read** and **data.records:write** for that base.` +
        `\n   If you duplicated the base, set **AIRTABLE_AUTOPIPELINE_BASE_ID** in \`.env\` to that base id (starts with **app**).` +
        `\n   Default base id in this script: **${BASE_ID}**.`;
    }
    throw new Error(`Airtable ${res.status}: ${msg}${hint}`);
  }
  return json;
}

async function listTasksReady() {
  const filter = encodeURIComponent(
    `${field(F.status)}="Ready"`
  );
  const sortField = encodeURIComponent(F.sortOrder);
  const path = `/${TABLE_TASKS}?filterByFormula=${filter}&sort[0][field]=${sortField}&sort[0][direction]=asc&pageSize=100`;
  const data = await airtableFetch(path);
  return data.records || [];
}

function isEligibleTask(fields) {
  if (fields[F.status] !== "Ready") return false;
  if (fields[F.offScript] === true) return false;
  if (fields[F.automationAllowed] === false) return false;
  return true;
}

function pickWinner(records) {
  const eligible = records.filter((r) => isEligibleTask(r.fields || {}));
  if (eligible.length === 0) return null;
  eligible.sort(
    (a, b) =>
      (Number(a.fields[F.sortOrder]) || 999) -
      (Number(b.fields[F.sortOrder]) || 999)
  );
  return eligible[0];
}

/** Stop `run-until-barrier` before this Sort Order / Task Key (human-flagged row). */
const BARRIER_SORT_ORDER = Number(
  process.env.AUTOPIPELINE_STOP_SORT_ORDER !== undefined
    ? process.env.AUTOPIPELINE_STOP_SORT_ORDER
    : "11"
);
const BARRIER_TASK_KEY =
  process.env.AUTOPIPELINE_STOP_TASK_KEY !== undefined
    ? process.env.AUTOPIPELINE_STOP_TASK_KEY
    : "T-011";

function canAutomateBeforeBarrier(fields) {
  if (!isEligibleTask(fields)) return false;
  const key = String(fields[F.taskKey] || "");
  const so = Number(fields[F.sortOrder]);
  if (BARRIER_TASK_KEY && key === BARRIER_TASK_KEY) return false;
  if (Number.isFinite(so) && so >= BARRIER_SORT_ORDER) return false;
  return true;
}

function pickWinnerBeforeBarrier(records) {
  const eligible = records.filter((r) =>
    canAutomateBeforeBarrier(r.fields || {})
  );
  if (eligible.length === 0) return null;
  eligible.sort(
    (a, b) =>
      (Number(a.fields[F.sortOrder]) || 999) -
      (Number(b.fields[F.sortOrder]) || 999)
  );
  return eligible[0];
}

/**
 * Parse Cursor agent `--output-format json` line: use `result` as delta when present.
 */
function extractDeltaFromAgentStdout(stdout) {
  const t = stdout.trim();
  if (!t) return "";
  try {
    const j = JSON.parse(t);
    if (j && typeof j.result === "string" && j.result.trim()) {
      return j.result.trim();
    }
  } catch {
    /* fall through */
  }
  return t.slice(0, 95000);
}

async function getTaskByKey(taskKey) {
  const safe = taskKey.replace(/"/g, '\\"');
  const filter = encodeURIComponent(`${field(F.taskKey)}="${safe}"`);
  const path = `/${TABLE_TASKS}?filterByFormula=${filter}&maxRecords=1`;
  const data = await airtableFetch(path);
  const rec = data.records?.[0];
  if (!rec) throw new Error(`No task with Task Key ${taskKey}`);
  return rec;
}

async function getSystemState() {
  const data = await airtableFetch(`/${TABLE_SYSTEM}?maxRecords=10`);
  return data.records?.[0] || null;
}

async function patchRecords(tableId, records) {
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    await airtableFetch(`/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify({ records: chunk })
    });
  }
}

async function createRun(fields) {
  const data = await airtableFetch(`/${TABLE_RUNS}`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: compactFields(fields) }] })
  });
  return data.records?.[0];
}

async function cmdStatus() {
  let sys = null;
  let ready = [];
  try {
    ready = await listTasksReady();
  } catch (e) {
    throw e;
  }
  try {
    sys = await getSystemState();
  } catch (e) {
    console.warn("[System State] skipped:", (e && e.message) || e);
  }

  const winner = pickWinner(ready);

  console.log("Base:", BASE_ID, "Tasks:", TABLE_TASKS);
  if (sys) {
    const f = sys.fields || {};
    console.log("\n[System State]", sys.id);
    console.log(
      "  Automation Master Enabled:",
      f[F.systemAutomationMaster] !== false
    );
    if (f[F.systemCurrentTask]?.length)
      console.log("  Current Task ids:", f[F.systemCurrentTask]);
  } else {
    console.log("\n[System State] (no rows)");
  }

  console.log(`\n[Ready rows] ${ready.length} total`);
  for (const r of ready) {
    const k = r.fields[F.taskKey] || "?";
    const so = r.fields[F.sortOrder];
    const el = isEligibleTask(r.fields)
      ? "eligible"
      : "skip (off-script or automation off)";
    const mark = winner?.id === r.id ? " <-- winner" : "";
    console.log(`  ${k}  sort=${so}  ${el}${mark}`);
  }
  if (!winner) {
    console.log("\nNo eligible winner (no Ready, or all skipped).");
  } else {
    console.log("\nWinner:", winner.fields[F.taskKey], winner.id);
  }
}

async function cmdSyncIn(taskKeyArg) {
  let rec;
  if (taskKeyArg) {
    rec = await getTaskByKey(taskKeyArg);
  } else {
    const ready = await listTasksReady();
    const winner = pickWinner(ready);
    if (!winner) {
      console.error("No eligible Ready task; pass --taskKey T-00N");
      process.exit(1);
    }
    rec = winner;
  }
  await syncInForRecord(rec);
}

async function cmdEnforceReady(dryRun) {
  const ready = await listTasksReady();
  const winner = pickWinner(ready);
  if (!winner) {
    console.log("No eligible winner; nothing to enforce.");
    return;
  }
  /** Strict single-Ready: every other Ready row → Pending (human can re-Ready). */
  const others = ready.filter((r) => r.id !== winner.id);
  if (others.length === 0) {
    console.log("Single Ready row already; no changes.");
    return;
  }
  console.log(
    dryRun ? "[dry-run]" : "",
    `Keeping winner ${winner.fields[F.taskKey]}; demoting ${others.length} row(s) to Pending`
  );
  if (dryRun) {
    for (const r of others) {
      console.log("  would demote:", r.fields[F.taskKey], r.id);
    }
    return;
  }
  const updates = others.map((r) => ({
    id: r.id,
    fields: { [F.status]: "Pending" }
  }));
  await patchRecords(TABLE_TASKS, updates);
  console.log("Done.");
}

async function doComplete({
  taskKey,
  exitCode,
  outputSummary,
  deltaOutText,
  noHandoff
}) {
  const task = await getTaskByKey(taskKey);
  const tf = task.fields;
  const promptPath = tf[F.promptPath] || "";
  let promptSnap = promptPath;
  if (promptPath) {
    const abs = join(ROOT, promptPath.replace(/\//g, "\\"));
    try {
      const st = await readFile(abs, "utf8");
      promptSnap = `${promptPath} sha256:${sha12(st)}`;
    } catch {
      promptSnap = `${promptPath} (file not read)`;
    }
  }

  let summary = outputSummary || "";
  if (summary.length > 48000) {
    summary = summary.slice(0, 40000) + "\n…[truncated]…\n";
  }

  const started = new Date();
  const label = `run-${taskKey}-${started.toISOString().replace(/[:.]/g, "-")}`;
  const success = exitCode === 0;
  const outcome = success ? "success" : "error";

  const runFields = compactFields({
    [F.runLabel]: label,
    [F.runTask]: [task.id],
    [F.runStartedAt]: started.toISOString(),
    [F.runFinishedAt]: new Date().toISOString(),
    [F.runCliExitCode]: exitCode,
    [F.runPromptSnapshot]: promptSnap.slice(0, 49000),
    [F.runOutputSummary]: summary || "(no output)",
    [F.runOutcome]: outcome
  });

  const runRec = await createRun(runFields);
  console.log("Runs record:", runRec?.id);

  const retry = Number(tf[F.retryCount] || 0);
  const maxR = Number(tf[F.maxRetries] ?? 2);

  if (success) {
    const nextPatch = {
      id: task.id,
      fields: {
        [F.status]: "Done",
        [F.deltaOut]: deltaOutText || tf[F.deltaOut] || ""
      }
    };
    await patchRecords(TABLE_TASKS, [nextPatch]);

    if (!noHandoff && deltaOutText) {
      const nextIds = tf[F.nextTask] || [];
      if (nextIds.length > 0) {
        const nextId = nextIds[0];
        const nextRec = await airtableFetch(`/${TABLE_TASKS}/${nextId}`);
        const nf = nextRec.fields || {};
        await patchRecords(TABLE_TASKS, [
          {
            id: nextId,
            fields: {
              [F.deltaIn]: deltaOutText,
              [F.status]: "Ready"
            }
          }
        ]);
        const nextKey = nf[F.taskKey] || "T-???";
        await mkdir(INCOMING_DIR, { recursive: true });
        const incPath = join(INCOMING_DIR, `${nextKey}-delta-in.md`);
        await writeFile(incPath, deltaOutText, "utf8");
        console.log("Handoff →", nextKey, incPath);
      } else {
        console.log("No Next Task link; skipped handoff file/Airtable next row.");
      }
    }
  } else {
    const newRetry = retry + 1;
    const status = newRetry >= maxR ? "Blocked" : "Failed";
    await patchRecords(TABLE_TASKS, [
      {
        id: task.id,
        fields: {
          [F.retryCount]: newRetry,
          [F.status]: status
        }
      }
    ]);
    console.log("Task updated:", status, "Retry Count:", newRetry);
  }
}

async function cmdComplete(argv) {
  const taskKey = argv.get("--taskKey");
  if (!taskKey) {
    console.error("complete requires --taskKey");
    process.exit(1);
  }
  const exitCode = Number(argv.get("--exitCode") ?? "0");
  const stdoutFile = argv.get("--stdoutFile");
  const deltaOutFile = argv.get("--deltaOutFile");
  const noHandoff = argv.has("--no-handoff");

  let outputSummary = "";
  if (stdoutFile) {
    try {
      outputSummary = await readFile(stdoutFile, "utf8");
    } catch (e) {
      outputSummary = `(could not read stdout file: ${e.message})`;
    }
  }

  let deltaOutText = "";
  if (deltaOutFile) {
    try {
      deltaOutText = await readFile(deltaOutFile, "utf8");
    } catch (e) {
      console.error("deltaOutFile:", e.message);
      process.exit(1);
    }
  }

  await doComplete({
    taskKey,
    exitCode,
    outputSummary,
    deltaOutText,
    noHandoff
  });
}

function runPowershellAgent(taskKey) {
  return new Promise((resolve, reject) => {
    const ps1 = join(ROOT, "scripts", "run-airtable-autopipeline-task.ps1");
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ps1,
        "-TaskKey",
        taskKey,
        "-RepoRoot",
        ROOT
      ],
      { cwd: ROOT, env: process.env }
    );
    const out = [];
    const err = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code === null ? 1 : code,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8")
      });
    });
  });
}

async function syncInForRecord(rec) {
  const key = rec.fields[F.taskKey];
  const delta = (rec.fields[F.deltaIn] || "").trim();
  await mkdir(INCOMING_DIR, { recursive: true });
  const outPath = join(INCOMING_DIR, `${key}-delta-in.md`);
  const body =
    delta || "(empty — no Delta In in Airtable; optional for this run)\n";
  await writeFile(outPath, body, "utf8");
  console.log(`Wrote ${outPath} (${body.length} chars)`);
}

async function cmdRunUntilBarrier(argv) {
  const dryRun = argv.has("--dry-run");
  const maxRuns = Math.min(
    100,
    Math.max(1, Number(argv.get("--max-runs") || "25"))
  );

  const sys = await getSystemState();
  if (sys?.fields && sys.fields[F.systemAutomationMaster] === false) {
    console.error("Automation Master Enabled is off; abort.");
    process.exit(1);
  }

  console.log(
    `run-until-barrier: stop at Sort Order >= ${BARRIER_SORT_ORDER} or Task Key === ${BARRIER_TASK_KEY || "(none)"} (override via AUTOPIPELINE_STOP_* env)`
  );

  for (let i = 0; i < maxRuns; i++) {
    const ready = await listTasksReady();
    const winner = pickWinnerBeforeBarrier(ready);
    if (!winner) {
      console.log(
        "\nStopped: no eligible **Ready** beat before barrier (promote the next row to Ready in Airtable, or all work before the barrier is done)."
      );
      return;
    }

    const taskKey = winner.fields[F.taskKey];
    const sort = winner.fields[F.sortOrder];
    console.log(`\n--- Iteration ${i + 1}/${maxRuns}: ${taskKey} (sort=${sort}) ---`);

    if (dryRun) {
      console.log("[dry-run] would: sync-in → agent → complete");
      return;
    }

    await syncInForRecord(winner);

    console.log("Starting agent (PowerShell)…");
    const { exitCode, stdout, stderr } = await runPowershellAgent(taskKey);
    if (stderr.trim()) {
      console.warn("agent stderr:", stderr.slice(0, 2000));
    }

    const tmpDir = await mkdtemp(join(tmpdir(), "relay-ap-"));
    const stdoutPath = join(tmpDir, "agent-out.txt");
    await writeFile(stdoutPath, stdout, "utf8");
    console.log("agent exit code:", exitCode, "log:", stdoutPath);

    const deltaText = extractDeltaFromAgentStdout(stdout);

    await doComplete({
      taskKey,
      exitCode,
      outputSummary: stdout,
      deltaOutText: deltaText,
      noHandoff: false
    });

    if (exitCode !== 0) {
      console.error("\nAgent failed; stopping chain.");
      process.exit(exitCode);
    }
  }

  console.warn(`Stopped: reached --max-runs ${maxRuns}.`);
  process.exit(1);
}

async function cmdPrepare() {
  const sys = await getSystemState();
  if (sys?.fields && sys.fields[F.systemAutomationMaster] === false) {
    console.error("Automation Master Enabled is off; abort.");
    process.exit(1);
  }
  await cmdSyncIn(null);
  const winner = pickWinner(await listTasksReady());
  const key = winner?.fields[F.taskKey] || "T-???";
  console.log(`
Next: run agent (PowerShell), e.g.:
  cd "${ROOT.replace(/\\/g, "\\\\")}"
  .\\\\scripts\\\\run-airtable-autopipeline-task.ps1 -TaskKey "${key}" -RepoRoot "${ROOT.replace(/\\/g, "\\\\")}"

Then record the run:
  node scripts/autopipeline-runner.mjs complete --taskKey ${key} --exitCode %ERRORLEVEL% --stdoutFile agent-out.json --deltaOutFile path\\\\to\\\\delta.md
`);
}

function parseArgv(argv) {
  const map = new Map();
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a;
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        map.set(k, next);
        i++;
      } else {
        map.set(k, true);
      }
    } else {
      rest.push(a);
    }
  }
  return { cmd: rest[0] || "help", rest: rest.slice(1), opts: map };
}

async function main() {
  const raw = process.argv.slice(2);
  const { cmd, opts } = parseArgv(raw);
  const argv = opts;

  if (cmd === "run-until-t011") {
    console.warn(
      "[deprecated] `run-until-t011` — use `run-until-barrier` (same behavior; see Story Blocks/docs/AIRTABLE_WRITING_PIPELINE.md)"
    );
  }

  if (
    !TOKEN &&
    cmd !== "help" &&
    cmd !== "--help" &&
    cmd !== "-h"
  ) {
    console.error(
      "No Airtable PAT found. Add a line to repo root `.env` or `.env.local`:\n" +
        "  AIRTABLE_AUTOPIPELINE_TOKEN=pat_...\n" +
        "(no spaces around `=`, one line, unquoted; token from Airtable → Developer hub → Personal access tokens.)\n" +
        "If the var is already there, check for a typo, leading `#`, or a blank value."
    );
    process.exit(1);
  }

  switch (cmd) {
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    case "status":
      await cmdStatus();
      break;
    case "sync-in":
      await cmdSyncIn(argv.get("--taskKey") || null);
      break;
    case "enforce-ready":
      await cmdEnforceReady(!!argv.get("--dry-run"));
      break;
    case "complete":
      await cmdComplete(argv);
      break;
    case "prepare":
      await cmdPrepare();
      break;
    case "run-until-barrier":
    case "run-until-t011":
      await cmdRunUntilBarrier(argv);
      break;
    default:
      usage();
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
