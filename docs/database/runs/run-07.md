# Run 07 — Identity wiring + backfill + staging (M2 · Phase 2.3)

## Orientation

Use with **Relay Database Tracker** → **DB Integration Pipeline** (not Project tracker Production Ledger). Canonical roadmap: [`integration-roadmap.md`](../integration-roadmap.md).

| | |
|---|---|
| **Step IDs** | `2.3.1` · `2.3.2` · `2.3.3` · `2.3.4` · `2.3.5` |
| **Sort order** | 22–26 |
| **Precondition** | Run 06 complete. |

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

Airtable: update Relay Database Tracker → DB Integration Pipeline rows for this task's Step IDs: **In progress** while working; when verified, **always** set **Pipeline status** → **Complete** for each Step ID in this run and append a short completion summary to **Notes** (this table has no separate Integrator Notes field).

Goal: RELAY_DB_STORE_IDENTITY in server.ts; backfill identity.json; parity tests; staging checklist; production note.

Tasks:
1. Inject DbIdentityStore when RELAY_DB_STORE_IDENTITY=1 else FileIdentityStore in createApp/server.ts.
2. `scripts/backfill-identity.mjs` (loads built `src/identity/backfill-identity-from-file.ts`) — idempotent upsert from identity.json; use `npm run backfill:identity` or `node scripts/backfill-identity.mjs [path]`.
3. Test: after backfill, DB matches file for users/sessions (counts + sample).
4. Document staging verification against docs/qa/UX_ACCEPTANCE_GUARDRAILS.md relevant routes.
5. 2.3.5 may be human-gated: document production enable + soak; do not remove file store until owner approves.

Verify: npm run test; manual login smoke if env allows.

Airtable: Complete 2.3.1–2.3.5 (note 2.3.5 may stay In progress until production soak — use Notes field).
```

## Links

- **This run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-07.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-07.md)
- **Next run (GitHub):** [https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-08.md](https://github.com/JTBAZ/relay/blob/main/docs/database/runs/run-08.md)

---

## Handoff (queue the next agent)

When this run’s steps are verified and **Pipeline status** is **Complete** for the relevant Step IDs, start the next agent with the **full** prompt from **[Run 08](run-08.md)** (folder: `docs/database/runs/`).

**Carry forward:** Identity is wired from DB; add canonical content schema next.
