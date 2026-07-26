# Dev restart helper for Rescue (Windows PowerShell)
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev-restart.ps1
#   npm run dev:restart
#
# Opens API + web in separate terminal windows after killing stale listeners.
# For one terminal (same as dev:stack), use: npm run dev:stack:restart

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$WebRoot = Join-Path $RepoRoot "web"

& (Join-Path $RepoRoot "scripts\kill-relay-dev-ports.ps1")

Write-Host "Rebuilding backend (npm run build)..."
Push-Location -LiteralPath $RepoRoot
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Error "Build failed -- aborting restart."
  Pop-Location
  exit 1
}
Pop-Location

Write-Host "Starting backend (npm start)..."
Start-Process powershell -ArgumentList @(
  "-NoProfile",
  "-NoExit",
  "-Command",
  "& { Set-Location -LiteralPath '$RepoRoot'; npm start }"
)

Write-Host "Starting frontend (npm run dev in web/)..."
Start-Process powershell -ArgumentList @(
  "-NoProfile",
  "-NoExit",
  "-Command",
  "& { Set-Location -LiteralPath '$WebRoot'; npm run dev }"
)

Write-Host "Done. Two new terminal windows were opened."
Write-Host "Open the web UI at http://localhost:3000 (or http://127.0.0.1:3000)."
Write-Host "For a single terminal instead, run: npm run dev:stack:restart"
