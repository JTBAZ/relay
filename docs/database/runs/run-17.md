# Run 17 — Part 2 backend stores (M8)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `8.1.1`–`8.1.5` · `8.2.1`–`8.2.5` |
| **Sort order** | 77–86 |
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

Goal: CloneSite, PaymentConfig, CheckoutRecord, migration tables, Deployment; four Db* stores + backfill clone/payments/migrations/deploy JSON.

Verify: npm run test; npm run build; payment paths dry-run only — no live charges without human.

Human ops (turning on DB Part 2 stores): on each environment, `npx prisma migrate deploy` → `npm run backfill:part2` → enable only the `RELAY_DB_STORE_*` flags you need (`CLONE`, `PAYMENTS`, `MIGRATION`, `DEPLOY` are independent) and restart. See `docs/database/README.md` (Enabling Postgres-backed Part 2 stores).

Airtable: Complete 8.1.1–8.2.5.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-17.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-17.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-18.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-18.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 18](run-18.md)** (folder: `docs/database/runs/`).

**Carry forward:** Part 2 stores exist; add M9 stub migrations next.
