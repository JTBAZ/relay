# Rescue maintenance helper: reset ingestion state for clean backfill tests
#
# Best for:
# - Verifying new ingest logic (description capture, auto-enrich tags, media roles)
#   against existing creator data from scratch.
# - Forcing older posts to be re-ingested in a dev/test bed.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\maintenance-reset-ingest.ps1
#
# Recommended flow:
# 1) Run backup first:
#    powershell -ExecutionPolicy Bypass -File .\scripts\maintenance-backup.ps1 -Label "pre-reset"
# 2) Run this script.
# 3) Re-trigger scrape with dry_run=false.
#
# Optional flags:
#   -AlsoClearCookie      Clears patreon_cookies.json (forces OAuth-only scrape until cookie re-added)
#   -AlsoClearOAuth       Clears patreon_credentials.json (forces OAuth exchange again)
#   -AlsoClearGalleryData Clears gallery overlays/collections/layout/saved filters (normally KEEP these)
#
# Notes:
# - By default, this preserves formatting overlays so you can test "ingest does not overwrite curation."

param(
  [switch]$AlsoClearCookie,
  [switch]$AlsoClearOAuth,
  [switch]$AlsoClearGalleryData
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$DataRoot = Join-Path $RepoRoot ".relay-data"

if (-not (Test-Path $DataRoot)) {
  Write-Warning "No .relay-data folder found at: $DataRoot"
  exit 0
}

function Remove-IfExists([string]$PathValue) {
  if (Test-Path $PathValue) {
    Remove-Item -Path $PathValue -Force -Recurse
    Write-Host "  removed: $PathValue"
  } else {
    Write-Host "  skip (not found): $PathValue"
  }
}

Write-Host "Resetting ingestion state..."

# Core ingest reset targets (safe defaults for backfill tests)
Remove-IfExists (Join-Path $DataRoot "canonical.json")
Remove-IfExists (Join-Path $DataRoot "ingest_dlq.json")
Remove-IfExists (Join-Path $DataRoot "patreon_sync_watermarks.json")
Remove-IfExists (Join-Path $DataRoot "exports")

if ($AlsoClearCookie) {
  Remove-IfExists (Join-Path $DataRoot "patreon_cookies.json")
}

if ($AlsoClearOAuth) {
  Remove-IfExists (Join-Path $DataRoot "patreon_credentials.json")
}

if ($AlsoClearGalleryData) {
  Remove-IfExists (Join-Path $DataRoot "gallery_post_overrides.json")
  Remove-IfExists (Join-Path $DataRoot "gallery_saved_filters.json")
  Remove-IfExists (Join-Path $DataRoot "collections.json")
  Remove-IfExists (Join-Path $DataRoot "page_layout.json")
}

Write-Host ""
Write-Host "Done."
Write-Host "Next: run your scrape (dry_run=false) to rebuild canonical state."
