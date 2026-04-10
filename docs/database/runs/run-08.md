# Run 08 — Canonical schema (M3 · Phase 3.1)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `3.1.1` · `3.1.2` · `3.1.3` · `3.1.4` · `3.1.5` |
| **Sort order** | 27–31 |
| **Precondition** | M1 complete; can parallel M2 if M2 not blocking — prefer M2 identity schema done if FKs require User (else use string creator_id only per current file stores). |

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

Goal: Prisma models for Campaign, Post, PostVersion, MediaAsset, Tier, PostTier; SyncCursor; CreatorSyncState; IngestIdempotencyKey; indexes per integration-roadmap.

Tasks:
1. Map src/ingest/canonical-store.ts types to tables; preserve stable IDs strategy from roadmap.
2. migrate dev --name canonical_content
3. Indexes for hot paths (campaign+createdAt, postId, tier uniqueness).

Verify: prisma validate; migration applies on empty DB.

Out of scope: DbCanonicalStore — next run.

Airtable: Complete 3.1.1–3.1.5.
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-08.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-08.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-09.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-09.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 09](run-09.md)** (folder: `docs/database/runs/`).

**Carry forward:** Canonical schema exists; implement canonical + watermark + health DB stores next.
