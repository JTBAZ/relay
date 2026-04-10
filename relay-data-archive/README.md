# `.relay-data` archive (manual step)

This folder is a **destination for a human-operated copy** of `.relay-data/` after you have cut over to Postgres for the domains you care about.

**Do not commit** live JSON secrets or production exports here unless your security policy explicitly allows it (default: keep this folder empty in git; add to `.gitignore` if you store local archives).

## Suggested procedure

1. Verify backfills and `RELAY_DB_STORE_*` flags in staging/production per [`docs/database/README.md`](../docs/database/README.md).
2. Stop the API (or take a filesystem-consistent snapshot if your host supports it).
3. Copy the entire `.relay-data/` directory into a dated subdirectory here, e.g. `relay-data-archive/2026-04-10-pre-db-cutover/`.
4. Add a one-line `NOTES.txt` in that subdirectory: date, environment, and which flags were on.
5. Keep the original `.relay-data/` read-only or remove **only** after your retention policy (e.g. 30-day soak) and owner approval.

Relay does not auto-populate this folder.
