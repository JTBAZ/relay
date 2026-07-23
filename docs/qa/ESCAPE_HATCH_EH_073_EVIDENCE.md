# ESCAPE_HATCH_EH_073_EVIDENCE

**Slice:** EH-073 Backup/restore/update manifest  
**Date:** 2026-07-23  
**productionSafe:** false  
**Builder:** Cursor Grok 4.5 High

## Delivered

1. **Scheduled backups (kit-local)** — `data/backup-state.json` daily cadence; RPO 24h / RTO 30m documented; redacted config/manifest snapshots under `data/backups/`.
2. **Isolated restore rehearsal** — restores into `data/restore-rehearsal/` only; lightweight read + compatibility verification; fail-closed paths covered in tests.
3. **Version / compatibility / diagnostics** — previous_stable pointer; honest current±1 notes; `GET /api/admin/backup?diagnostics=1` redacts secrets/PII.
4. **Admin** — Health items (freshness, restore, compatibility, diagnostic download); `GET/POST /api/admin/backup` (no new primary nav tab).
5. **Scripts** — `template/scripts/{backup,restore,update}.md` stubs pointing at the same lib.

## Explicit non-claims / deferrals

- Live Postgres scheduled dump / managed backup provider / R2 versioning.
- Encrypted secret inventory outside the kit.
- Wizard “must create backup before complete” (**EH-074**) and full production restore signoff (**EH-082**).
- Live DNS/TLS probes; `productionSafe` remains false.

## Verification

- Kit unit tests: `escape-hatch-backup-restore.test.ts` + full `packages/escape-hatch` suite.
- Status: `ESCAPE_HATCH_SLICE = EH-073`, next `EH-074`, `backup-restore` → `preview_only`.
