# Escape Hatch — update / compatibility check (EH-073)

Compares current `escape-hatch.manifest.json` chassis/schema/slice against the `previous_stable` pointer in `data/backup-state.json`.

## Invoke

```http
GET /api/admin/backup
```

Inspect `readiness.compatibility` and `previous_stable`. Diagnostics:

```http
GET /api/admin/backup?diagnostics=1
```

## Explicit non-claims

- Not an automated live migrate
- Forward-compat is honest fixture guidance (current±1 notes), not certification
- `productionSafe` remains false
