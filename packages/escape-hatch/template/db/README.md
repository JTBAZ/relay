# Database path (EH-020)

This kit ships **portable SQL** under `db/schema/` and `db/migrations/`.

- `next build` and local soft-preview **do not** require `DATABASE_URL`.
- Preview content loads from `data/site.json` (and public copies) until EH-030.
- Typed `DatabaseProvider` stub lives in `lib/adapters/` — it refuses live migrate without env and never invents RLS.
- Apply migrations yourself (psql, migrate CLI, or future EH-030 runner) against creator-owned Postgres.

Do not treat empty tables as production identity or entitlement truth.
