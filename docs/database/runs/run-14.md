# Run 14 — Operations + DLQ + durable events (M5)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `5.1.1` · `5.1.2` · `5.1.3` · `5.1.4` · `5.2.1` · `5.2.2` · `5.2.3` · `5.2.4` |
| **Sort order** | 53–60 |
| **Precondition** | M3 complete (canonical); can parallel M4 if teams split — avoid conflicting server.ts edits without coordination. |

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

Goal: JobRun + OutboxEvent schema; DbDeadLetterQueue; DbEventBus; RELAY_DB_STORE_DLQ and RELAY_DB_STORE_EVENTS.

Tasks:
1. Schema + migrate operations_dlq.
2. Implement DLQ and EventBus DB backends per src/ingest/dlq.ts and src/events/event-bus.ts contracts.
3. Wire flags in server.ts; keep InMemoryEventBus fallback until verified.

Verify: npm run test; publish test event survives restart if testing infra allows.

Airtable: Complete 5.1.1–5.2.4.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-14.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-14.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-15.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-15.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 15](run-15.md)** (folder: `docs/database/runs/`).

**Carry forward:** Operations path is in place; add analytics schema and DbAnalyticsStore next.
