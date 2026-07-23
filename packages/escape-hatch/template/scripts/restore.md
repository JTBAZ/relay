# Escape Hatch — isolated restore rehearsal (EH-073)

Restores a prior fixture snapshot into `data/restore-rehearsal/<id>/` only — **never** overwrites live kit roots in this path.

## Invoke

```http
POST /api/admin/backup
Content-Type: application/json

{ "action": "restore_rehearsal", "backup_id": "bak_…" }
```

Omitting `backup_id` uses the latest successful backup.

## Explicit non-claims

- Not a full production DB/R2 restore
- Release signoff restore stays Milestone 8 / EH-082
- `productionSafe` remains false
