# Run 18 — Future stubs (M9) — schema-only, open pipes

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `9.1.1`–`9.4.3` (ranges in integration-roadmap) |
| **Sort order** | 87–102 |
| **Precondition** | M2 + M3 complete; rest of app can be in flight. |

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

Goal: Add Prisma models + migrations for Part 3 patron network, engagement, Smart Tag stubs, WebhookEndpoint, operational indexes — NO production feature logic required; migrations must apply cleanly.

Tasks:
1. Follow integration-roadmap M9 sections exactly; use @@ignore or Unsupported for vector if needed.
2. Document pgvector raw migration note in relational-model.md if touching 9.3.x.
3. No backfill for stubs unless a JSON file maps 1:1 (e.g. webhook metadata) — owner decides per row Notes in Airtable.

Verify: prisma migrate dev; npm run build.

Airtable: Complete 9.1.1–9.4.3.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-18.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-18.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-19.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-19.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 19](run-19.md)** (folder: `docs/database/runs/`).

**Carry forward:** Stub migrations apply; run full verification, cleanup, and docs (M10) next.
