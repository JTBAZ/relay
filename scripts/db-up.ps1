# Start local Postgres for Rescue (docker compose).
#
# From repo root:
#   .\scripts\db-up.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\db-up.ps1
#
# Runs `docker compose up -d` and checks readiness with pg_isready (same defaults as root `.env.example` DATABASE_URL).

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$cwd = (Get-Location).Path
if ($cwd -notlike "$RepoRoot*") {
  Write-Error "Run from inside the Rescue repo (current: $cwd). Repo root: $RepoRoot"
  exit 1
}

Push-Location $RepoRoot
try {
  docker compose up -d
  $q = docker compose ps -q postgres 2>$null
  if (-not $q) {
    Write-Error "postgres service not found after docker compose up."
    exit 1
  }
  docker compose exec -T postgres pg_isready -U relay -d relay_dev
  Write-Host "Local Postgres is ready. DATABASE_URL=postgresql://relay:relay@localhost:5433/relay_dev"
} finally {
  Pop-Location
}
