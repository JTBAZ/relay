# Run 15 — Analytics (M6)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `6.1.1`–`6.1.6` · `6.2.1`–`6.2.4` |
| **Sort order** | 61–70 |
| **Precondition** | M2 + M3 complete. |

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

Goal: AnalyticsSnapshot, RecommendationRecord, ActionExecution, RecommendationOutcome; partition doc note; DbAnalyticsStore; backfill analytics.json; RELAY_DB_STORE_ANALYTICS; verify ActionCenterService + SnapshotGenerator.

Follow src/analytics/types.ts and analytics-action-center-spec alignment.

Verify: npm run test; npm run build; analytics API smoke.

Airtable: Complete 6.1.1–6.2.4 (note 6.1.6 is documentation-only if no partition DDL yet).
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-15.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-15.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-16.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-16.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 16](run-16.md)** (folder: `docs/database/runs/`).

**Carry forward:** Analytics path is in place; add patron engagement schema and stores next.
