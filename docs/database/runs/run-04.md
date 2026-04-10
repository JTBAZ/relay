# Run 04 — Migration CI + Windows helper (M1 · Phase 1.4)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `1.4.1` · `1.4.2` · `1.4.3` |
| **Sort order** | 13–15 |
| **Precondition** | Run 02–03 complete (migrate + client exist). |

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

Goal: CI can run prisma migrate deploy; ops doc has rollback note; Windows dev script.

Tasks:
1. Locate CI workflow(s) in repo; add step with DATABASE_URL from secrets to run prisma migrate deploy (or document placeholder if no CI yet — prefer adding real step if GitHub Actions etc. exist).
2. Append rollback procedure to docs/database/operations-and-security.md (prisma migrate resolve --rolled-back <migration>).
3. Add scripts/db-migrate.ps1 calling npx prisma migrate dev for local dev.

Verify: CI config YAML valid; script runs from repo root on Windows.

Airtable: Complete 1.4.1–1.4.3.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-04.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-04.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-05.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-05.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 05](run-05.md)** (folder: `docs/database/runs/`).

**Carry forward:** CI and local migrate flow exist; add identity Prisma models next.
