# Run 05 — Identity schema (M2 · Phase 2.1)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `2.1.1` · `2.1.2` · `2.1.3` |
| **Sort order** | 16–18 |
| **Precondition** | M1 runs complete. |

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

Goal: Prisma models for identity per docs/database/relational-model.md — Tenant, User, Session, ProviderAccount, OAuthCredential (creator_ingest), CreatorProfile, PatronProfile; legacy_file_id where needed; indexes per integration-roadmap.

Tasks:
1. Add models and relations; session stores token hash only in schema design (implementation in next run).
2. prisma migrate dev --name identity_sessions
3. Add indexes: User (tenantId, kind), Session (userId, expiresAt), ProviderAccount unique (provider, providerUserId).

Verify: prisma migrate deploy dry-run; prisma validate.

Out of scope: DbIdentityStore implementation, server wiring, backfill.

Airtable: Complete 2.1.1–2.1.3.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-05.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-05.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-06.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-06.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 06](run-06.md)** (folder: `docs/database/runs/`).

**Carry forward:** Identity schema exists; implement DbIdentityStore and token stores next.
