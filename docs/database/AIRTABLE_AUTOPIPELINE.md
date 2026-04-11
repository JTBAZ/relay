# Airtable Auto-Pipeline — Agent queue, delta handoffs, Cursor CLI

This document is the **single reference** for designing an Airtable base that drives **sequential coding work** with:

- **Pregenerated or templated prompts** per task (`prompt.md` in-repo is supported).
- **Delta-only** context between runs (what the next agent must know—no duplicate wiki).
- **Cursor CLI** (`agent --print`) as the **invocation** mechanism on a trusted machine.
- **Graceful stop** when something is off-script, auth is needed, or retries are exhausted.

It is **not** the [Relay Database Tracker / DB Integration Pipeline](./AIRTABLE_DB_PIPELINE.md) (Postgres/Prisma roadmap steps). It is **not** the [Project tracker Production Ledger](../../Automation/docs/LEDGER_SCHEMA.md) (UI/v0 product queue). **Do not** mix those row types into this base without explicit links.

---

## Architecture (one sentence)

**Airtable** holds the queue, run history, and automation flags; **repo files** hold canonical prompts and optional delta drops; a **local script** (or CI) reads Airtable + files and runs **`agent`**; **Airtable Automations** react to status changes (notify, flip flags, optional webhook)—they **do not** run Cursor on Airtable’s servers.

---

## Base layout (minimum viable)

Use **two** tables at minimum. A third is optional but recommended for ops.

| Table | Role |
|-------|------|
| **Tasks** | Ordered queue: what to run, current status, prompt pointers, delta in/out, retry limits. |
| **Runs** | Append-only log: each Cursor CLI invocation (inputs, exit code, summary). |
| **System State** (optional, 1 row) | Kill switch + “current task” pointer for humans and scripts. |

---

## Table: **Tasks**

One row = **one unit of work** the CLI can execute in a single `agent --print` invocation (keep tasks small enough to verify).

**Exact field names** (adjust types to match your Airtable; names must stay stable for API/scripts).

| Field | Type | Purpose |
|-------|------|---------|
| **Task Key** | Formula or Single line | Stable id, e.g. `T-001` or slug from title—used in filenames. |
| **Title** | Single line | Short label. |
| **Sort Order** | Number | Execution order (lower first). |
| **Status** | Single select | **`Pending`** → **`Ready`** → **`Running`** → **`Done`** \| **`Failed`** \| **`Blocked`** \| **`Stopped_OffScript`**. |
| **Prompt Path** | Single line | Repo-relative path to the main prompt file, e.g. `docs/Airtable Drops/prompts/T-001-prompt.md`. |
| **Prompt Body** | Long text (optional) | If you do **not** use files, store the full prompt here; script prefers **Prompt Path** when the file exists. |
| **Delta In** | Long text | **Input** to this run: delta from the **previous** task only (filled by prior run or automation). |
| **Delta Out** | Long text | **Output** for the **next** task: written at end of run; must be **delta-only** (see contract below). |
| **Next Task** | Link to Tasks (optional) | Explicit next row; if empty, script can pick **next Sort Order** with **Pending/Ready**. |
| **Retry Count** | Number | Increment on failed CLI runs; default `0`. |
| **Max Retries** | Number | Cap (e.g. `2`–`3`); when exceeded → set **Blocked**. |
| **Off Script** | Checkbox | Human or agent sets when work **must not** continue automatically (login, wrong scope, policy). |
| **Off Script Reason** | Long text | Required when **Off Script** is checked or status is **Stopped_OffScript**. |
| **Automation Allowed** | Checkbox | If unchecked, **no** local runner may start this row (human-only). Default **checked** for automated rows. |
| **Last Run** | Link to Runs (optional) | Latest run record for quick audit. |
| **Notes** | Long text | Freeform; evidence, PR links, commands. |

### Status semantics

| Status | Meaning |
|--------|---------|
| **Pending** | Not started; dependencies (if any) should be satisfied before promotion. |
| **Ready** | Eligible for the next `agent` invocation (promote from Pending when deps OK). |
| **Running** | Reserved while CLI is executing (set immediately before `agent`, cleared or terminal after). |
| **Done** | Verified complete for this task’s definition of done. |
| **Failed** | CLI or verification failed; **Retry Count** may increase; may become **Blocked**. |
| **Blocked** | Hard stop (retries exhausted, env, external dependency). |
| **Stopped_OffScript** | **Graceful automation stop**: not necessarily failure—workflow exited intentionally (off-script, human required). |

---

## Table: **Runs**

One row = **one** `agent` execution attempt.

| Field | Type | Purpose |
|-------|------|---------|
| **Task** | Link → Tasks | Which task. |
| **Started At** | Date/time | |
| **Finished At** | Date/time | |
| **CLI Exit Code** | Number | Process exit code from `agent` (0 = process success; still verify output). |
| **Prompt Snapshot** | Long text | What was sent (path + hash or inlined beginning)—for audit. |
| **Output Summary** | Long text | Parsed stdout tail or agent final summary. |
| **Outcome** | Single select | **`success`** \| **`error`** \| **`aborted_offscript`**. |
| **Aborted Reason** | Long text | If **`aborted_offscript`**, why. |

