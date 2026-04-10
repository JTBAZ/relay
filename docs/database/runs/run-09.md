# Run 09 — Canonical DB stores (M3 · Phase 3.2)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `3.2.1` · `3.2.2` · `3.2.3` |
| **Sort order** | 32–34 |
| **Precondition** | Run 08 complete. |

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

Goal: DbCanonicalStore, DbSyncWatermarkStore, DbPatreonSyncHealthStore — match existing file APIs.

Tasks:
1. canonical-store-db.ts implementing load/save/mutate or slimmer explicit methods if mutating full snapshot is too heavy.
2. sync-watermark-store-db.ts
3. patreon-sync-health-store-db.ts

Verify: npm run test; npm run build; optional integration test with docker Postgres.

Airtable: Complete 3.2.1–3.2.3.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-09.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-09.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-10.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-10.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 10](run-10.md)** (folder: `docs/database/runs/`).

**Carry forward:** Canonical DB stores exist; backfill, wire RELAY_DB_STORE_CANONICAL, and promote next.
