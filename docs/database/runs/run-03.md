# Run 03 — Prisma client singleton (M1 · Phase 1.3)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `1.3.1` · `1.3.2` · `1.3.3` |
| **Sort order** | 10–12 |
| **Precondition** | Run 02 complete. |

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

Goal: Single PrismaClient for the Node API; safe hot-reload; disconnect on shutdown.

Tasks:
1. Create src/lib/db.ts — export prisma singleton using globalThis.__prisma pattern; optional dev logging.
2. Wire prisma.$disconnect() in src/main.ts (or central shutdown) on SIGINT/SIGTERM alongside existing teardown.
3. Confirm tsc/build includes src/lib/db.ts (no orphan module).

Verify: npm run build; npm run test if tests import db later.

Out of scope: Domain models, server.ts store injection.

Airtable: Complete 1.3.1–1.3.3.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-03.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-03.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-04.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-04.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 04](run-04.md)** (folder: `docs/database/runs/`).

**Carry forward:** Prisma client is wired; add CI migrate deploy and db-migrate.ps1 next.
