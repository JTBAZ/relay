# Delta Out — T-015 (Postgres + Prisma durable stores)

## 1. Delta

- **Cutover model:** Per-domain `RELAY_DB_STORE_*` flags in `src/server.ts` select `Db*Store` implementations (Prisma) vs file-backed `File*Store`; see `docs/database/migration-from-relay-data.md` for the domain ↔ flag ↔ table map.
- **Schema / tooling:** `prisma/schema.prisma`, `prisma.config.ts`, npm scripts `db:generate`, `db:migrate`, `db:push`; `src/lib/db.ts` Prisma singleton pattern.
- **Relay Database Tracker:** Step-level queue is base **`appDbIOVX38X6U8Sf`** (DB Integration Pipeline) — distinct from this **Relay Patreon Milestones** autopipeline base; update pipeline rows there when you complete roadmap steps.
- **Verification run:** `npm run verify:m10` — root `build` + `test` (226 tests), `scripts/m10-token-log-scan.mjs`, `web` lint + production build — **exit 0** on commit under verification.

## 2. Risks / blockers

- **M10.2** (remove file fallbacks / flags, archive `.relay-data`) remains **human-gated** per `docs/database/M10_VERIFICATION.md` §10.2 — not implied by this task alone.
- **T-005** (proactive OAuth refresh) remains **Failed** in this base with retries remaining — unrelated to DB cutover; address separately.

## 3. Next step hint

- **T-016** / **T-017** are **Stopped_OffScript** in Airtable — no automated next Ready row after T-015. Resume **T-016** manually when Part 3 patron entitlement prerequisites are met, or pick work from **Project tracker** Production Ledger.
