# Relay — database planning

Authoritative relational design and migration plans for Relay’s **runtime** data. This folder is the engineering reference for PostgreSQL + Prisma (per `road map.md` — Architecture Baseline).

## Scope

- **In scope:** Schema direction, migrations from `.relay-data/` JSON stores, integrity, tenant isolation, encryption boundaries, retention posture, and how services should read/write data.
- **Out of scope:** Airtable **Production Ledger** — that queue is for humans/agents and project operations, **not** the application database (see `AGENTS.md`, `.docs/anthropic/AIRTABLE_LEDGER.md`).

## Product and contract references (read order)

| Doc | Role |
|-----|------|
| [`road map.md`](../../road%20map.md) | Architecture Baseline, Data Domains, Part 1 A/E, Part 3 K/L |
| [`.docs/anthropic/PRODUCT_UX_NORTH_STAR.md`](../../.docs/anthropic/PRODUCT_UX_NORTH_STAR.md) | Artist Relay vs Fan Relay, single access model |
| [`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`](../qa/UX_ACCEPTANCE_GUARDRAILS.md) | Route/API expectations for QA |
| [`docs/patreon-ingest-canonical.md`](../patreon-ingest-canonical.md) | Canonical ingest vs presentation |
| [`docs/relay-artist-metadata.md`](../relay-artist-metadata.md) | Overrides survive re-ingest |
| [`docs/pattern-library.md`](../pattern-library.md) | Viewer parity, Library vs fan surfaces |
| [`analytics-action-center-spec.md`](../../analytics-action-center-spec.md) | Analytics / recommendation minimum model |
| [`builder-boost-pack/contracts/events.md`](../../builder-boost-pack/contracts/events.md) | Event envelope, `tenant_id`, idempotency |

## Documents in this folder

| File | Contents |
|------|----------|
| [`relational-model.md`](relational-model.md) | Principles, ERD, representative Prisma-oriented schema |
| [`migration-from-relay-data.md`](migration-from-relay-data.md) | `.relay-data/` → tables mapping, dual-write / cutover |
| [`operations-and-security.md`](operations-and-security.md) | Indexes, partitioning, RLS, encryption, analytics alignment, open product flags |
| [`integration-roadmap.md`](integration-roadmap.md) | **Execution plan:** 10 milestones, phased work items, dependency order, parallel tracks, open-pipe stubs for future build structures |
| [`sub-agent-prompts.md`](sub-agent-prompts.md) | **Copy-paste prompts** for sub-agents (19 runs aligned with Airtable Step IDs + Universal preamble) |

## Repo reality

The repo root has **`prisma/schema.prisma`**, **`prisma/migrations/`**, and **`prisma.config.ts`** (Prisma 7: DB URL is configured for the CLI in `prisma.config.ts`; see root `.env.example` **`DATABASE_URL`**). GitHub Actions **`.github/workflows/ci.yml`** runs **`prisma migrate deploy`** against an ephemeral Postgres. Application code still uses **file-backed** `.relay-data/` for much persistence (see `src/server.ts`) until domain models land. NPM scripts: **`npm run db:generate`**, **`npm run db:migrate`**, **`npm run db:push`**; **`npm run build`** runs **`prisma generate`** before `tsc`.

## See also

- **[`AGENTS.md`](../../AGENTS.md)** — repo map entry for `docs/database/`
- **[`docs/pattern-library.md`](../pattern-library.md)** — viewer parity and data contracts (same semantics as storage evolves)

## Airtable — execution queue (optional)

The **Relay Database Tracker** Airtable base holds a **DB Integration Pipeline** table: one row per step from [`integration-roadmap.md`](integration-roadmap.md), with **Sort order** (1…n), **Pipeline status** (`Queued` → `In progress` → `Complete`), **Depends on**, **Parallel with**, **Milestone**, and **Execution mode**. Sub-agents should sort by **Sort order**, respect dependencies, then update **Pipeline status** as they work. This is separate from the **Project tracker** Production Ledger (product/ledger tasks).
