# Restart Relay dev stack in the current terminal (like npm run dev:stack, but fresh).
#
# Usage (from repo root):
#   npm run dev:stack:restart
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev-stack-restart.ps1
#
# 1) Kills listeners on API port (PORT from .env, default 8787) and web port 3000.
# 2) Stops node processes tied to this repo (API, Next, concurrently children).
# 3) Runs npm run dev:stack in this window (build + API + web via concurrently).

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot

& (Join-Path $RepoRoot "scripts\kill-relay-dev-ports.ps1")

Write-Host ""
Write-Host "Starting dev stack (npm run dev:stack)..."
Write-Host "Press Ctrl+C to stop API and web together."
Write-Host ""

Push-Location -LiteralPath $RepoRoot
try {
  npm run dev:stack
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
