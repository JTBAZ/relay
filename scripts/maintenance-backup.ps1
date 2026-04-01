# Rescue maintenance helper: backup .relay-data
#
# Best for:
# - Taking a snapshot before any reset/backfill test.
# - Creating rollback points before schema/ingestion experiments.
#
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File .\scripts\maintenance-backup.ps1
#
# Optional:
#   powershell -ExecutionPolicy Bypass -File .\scripts\maintenance-backup.ps1 -Label "before-backfill"
#
# Result:
# - Creates .relay-backups\YYYYMMDD-HHMMSS[-Label]\ and copies .relay-data contents.

param(
  [string]$Label = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$DataRoot = Join-Path $RepoRoot ".relay-data"
$BackupRoot = Join-Path $RepoRoot ".relay-backups"

if (-not (Test-Path $DataRoot)) {
  Write-Warning "No .relay-data folder found at: $DataRoot"
  exit 0
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeLabel = if ($Label.Trim()) { "-$($Label -replace '[^a-zA-Z0-9._-]', '_')" } else { "" }
$target = Join-Path $BackupRoot "$stamp$safeLabel"

New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -Path (Join-Path $DataRoot "*") -Destination $target -Recurse -Force

Write-Host "Backup complete:"
Write-Host "  Source: $DataRoot"
Write-Host "  Target: $target"
