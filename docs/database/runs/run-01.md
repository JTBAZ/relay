# Run 01 — Local Postgres (M1 · Phase 1.1)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `1.1.1` · `1.1.2` · `1.1.3` · `1.1.4` |
| **Sort order** | 1–4 |
| **Precondition** | None (first run). |

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

Goal: Milestone 1 Phase 1.1 — local + documented database connectivity.

Tasks:
1. Add repo-root docker-compose.yml: service postgres:16-alpine, port 5432, named volume for data, POSTGRES_USER/PASSWORD/DB aligned with next step.
2. Add DATABASE_URL to root .env.example (placeholder values matching compose defaults, e.g. postgresql://relay:relay@localhost:5432/relay_dev). Ensure .gitignore keeps real .env out of git.
3. web/.env.local.example: add DATABASE_URL only if the task owner confirms Next.js will use direct DB access; otherwise add a one-line comment that web talks to API only and skip the variable.
4. Add a small dev helper: scripts/db-up.ps1 or extend docs snippet — document "docker compose up -d" before npm start for local Postgres. Keep it consistent with existing scripts/ style.

Verify: docker compose config valid; docker compose up -d succeeds; pg_isready or psql select 1 against the container.

Out of scope: Prisma install, schema models, CI — next runs.

Airtable: Complete rows for Step IDs 1.1.1–1.1.4 when done.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-01.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-01.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-02.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-02.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 02](run-02.md)** (folder: `docs/database/runs/`).

**Carry forward:** Postgres is up and DATABASE_URL is documented; Prisma can be installed next.
