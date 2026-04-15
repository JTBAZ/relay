# Multi-tenant run 09 — Rollout: flags, backfill, cutover, ops (MT-022–MT-025)

| | |
|---|---|
| **Step IDs** | `MT-022` · `MT-023` · `MT-024` · `MT-025` |
| **Sort order** | 22–25 |
| **Precondition** | MT-017 Complete for dual-read/cutover; prior identity backfill scripts exist. |

## Full prompt (paste into agent)

```text
You are a coding agent on Rescue / Relay. This batch covers Step IDs MT-022 through MT-025 only.

### MT-022 — Feature flag `RELAY_LEGACY_SINGLE_TENANT` + dual-read

- Introduce env `RELAY_LEGACY_SINGLE_TENANT` (or reuse naming in `.env.example`): when true, allow reading `NEXT_PUBLIC_RELAY_CREATOR_ID` / server `RELAY_*` fallbacks for one release; when false, multi-tenant paths only.
- Implement dual-read in the smallest surface: e.g. `web/` gallery fetch resolves creator id from session first, env second **only** if flag on.

### MT-023 — Backfill file / `.relay-data` identity to DB

- Use or extend `npm run backfill:identity` and related scripts so production-like data lands in Postgres under the flag; document idempotency.
- Map file-era ids to `legacyFileId` columns per schema.

### MT-024 — Cutover

- Default flag off in production config templates; remove reliance on env creator id for **runtime** behavior in patron flows.
- Document breaking changes for deployers.

### MT-025 — Ops checklist (M10-style)

- Add or extend a checklist section (e.g. in `docs/database/M10_VERIFICATION.md` or new `docs/architecture/multi-tenant-rollout.md`) covering: `prisma migrate deploy`, smoke auth, Patreon OAuth in staging, rollback via flag.

Verify:
- `npm run build` root + `web`; `npm run verify:m10` or closest repo gate if identity touched.

Airtable: Complete MT-022–MT-025.

Out of scope: Product docs narrative (run 10).
```

## Links

- **This run:** [mt-run-09.md](mt-run-09.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-09.md`
- **Next run:** [mt-run-10.md](mt-run-10.md) — `https://github.com/JTBAZ/relay/blob/main/docs/architecture/multi-tenant-runs/mt-run-10.md`

## Handoff

Start **[mt-run-10.md](mt-run-10.md)** (documentation + integration tests).
