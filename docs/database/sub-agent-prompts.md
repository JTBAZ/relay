# Sub-agent prompts — DB Integration Pipeline

Use with the **Relay Database Tracker** Airtable base → **DB Integration Pipeline** table (one row per step in [`integration-roadmap.md`](integration-roadmap.md)). This is **not** the **Project tracker** Production Ledger.

**Run prompts (19 files):** each run is a standalone markdown file under [`runs/`](runs/README.md) with **orientation**, the **full Universal preamble**, the **task body**, **links** (GitHub), and a **Handoff** section pointing to the next run.

---

## How to run a batch

1. In Airtable, filter **`Pipeline status` = Queued** (and confirm **`Depends on`** is satisfied for those rows—usually all prior rows are Complete).
2. Open the run doc for the next **Sort order** block (see [`runs/README.md`](runs/README.md) or use **`Doc reference`** / **`Next run prompt`** on the pipeline row).
3. Set those rows’ **`Pipeline status`** → **In progress** (and **Assignee** if you use it).
4. Paste the **Full prompt (paste into agent)** section from that run file into the sub-agent chat (it already includes the Universal preamble).
5. When verified, **always** set **`Pipeline status`** → **Complete** for **every Step ID** in that run (do not leave finished work Queued or In progress); append a short summary to **Notes**.

**Airtable fields:** **`Doc reference`** → GitHub link for **this** run’s prompt (`run-NN.md`). **`Next run prompt`** → GitHub link for the **following** run (empty on final M10 steps). After a run completes, the next agent opens **`Next run prompt`** (or the Handoff in the run doc).

**Parallel runs:** Only dispatch two agents on the same milestone if **`Parallel with`** in Airtable allows it (e.g. M2 vs M3 after M1). When in doubt, run **one agent at a time** in **Sort order**.

---

## Universal preamble (duplicated in every `runs/run-NN.md`)

Keep this in sync with the **`## Full prompt (paste into agent)`** block in each run file.

```text
You are a coding agent working on the Rescue / Relay repo.

Repository: follow AGENTS.md for layout (backend src/, web/, docs/database/ for Postgres+Prisma plan).

Queue: Relay Database Tracker → DB Integration Pipeline only. Do not search or update Project tracker Production Ledger for roadmap step IDs (1.x, 2.x, 3.x, …) from integration-roadmap.md — those steps are tracked in DB Integration Pipeline, not Production Ledger.

Rules:
- Minimal, focused diffs; do not refactor unrelated code.
- No secrets in commits, Airtable, or logs. Use .env.example placeholders only.
- If OAuth, production Patreon, or missing credentials block verification, stop and report per .docs/anthropic/FAIL_TO_HUMAN.md — do not loop.

After implementation:
- Run the verification commands listed in the task.
- Summarize files changed and any manual follow-up for the human.

Airtable: update Relay Database Tracker → DB Integration Pipeline rows for this task’s Step IDs: **In progress** while working; when the run is verified, **always** set **Pipeline status** → **Complete** for each Step ID in that run and append a short completion summary to **Notes** (this table has no separate Integrator Notes field).
```

---

## Run index

| Run | Doc |
|-----|-----|
| 01 | [run-01.md](runs/run-01.md) |
| 02 | [run-02.md](runs/run-02.md) |
| 03 | [run-03.md](runs/run-03.md) |
| 04 | [run-04.md](runs/run-04.md) |
| 05 | [run-05.md](runs/run-05.md) |
| 06 | [run-06.md](runs/run-06.md) |
| 07 | [run-07.md](runs/run-07.md) |
| 08 | [run-08.md](runs/run-08.md) |
| 09 | [run-09.md](runs/run-09.md) |
| 10 | [run-10.md](runs/run-10.md) |
| 11 | [run-11.md](runs/run-11.md) |
| 12 | [run-12.md](runs/run-12.md) |
| 13 | [run-13.md](runs/run-13.md) |
| 14 | [run-14.md](runs/run-14.md) |
| 15 | [run-15.md](runs/run-15.md) |
| 16 | [run-16.md](runs/run-16.md) |
| 17 | [run-17.md](runs/run-17.md) |
| 18 | [run-18.md](runs/run-18.md) |
| 19 | [run-19.md](runs/run-19.md) |

**Regenerate run files** (after editing [`runs/_generate_runs.py`](runs/_generate_runs.py)): `python docs/database/runs/_generate_runs.py`

**Bulk-update Airtable URLs** (requires `AIRTABLE_PAT` or `AIRTABLE_API_KEY` in the environment, or `AIRTABLE_PAT` in repo root `.env`): `python docs/database/runs/apply-airtable-doc-links.py` (uses [`runs/_airtable_update_batches.json`](runs/_airtable_update_batches.json)).

---

## Parallel dispatch matrix (reminder)

| After … completes | Can start in parallel (if staffed) |
|-------------------|--------------------------------------|
| M1 | M2 Identity **and** M3 Canonical (separate agents — avoid same-file conflicts in server.ts: coordinate) |
| M2 + M3 | M4, M5, M6, M7, M8, M9 (M9 stubs last priority for conflicts) |
| M4–M9 | M10 only when dependencies for each domain are Complete |

When **two agents** touch `src/server.ts`, use a **single integration agent** or merge order agreed in chat.

---

## Step ID quick index (Sort order)

| IDs | Run |
|-----|-----|
| 1.1.1–1.1.4 | 01 |
| 1.2.1–1.2.5 | 02 |
| 1.3.1–1.3.3 | 03 |
| 1.4.1–1.4.3 | 04 |
| 2.1.1–2.3.5 | 05–07 |
| 3.1.1–3.3.5 | 08–10 |
| 4.1.1–4.3.4 | 11–13 |
| 5.1.1–5.2.4 | 14 |
| 6.1.1–6.2.4 | 15 |
| 7.1.1–7.2.3 | 16 |
| 8.1.1–8.2.5 | 17 |
| 9.1.1–9.4.3 | 18 |
| 10.1.1–10.3.3 | 19 |
