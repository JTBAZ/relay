# Run 10 — Canonical backfill + wire + promote (M3 · Phase 3.3)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `3.3.1` · `3.3.2` · `3.3.3` · `3.3.4` · `3.3.5` |
| **Sort order** | 35–39 |
| **Precondition** | Run 09 complete. |

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

Goal: backfill-canonical.ts; parity; RELAY_DB_STORE_CANONICAL; staging idempotency test; production note.

Tasks:
1. Chunked backfill from .relay-data/canonical.json (or configured path).
2. Parity tests counts + sample posts.
3. server.ts flag for DbCanonicalStore + watermarks + health stores.
4. Staging: run ingest twice same batch — identical counts.
5. 3.3.5 human-gated: archive canonical.json; do not delete.

Verify: npm run test; ingest smoke on staging.

Airtable: Complete 3.3.1–3.3.5.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-10.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-10.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-11.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-11.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 11](run-11.md)** (folder: `docs/database/runs/`).

**Carry forward:** Canonical path is complete; add curation schema next.
