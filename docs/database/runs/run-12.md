# Run 12 — Curation DB stores (M4 · Phase 4.2)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `4.2.1` · `4.2.2` · `4.2.3` · `4.2.4` |
| **Sort order** | 45–48 |
| **Precondition** | Run 11 complete. |

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

Goal: DbGalleryOverridesStore, DbCollectionsStore, DbSavedFiltersStore, DbPageLayoutStore — mirror src/gallery/*-store.ts APIs.

Verify: npm run test; npm run build.

Airtable: Complete 4.2.1–4.2.4.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-12.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-12.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-13.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-13.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 13](run-13.md)** (folder: `docs/database/runs/`).

**Carry forward:** Curation stores exist; wire flags and backfill curation JSON next.
