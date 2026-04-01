# Scripts Library

## PowerShell profile shortcuts (optional)

After adding functions to `Microsoft.PowerShell_profile.ps1` (see repo instructions):

- **`rr`** — runs `dev-restart.ps1` (must `cd` into repo first).
- **`rscrape`** — `POST /api/v1/patreon/scrape` with `dry_run: false` (default `creator_id`: `dev_creator`). Override with `$env:RELAY_CREATOR_ID` / `$env:RELAY_API_URL`.

Reload profile: `. $PROFILE`

If **`rscrape` is not recognized**, the terminal may be running with `-NoProfile` (common in Cursor). Either reload the profile as above or run the same logic as a file:

`powershell -ExecutionPolicy Bypass -File .\scripts\rscrape.ps1`

PowerShell 7 (`pwsh`) loads a different profile path than Windows PowerShell (`powershell`). If you use `pwsh`, copy the same `rr` / `rscrape` functions into `Documents\PowerShell\Microsoft.PowerShell_profile.ps1`, or keep using `rscrape.ps1`.

## `dev-restart.ps1`
- **Use when:** backend/frontend terminals are stale and you want a quick restart.
- **Runs:** stops repo node processes, opens backend `npm start`, opens web `npm run dev`.
- **Command:** `powershell -ExecutionPolicy Bypass -File .\scripts\dev-restart.ps1`

## `maintenance-backup.ps1`
- **Use when:** before resets, migrations, or test-bed experiments.
- **Runs:** copies `.relay-data` into timestamped `.relay-backups` folder.
- **Command:** `powershell -ExecutionPolicy Bypass -File .\scripts\maintenance-backup.ps1`

## `maintenance-reset-ingest.ps1`
- **Use when:** you need a clean ingest backfill test while preserving curated gallery formatting by default.
- **Runs (default):** clears canonical/dlq/watermarks/exports only.
- **Command:** `powershell -ExecutionPolicy Bypass -File .\scripts\maintenance-reset-ingest.ps1`
- **Optional flags:**
  - `-AlsoClearCookie`
  - `-AlsoClearOAuth`
  - `-AlsoClearGalleryData`

## `maintenance-restore.ps1`
- **Use when:** rollback to a prior backup snapshot.
- **Runs:** replaces current `.relay-data` with selected backup contents.
- **Command:** `powershell -ExecutionPolicy Bypass -File .\scripts\maintenance-restore.ps1 -BackupName "<snapshot-folder>"`
