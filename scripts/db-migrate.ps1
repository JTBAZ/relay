# Local migration helper: interactive `prisma migrate dev` (creates/applies migrations from prisma/schema.prisma).
#
# From repo root:
#   .\scripts\db-migrate.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\db-migrate.ps1
#
# Requires DATABASE_URL in root `.env` (see `.env.example`). Start Postgres first: `.\scripts\db-up.ps1` or `docker compose up -d`.
# Extra args are forwarded to Prisma, e.g. `.\scripts\db-migrate.ps1 --create-only --name add_users`.

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$cwd = (Get-Location).Path
if ($cwd -notlike "$RepoRoot*") {
  Write-Error "Run from inside the Rescue repo (current: $cwd). Repo root: $RepoRoot"
  exit 1
}

Push-Location $RepoRoot
try {
  npx prisma migrate dev @args
} finally {
  Pop-Location
}
