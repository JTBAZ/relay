# Scripts Library

## PowerShell profile shortcuts (optional)

After adding functions to `Microsoft.PowerShell_profile.ps1` (see repo instructions):

- **`rr`** — runs `dev-restart.ps1` (must `cd` into repo first).
- **`rls`** — **relay live scrape**: `POST /api/v1/patreon/scrape` with **`dry_run: false`** (applies ingest + exports). Script: `.\scripts\rls.ps1`. Same env as `rscrape`: `$env:RELAY_CREATOR_ID`, `$env:RELAY_API_URL`. Optional args: `-CreatorId`, `-MaxPostPages` (default `20`), `-CampaignId`. Use `-DryRun` for a preview-only run.
- **`rscrape`** — same behavior as **`rls`** (calls `relay-live-scrape.ps1`); kept for older profiles.
- **`rds`** — **relay dry scrape**: `dry_run: true` + `include_batch: true`, then **tables** (summary, warnings, tiers, **media totals**, posts) instead of raw JSON. Script: `.\scripts\rds.ps1` (optional first arg = max post rows in the printed table, default `30`). Same `RELAY_API_URL` / `RELAY_CREATOR_ID` as `rscrape`. By default it sends **`max_post_pages: 100`** (API cap) and **`force_refresh_post_access: true`** so the sync **watermark does not hide** older posts (you see full campaign posts + cookie media when a session cookie is set). Override: `RELAY_DRY_SCRAPE_MAX_PAGES`, or `RELAY_DRY_SCRAPE_RESPECT_WATERMARK=1` to skip force-refresh for a faster incremental-style preview.

**`rds` / `rls` in any terminal:** PowerShell aliases cannot run scripts with arguments cleanly; use **functions** in `$PROFILE`:

```powershell
$RelayRepo = 'C:\Users\jorda\Documents\Coding Projects\Rescue'   # <-- your clone path

function rr {
  Push-Location $RelayRepo
  try { & (Join-Path $RelayRepo 'scripts\dev-restart.ps1') } finally { Pop-Location }
}

function rls {
  Push-Location $RelayRepo
  try { & (Join-Path $RelayRepo 'scripts\rls.ps1') @args } finally { Pop-Location }
}

function rds {
  Push-Location $RelayRepo
  try { & (Join-Path $RelayRepo 'scripts\rds.ps1') @args } finally { Pop-Location }
}

# Optional: same as rls (backward compatible name)
function rscrape {
  Push-Location $RelayRepo
  try { & (Join-Path $RelayRepo 'scripts\rscrape.ps1') @args } finally { Pop-Location }
}
```

Then: `rls`, `rls -MaxPostPages 5`, `rds`, or `rds 50` (more post rows). You must `cd` into the repo **or** use the `Push-Location` pattern above so each script’s repo-root check passes.

Reload profile: `. $PROFILE`

If **`rls` is not recognized**, the terminal may be running with `-NoProfile` (common in Cursor). Either reload the profile as above or run:

`powershell -ExecutionPolicy Bypass -File .\scripts\rls.ps1`

PowerShell 7 (`pwsh`) loads a different profile path than Windows PowerShell (`powershell`). If you use `pwsh`, copy the same functions into `Documents\PowerShell\Microsoft.PowerShell_profile.ps1`.

## `db-migrate.ps1`
- **Use when:** you are authoring migrations locally (`prisma migrate dev`).
- **Runs:** `npx prisma migrate dev` from the repo root; optional args pass through to Prisma (e.g. `--create-only --name my_change`).
- **Command:** `powershell -ExecutionPolicy Bypass -File .\scripts\db-migrate.ps1`
- **Prereq:** `DATABASE_URL` in root `.env`; Postgres running (`.\scripts\db-up.ps1`).

## `db-up.ps1`
- **Use when:** you need local Postgres before running the API (`npm start`) once Prisma uses `DATABASE_URL`.
- **Runs:** `docker compose up -d` from the repo root, then `pg_isready` against the `postgres` service (defaults: user `relay`, DB `relay_dev`, host port `5433`).
- **Command:** `powershell -ExecutionPolicy Bypass -File .\scripts\db-up.ps1`
- **Prereq:** Docker Desktop (or Docker Engine) with Compose v2. Copy root `.env.example` → `.env` and set `DATABASE_URL` to match compose (see `.env.example`).

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

## `autopipeline-runner.mjs` + `run-airtable-autopipeline-task.ps1`
- **Use when:** driving the **Airtable writing pipeline** (queue beats + **Sessions** log): sync **Delta In** to **`Story Blocks/Airtable Drops/incoming/`** (or set **`STORY_BLOCKS_DIR`**), log sessions, advance **Status**, optionally enforce a single **Ready** beat. Legacy prompts may still live under `docs/Airtable Drops/prompts/`.
- **Docs:** [`Story Blocks/docs/AIRTABLE_WRITING_PIPELINE.md`](../Story Blocks/docs/AIRTABLE_WRITING_PIPELINE.md) (canonical pack); stubs under [`docs/database/`](../docs/database/) link there.
- **Prereq:** Airtable PAT in `.env` — see `autopipeline-runner.mjs` header for accepted variable names (`AIRTABLE_PAT`, `AIRTABLE_AUTOPIPELINE_TOKEN`, etc.) and optional **`AUTOPIPELINE_FIELD_*`** overrides when Airtable column names differ.
- **Commands:** `npm run autopipeline -- status` · `npm run autopipeline -- prepare` · `npm run autopipeline -- complete --taskKey T-006 --exitCode 0 --deltaOutFile ./delta.md` · `npm run autopipeline:run-until-barrier:dry` (dry-run) · `npm run autopipeline -- run-until-barrier` (loops agent until **barrier** env). **`run-until-t011`** remains as a deprecated alias. **PowerShell:** `npm` drops `--flags` after the first script arg unless you insert a second `--` (e.g. `npm run autopipeline -- -- run-until-barrier --dry-run`).
- **Agent (PowerShell):** `.\scripts\run-airtable-autopipeline-task.ps1 -TaskKey "T-007"` (or `-SkipAgent` for bundle only). Optional tone file: **`Story Blocks/Airtable Drops/story/TONE.md`** (copy from `Story Blocks/Airtable Drops/story/TONE.example.md`) or **`-ToneFile <path>`** — see [`Story Blocks/docs/AIRTABLE_WRITING_TONE_THEMES.md`](../Story Blocks/docs/AIRTABLE_WRITING_TONE_THEMES.md).
