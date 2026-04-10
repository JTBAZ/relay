# Production — archive `canonical.json` (M3 · 3.3.5)

This step is **human-gated**. Do not enable Postgres canonical ingest in production until staging verification in **`staging-canonical-verification.md`** is complete and the owner approves.

## Archive (do not delete)

1. Copy the live **`.relay-data/canonical.json`** (or `RELAY_INGEST_CANONICAL_PATH`) to a dated archive location, e.g. `.relay-data/archive/canonical-YYYY-MM-DD.json` or object storage used by your backup policy.
2. Keep the original path available if you need to roll back to **file-backed** `FileCanonicalStore` by unsetting **`RELAY_DB_STORE_CANONICAL`**.
3. After cutover, new writes go to Postgres only when **`RELAY_DB_STORE_CANONICAL=1`**; the archived file is the audit trail for the migration.

## Do not delete

Per **`docs/database/runs/run-10.md`**, do **not** delete `canonical.json` as part of automation — archive first; deletion loses an independent recovery path until backups are proven.