**Rule:** The **end of each run** must (1) write **Tasks.Delta Out** for the next row when successful, (2) set **Next** task to **Ready** when appropriate, or (3) set **Stopped_OffScript** / **Off Script** when not appropriate to continue.

---

## Table: **System State** (optional, single row)

| Field | Type | Purpose |
|-------|------|---------|
| **Automation Master Enabled** | Checkbox | Global kill switch for **local** runners. Off = no CLI starts. |
| **Current Task** | Link → Tasks | Optional pointer for dashboards. |
| **Last Error** | Long text | Last failure message for humans. |

---

## Delta-only contract (mandatory)

**Delta Out** (and file drops under `docs/Airtable Drops/`) must **not** restate the whole architecture. Use this structure:

1. **Delta** — What changed in *this* run the next agent must know (files, decisions, constraints).
2. **Risks / blockers** — One to three bullets if any.
3. **Next step hint** — Single sentence pointing at **Prompt Path** / **Sort Order**, not a full re-spec.

Canonical repo docs (**AGENTS.md**, **BUILD_BRIEF**, specs) remain source of truth; deltas **add**, they don’t replace.

---

## Pregenerated `prompt.md` per task (recommended)

For each **Task Key**, maintain a file such as:

`docs/Airtable Drops/prompts/<TaskKey>-prompt.md`

Contents:

- **Goal** (one paragraph).
- **Scope / non-goals**.
- **Validation** (commands or checks).
- **Handoff**: “After success, write **Delta Out** and follow **Runs** logging in `AIRTABLE_AUTOPIPELINE.md`.”

The **local script** passes **Prompt Path** file + **Delta In** concatenated (or injected as a section) to `agent`.

---

## Off-script and graceful stop

**Automation must stop** (no next **Ready**) when any of the following hold:

- **Tasks.Off Script** = true, or **Status** = **Stopped_OffScript** or **Blocked**.
- **System State.Automation Master Enabled** = false.
- **Retry Count** ≥ **Max Retries** after a failed run.
- CLI **exit code** non-zero and policy says do not retry (script sets **Failed** / **Blocked** per your rules).

**Airtable Automations** should:

- On **Stopped_OffScript** or **Blocked** → send **email/Slack** with **Title**, **Off Script Reason**, link to row.
- **Not** fire “start next task” webhooks if the above applies.

Detecting “off-script” inside the agent is **prompt + rules**; persisting it is **setting Off Script** or **Status** from the agent before exit or via script parsing `--output-format json` when supported.

---

## Airtable Automations (cloud) — what they can and cannot do

| Can | Cannot |
|-----|--------|
| Email/Slack on status change | Run Cursor or write to `localhost` |
| POST to a **public** webhook (n8n tunnel, etc.) | Invoke `agent` on your PC without a **local** runner |
| Update fields (e.g. **Ready** next task) with care | Replace the **Cursor CLI** on your machine |

**Recommended pattern:** Automations **signal** (notify, optional webhook); **local script** on the dev machine is the only component that calls **`agent`**.

---

## Local runner: PowerShell script (Cursor CLI)

**Canonical script (checked in):** [`scripts/run-airtable-autopipeline-task.ps1`](../../scripts/run-airtable-autopipeline-task.ps1)

It loads:

- `docs/Airtable Drops/prompts/<TaskKey>-prompt.md` — main prompt.
- `docs/Airtable Drops/incoming/<TaskKey>-delta-in.md` — optional delta from the previous task (create or sync from Airtable **Delta In**).

Then it invokes (model pinned by default for repeatable runs):

`agent --model composer-2 --print --trust --workspace <repo> --output-format json -- <bundled prompt>`

Override with `-Model` on the script (e.g. `-Model "composer-2-fast"`). Cursor’s interactive CLI may show **Auto** / default routing in the UI; without `--model`, the headless `agent` default can vary by CLI version—**pinning `composer-2` (Composer 2)** avoids that ambiguity for automation.

**Prerequisites**

- `agent` on PATH, or `cursor-agent\agent.ps1` under `%LOCALAPPDATA%` (install: `irm 'https://cursor.com/install?win32=true' | iex`).
- `agent login` once, or `CURSOR_API_KEY` for non-interactive use.
- Repo checkout path as **workspace**.

**Invocation**

```powershell
cd "C:\Users\jorda\Documents\Coding Projects\Rescue"
.\scripts\run-airtable-autopipeline-task.ps1 -TaskKey "T-001"
```

**Dry run** (print bundle only, no `agent`):

```powershell
.\scripts\run-airtable-autopipeline-task.ps1 -TaskKey "T-001" -SkipAgent
```

**Extend:** PATCH Airtable **Runs** + **Tasks** from exit code and captured JSON in a wrapper, or call this script from n8n/Scheduler after syncing delta files from the API.

### Node runner (scaffold)

**Checked in:** [`scripts/autopipeline-runner.mjs`](../../scripts/autopipeline-runner.mjs)

