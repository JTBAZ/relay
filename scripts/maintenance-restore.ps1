# Rescue maintenance helper: restore .relay-data from a backup snapshot
#
# Best for:
# - Reverting to a known-good local state after experiments.
# - Recovering from an accidental reset.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\maintenance-restore.ps1 -BackupName "<folder-under-.relay-backups>"
#
# Example:
#   powershell -ExecutionPolicy Bypass -File .\scripts\maintenance-restore.ps1 -BackupName "20260331-123000-pre-reset"
#
# Notes:
# - This replaces current .relay-data contents with selected backup.
# - Run backup first if you want to keep current state too.

param(
  [Parameter(Mandatory = $true)]
  [string]$BackupName
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$DataRoot = Join-Path $RepoRoot ".relay-data"
$BackupRoot = Join-Path $RepoRoot ".relay-backups"
$Source = Join-Path $BackupRoot $BackupName

if (-not (Test-Path $Source)) {
  Write-Error "Backup not found: $Source"
  exit 1
}

if (Test-Path $DataRoot) {
  Remove-Item -Path (Join-Path $DataRoot "*") -Recurse -Force -ErrorAction SilentlyContinue
} else {
  New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
}

Copy-Item -Path (Join-Path $Source "*") -Destination $DataRoot -Recurse -Force

Write-Host "Restore complete:"
Write-Host "  Source: $Source"
Write-Host "  Target: $DataRoot"
