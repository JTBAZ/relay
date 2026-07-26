# Escape Hatch — kit-local backup (EH-073)

Fixture / operator rehearsal only. **Not** a live Postgres `pg_dump` or R2 inventory job.

## What it does

Writes a redacted config/manifest snapshot under `data/backups/<id>/` and updates `data/backup-state.json` (daily cadence, RPO 24h documented).

## Invoke

From the generated kit root (staff/admin session or local operator):

```http
POST /api/admin/backup
Content-Type: application/json

{ "action": "run_backup" }
```

Or call the shared library from a Node one-liner after `cd` into the kit:

```js
// node -e "..."  (see lib/backup/snapshot.ts — runScheduledBackup)
```

## Explicit non-claims

- No encrypted secret vault dump
- No managed cloud backup provider
- `productionSafe` remains false
