# Run 11 — Curation schema (M4 · Phase 4.1)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `4.1.1` · `4.1.2` · `4.1.3` · `4.1.4` · `4.1.5` |
| **Sort order** | 40–44 |
| **Precondition** | M3 canonical schema stable. |

## Full prompt (paste into agent)

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

Airtable: update Relay Database Tracker → DB Integration Pipeline rows for this task's Step IDs: Pipeline status In progress while working, Complete when done; append a short completion summary to **Notes** (this table has no separate Integrator Notes field).

Goal: PostOverride, LibraryCollection + join, SavedFilter, PageLayout; migrate creator_curation.

Follow docs/database/relational-model.md and integration-roadmap notes (text[] tags, layoutJson).

Verify: prisma migrate dev; validate.

Airtable: Complete 4.1.1–4.1.5.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-11.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-11.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-12.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-12.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 12](run-12.md)** (folder: `docs/database/runs/`).

**Carry forward:** Curation schema exists; implement gallery/curation DB stores next.
