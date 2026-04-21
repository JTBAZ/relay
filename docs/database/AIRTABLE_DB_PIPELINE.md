# Relay Database Tracker — DB Integration Pipeline (canonical schema)

This document is the **single reference** for how the **Relay Database Tracker** Airtable base is laid out for Postgres/Prisma integration work, and how **runs** batch many roadmap steps into one agent session without losing per-step status in Airtable.

It complements [`integration-roadmap.md`](integration-roadmap.md) (what to build) and [`runs/README.md`](runs/README.md) (the 19 run prompts).

---

## What this is not

| System | Role |
|--------|------|
| **Relay Database Tracker** → **DB Integration Pipeline** | Tracks **database integration** steps (`1.1.1`, `2.3.4`, …) from the roadmap. |
| **Project tracker** → **Production Ledger** | Tracks **product/UI/ledger** work (v0, Relay features). **Do not** mix roadmap step IDs into Production Ledger or vice versa. |
| **Batting Order** workspace → **PE Batting Order** table | Tracks **Patron Experience** schedule ([`Patron_Experience_Batting_Order.md`](../Patron_Experience_Batting_Order.md)); same **row-per-step + Run batching** idea as this pipeline — see [`BATTING_ORDER_AIRTABLE.md`](BATTING_ORDER_AIRTABLE.md). **Do not** mix DB step IDs (`1.1.1`) into Batting Order Step IDs (`BO-P1-01`). |

---

## Airtable identifiers (automation)

These match [`runs/apply-airtable-doc-links.py`](runs/apply-airtable-doc-links.py):

| | Value |
|---|--------|
| **Base name** | Relay Database Tracker |
| **Base ID** | `appDbIOVX38X6U8Sf` |
| **Table** | DB Integration Pipeline |
| **Table ID** | `tblknpuhcvbttvwYi` |

If the base is duplicated or renamed, confirm IDs in the Airtable API or URL bar before scripting.

---

## Rows: one per roadmap step

- **Granularity:** **One Airtable row = one step** from [`integration-roadmap.md`](integration-roadmap.md) (same **Step ID** string as in the doc, e.g. `1.1.1`, `3.3.4`).
- **Sort order:** Integer **1…n** in strict execution order. Every row has a unique **Sort order**; agents work in this order unless **Parallel with** says otherwise.
- **Primary key for humans:** **Step ID** (text). **Sort order** is the sort key for queues and “what’s next.”

There is **no** separate “run” row. **Runs** are a **grouping** of many step rows that share one prompt file and two URL fields (below).

---

## The “runs” batching formula

**Problem:** The roadmap has dozens of small steps; one Airtable row per step keeps honest **Complete** granularity, but pasting forty prompts would be unusable.

**Solution:** **19 runs** (`run-01.md` … `run-19.md`). Each run is one markdown prompt that covers **multiple Step IDs** in one agent turn.

**How it maps:**

1. **Authoritative grouping** lives in [`runs/_generate_runs.py`](runs/_generate_runs.py) as the `RUNS` list: each entry is `(run number, title, Step IDs covered, Sort order range, gate text, body)`.
2. For every step row belonging to **run N**, set:
   - **`Doc reference`** → GitHub (or canonical git web) URL to **`docs/database/runs/run-NN.md`** — the prompt for **this** batch.
   - **`Next run prompt`** → URL to **`run-(N+1).md`**, or **empty** for terminal steps in run 19 (M10) where there is no next integration prompt.
3. **All step rows in the same run** share the **same** `Doc reference` and **same** `Next run prompt`. The agent opens **one** file; when done, they mark **Complete** on **every** Step ID listed in that run.

**Operational rule:** Completing “run 7” means: every pipeline row whose **Doc reference** points at `run-07.md` is set to **Pipeline status** = **Complete** (after verification), with **Notes** updated for each.

**Index:** milestone and title per run — [`runs/README.md`](runs/README.md).

---

## Field dictionary (DB Integration Pipeline)

Use these **exact** field names in API/MCP scripts (Airtable is case- and space-sensitive).

| Field | Type (conceptual) | Purpose |
|-------|-------------------|---------|
| **Step ID** | Single line text | Roadmap identifier, e.g. `2.1.3`. Unique per row. |
| **Sort order** | Integer | Global order 1…n. |
| **Milestone** | Single line or single select | e.g. M1, M2, … — aligns with roadmap milestones. |
| **Pipeline status** | Single select | **`Queued`** → **`In progress`** → **`Complete`**. Use **In progress** only for rows in the active run. |
| **Doc reference** | URL | Link to **`run-NN.md`** for this step’s run (same URL for all steps in that run). |
| **Next run prompt** | URL | Link to the **next** `run-NN.md`, or empty when there is no next prompt (end of M10). |
| **Notes** | Long text | Completion evidence, commands run, PR link. **No** separate “Integrator Notes” field on this table. |
| **Depends on** | Text or links | Which steps must be **Complete** before this step (mirror roadmap). |
| **Parallel with** | Text or links | Which other steps may run in parallel (see [`sub-agent-prompts.md`](sub-agent-prompts.md) parallel matrix). |
| **Execution mode** | Single select (if used) | e.g. human vs agent — optional team convention. |
| **Assignee** | Collaborator (optional) | Who owns the active run. |

If your base uses **Name** as the primary column, store the roadmap **`x.y.z`** Step ID there (or mirror it in a dedicated **Step ID** field). Add other columns only if the whole team agrees; agents assume the contract above.

---

## Workflow (agents)

1. Filter **Queued** (and satisfy **Depends on**).
2. Open **`Doc reference`** for the next **Sort order** block — that is the prompt for this run.
3. Set those rows to **In progress**; set **Assignee** if used.
4. Paste the **Full prompt** section from `run-NN.md` into the agent chat.
5. After verification, set **Complete** on **all** Step IDs in that run and append to **Notes**.

**Chaining:** The next human or agent follows **`Next run prompt`** (or the Handoff section in the run file).

---

## Refreshing docs and Airtable URLs

| Action | Command / artifact |
|--------|---------------------|
| Regenerate **`run-NN.md`** files after editing bodies in **`_generate_runs.py`** | `python docs/database/runs/_generate_runs.py` |
| Bulk-set **`Doc reference`** and **`Next run prompt`** on existing records | `python docs/database/runs/apply-airtable-doc-links.py` (reads [`runs/_airtable_update_batches.json`](runs/_airtable_update_batches.json), needs `AIRTABLE_PAT` or `AIRTABLE_API_KEY`) |
| Change GitHub org/repo/path in links | Update the base URL in **`_generate_runs.py`** (and regenerate), then regenerate **`_airtable_update_batches.json`** if your workflow produces it from the same source — keep batch JSON in sync with record IDs. |

---

## Related docs

- [`README.md`](README.md) — database folder index, analytics/Part 2 flags.
- [`sub-agent-prompts.md`](sub-agent-prompts.md) — batch instructions, parallel matrix, link to apply script.
- [`M10_VERIFICATION.md`](M10_VERIFICATION.md) — closing out the pipeline at M10.
