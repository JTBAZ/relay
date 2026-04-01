# Patreon live scrape (POST /api/v1/patreon/scrape, dry_run=false).
#
# Use this when your terminal does not load $PROFILE (e.g. Cursor often uses -NoProfile),
# so the `rscrape` function is missing.
#
# From repo root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\rscrape.ps1
#
# Optional env:
#   $env:RELAY_API_URL = "http://127.0.0.1:8787"
#   $env:RELAY_CREATOR_ID = "dev_creator"

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$cwd = (Get-Location).Path
if ($cwd -notlike "$RepoRoot*") {
  Write-Error "Run from inside the Rescue repo (current: $cwd). Repo root: $RepoRoot"
  exit 1
}

$api = "http://127.0.0.1:8787"
if ($env:RELAY_API_URL -and $env:RELAY_API_URL.Trim()) {
  $api = $env:RELAY_API_URL.Trim().TrimEnd('/')
}

$creator = "dev_creator"
if ($env:RELAY_CREATOR_ID -and $env:RELAY_CREATOR_ID.Trim()) {
  $creator = $env:RELAY_CREATOR_ID.Trim()
}

$body = @{
  creator_id     = $creator
  dry_run        = $false
  max_post_pages = 20
} | ConvertTo-Json -Compress

Write-Host "POST $api/api/v1/patreon/scrape (creator_id=$creator)..."
try {
  $response = Invoke-RestMethod -Method POST -Uri "$api/api/v1/patreon/scrape" `
    -ContentType "application/json" -Body $body
  $response | ConvertTo-Json -Depth 8
} catch {
  Write-Error $_
  exit 1
}