Requires an Airtable PAT in repo root **`.env`** or **`.env.local`** (`.env.local` overrides). The runner uses the first set value, preferring **`AIRTABLE_AUTOPIPELINE_TOKEN`** / **`AIRTABLE_AUTOPIPELINE_PAT`**, then **`AIRTABLE_PAT`**, **`AIRTABLE_TOKEN`**, **`AIRTABLE_ACCESS_TOKEN`**, **`AIRTABLE_API_KEY`**. Defaults to base **Relay Patreon Milestones** (`appiJUmsc0vRwNn9j`) and the **Tasks** / **Runs** / **System State** table ids from the autopipeline layout; override with `AIRTABLE_AUTOPIPELINE_BASE_ID` / `_TASKS_TABLE` / `_RUNS_TABLE` / `_SYSTEM_STATE_TABLE` if you fork the base.

| Command | Purpose |
|--------|---------|
| `status` | Print **System State** and **Ready** rows; marks **winner** (lowest **Sort Order** among Ready + **Automation Allowed** + not **Off Script**). |
| `sync-in` | Write **Tasks.Delta In** → `docs/Airtable Drops/incoming/<TaskKey>-delta-in.md` (default: winner; or `--taskKey T-00N`). |
| `enforce-ready` | Set every other **Ready** row to **Pending** (keeps one winner). Use `--dry-run` first. |
| `complete` | Append **Runs**, set task **Done**/**Failed**/**Blocked**, optional handoff **Delta Out** → next **Next Task** (`--taskKey`, `--exitCode`, `--stdoutFile`, `--deltaOutFile`, `--no-handoff`). |
| `prepare` | **sync-in** for winner + print suggested `run-airtable-autopipeline-task.ps1` line. |
| `run-until-t011` | **Loop** (Windows): lowest **Ready** task with **Sort Order** &lt; **11** and **Task Key** ≠ **T-011** → `sync-in` → `run-airtable-autopipeline-task.ps1` → **`complete`** (delta from JSON `result`) until no such task remains or **`agent`** exits non‑zero. Stops before the **T-011** flagged row. **`--dry-run`** / **`--max-runs N`**. Override barrier: **`AUTOPIPELINE_STOP_SORT_ORDER`**, **`AUTOPIPELINE_STOP_TASK_KEY`**. |

```bash
npm run autopipeline -- status
npm run autopipeline -- sync-in --taskKey T-007
npm run autopipeline -- complete --taskKey T-006 --exitCode 0 --stdoutFile ./agent-out.txt --deltaOutFile ./delta.md
npm run autopipeline -- run-until-t011 --dry-run
npm run autopipeline -- run-until-t011
```

**`prepare` / `sync-in` / `complete`** do not invoke `agent` themselves. **`run-until-t011`** does (PowerShell + Cursor CLI) — only on a **trusted** machine; requires `agent` / `powershell.exe` on PATH.

**403 from Airtable:** The PAT is valid but cannot read the base. In **Developer hub** → **Personal access tokens** → your token → **Add base** → select **Relay Patreon Milestones** (id `appiJUmsc0vRwNn9j` unless you duplicated it). Enable **data.records:read** and **data.records:write**. A brand-new PAT has no bases until you add them.

**Flags (from `agent --help`)** that matter for automation:

- `--print` — non-interactive, scriptable.
- `--trust` — non-interactive workspace trust (required for unattended use).
- `--workspace <repo>` — pin repo root.
- `--output-format json` — machine-parse when you add logging.
- `--model <name>` — pin model for repeatability (script default: **`composer-2`** = Composer 2).

---

## Chaining “next” run

1. On **success**, script or human sets current task **Done**, copies **Delta Out** to next task’s **Delta In** (and optional `incoming/<NextKey>-delta-in.md`), sets next **Status** = **Ready**.
2. Invoke the script again with **Next** Task Key—or schedule a poller that picks **Ready** with lowest **Sort Order** while **Automation Master Enabled** is true.
3. On **Stopped_OffScript** / **Blocked**, **do not** advance **Ready**.

---

## Related docs

- [AIRTABLE_DB_PIPELINE.md](./AIRTABLE_DB_PIPELINE.md) — **database integration** roadmap runs (`run-NN.md`, DB Integration Pipeline base). Different purpose; do not merge tables.
- [Automation/docs/LEDGER_SCHEMA.md](../../Automation/docs/LEDGER_SCHEMA.md) — Production Ledger (product/UI work).
- [integration-roadmap.md](./integration-roadmap.md) — Postgres/Prisma work sequencing (engineering content, not this automation base).

---

## Checklist for future agents implementing the base

- [ ] **Tasks** has **Sort Order**, **Status**, **Prompt Path**, **Delta In** / **Delta Out**, retries, **Off Script**, **Automation Allowed**.
- [ ] **Runs** logs every CLI invocation with **CLI Exit Code** and **Outcome**.
- [ ] **System State** exists with **Automation Master Enabled**.
- [ ] Prompts live under **`docs/Airtable Drops/prompts/`** (or documented alternate).
- [ ] Local **PowerShell** (or CI) is the **only** layer that invokes **`agent`**.
- [ ] Airtable Automations **notify** and **gate**; they do not assume cloud execution of Cursor.
