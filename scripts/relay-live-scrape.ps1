# POST /api/v1/patreon/scrape — live ingest (dry_run=false) unless -DryRun is passed.
#
# Env overrides (optional):
#   RELAY_API_URL     — e.g. http://127.0.0.1:8787 (default: PORT from repo .env or 8787)
#   RELAY_CREATOR_ID  — creator_id (default: dev_creator)

[CmdletBinding()]
param(
  [string]$CreatorId,
  [int]$MaxPostPages = 20,
  [string]$CampaignId,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$cwd = (Get-Location).Path
if ($cwd -notlike "$RepoRoot*") {
  Write-Error "Run from inside the Rescue repo (current: $cwd). Repo root: $RepoRoot"
  exit 1
}

$relayPort = 8787
$envFile = Join-Path $RepoRoot ".env"
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*PORT\s*=\s*(\d+)\s*$') {
      $relayPort = [int]$Matches[1]
      break
    }
  }
}

$api = "http://127.0.0.1:$relayPort"
if ($env:RELAY_API_URL -and $env:RELAY_API_URL.Trim()) {
  $api = $env:RELAY_API_URL.Trim().TrimEnd('/')
}

$creator = "dev_creator"
if ($CreatorId -and $CreatorId.Trim()) {
  $creator = $CreatorId.Trim()
} elseif ($env:RELAY_CREATOR_ID -and $env:RELAY_CREATOR_ID.Trim()) {
  $creator = $env:RELAY_CREATOR_ID.Trim()
}

$bodyObj = [ordered]@{
  creator_id      = $creator
  dry_run         = $DryRun.IsPresent
  max_post_pages  = $MaxPostPages
}
if ($CampaignId -and $CampaignId.Trim()) {
  $bodyObj.campaign_id = $CampaignId.Trim()
}
$body = $bodyObj | ConvertTo-Json -Compress

$mode = if ($DryRun) { "dry_run" } else { "live" }
Write-Host "POST $api/api/v1/patreon/scrape ($mode, creator_id=$creator, max_post_pages=$MaxPostPages)..."
try {
  $response = Invoke-RestMethod -Method POST -Uri "$api/api/v1/patreon/scrape" `
    -ContentType "application/json" -Body $body
  $response | ConvertTo-Json -Depth 12
} catch {
  Write-Error $_
  exit 1
}
