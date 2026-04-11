# T-015 — Parallel — Postgres + Prisma durable stores (Relay Database Tracker)

## Goal

Advance **Postgres / Prisma** cutover per `docs/database/integration-roadmap.md` and **Relay Database Tracker** milestones: `RELAY_DB_STORE_*` per domain, **M10** verification where relevant. This is **parallel** to Patreon UX; coordinate domains to avoid double-writes without a plan.

## Scope / non-goals

- **In scope:** Schema/migrations, store adapters, verification steps in `docs/database/M10_VERIFICATION.md` as applicable.
- **Non-goals:** Conflating this with **Project tracker** Production Ledger or this **autopipeline** queue row types; do not store secrets in Airtable.

## Validation

- Prisma / DB commands per project conventions; `npm run test` / `npm run build` at repo root if shared code changes.

## Handoff

After success, write **Delta Out** and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`. Update **Relay Database Tracker** base rows if that is your workflow.
