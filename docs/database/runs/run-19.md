# Run 19 — Verification + cleanup + docs (M10)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `10.1.1`–`10.1.5` · `10.2.1`–`10.2.4` · `10.3.1`–`10.3.3` |
| **Sort order** | 103–114 |
| **Precondition** | All prior milestones Complete per dependency graph. |

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

Goal: Full test/build with all RELAY_DB_STORE_* on; web lint/build; UX guardrails; cross-tenant isolation test; security audit no tokens in logs; remove file fallbacks and flags; archive .relay-data; update migration-from-relay-data.md; pooling + deploy docs; AGENTS.md / road map.md DB-complete note.

Human gates: production flag removal and .relay-data archive dates — coordinate with owner.

Verify: AGENTS.md verification commands; docs/qa/UX_ACCEPTANCE_GUARDRAILS.md.

Airtable: Complete 10.1.1–10.3.3.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-19.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-19.md)

---

## Handoff (queue the next agent)

This is the final integration run (M10). Coordinate human gates (production flags, `.relay-data` archive) with the owner; close out the DB Integration Pipeline when verification is done.
