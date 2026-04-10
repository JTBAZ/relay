# Run 02 — Prisma bootstrap (M1 · Phase 1.2)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `1.2.1` · `1.2.2` · `1.2.3` · `1.2.4` · `1.2.5` |
| **Sort order** | 5–9 |
| **Precondition** | Run 01 complete (Postgres starts; DATABASE_URL documented). |

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

Goal: Install Prisma at repo root; empty schema with PostgreSQL datasource; npm scripts; generate on build.

Tasks:
1. npm install prisma (devDependency) and @prisma/client (dependency) at repo root.
2. npx prisma init — prisma/schema.prisma with datasource postgresql and generator; no models yet unless needed for first migrate.
3. Adjust .gitignore: commit prisma/schema.prisma and migrations; ignore env-specific noise per team convention.
4. package.json scripts: db:migrate (prisma migrate dev), db:push (prisma db push), db:generate (prisma generate); document briefly in package.json or docs/database if needed.
5. Ensure npm run build runs prisma generate (prebuild or explicit step) so CI/build always has a client.

Verify: npx prisma validate; npm run build succeeds.

Out of scope: src/lib/db.ts, CI workflow files — next runs.

Airtable: Complete 1.2.1–1.2.5.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-02.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-02.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-03.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-03.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 03](run-03.md)** (folder: `docs/database/runs/`).

**Carry forward:** Prisma CLI and empty schema exist; add the singleton client next.
