# Dev restart helper for Rescue (Windows PowerShell)
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev-restart.ps1
#
# What this does:
# 1) Stops existing Node processes that are running from this Rescue repo path.
# 2) Starts backend API in a new PowerShell window: npm start (repo root).
# 3) Starts frontend app in another new PowerShell window: npm run dev (web folder).
#
# Notes:
# - This is intended for local dev convenience ("flash refresh" both services).
# - Repo root is inferred from this script location (scripts/ -> parent).
# - Stopping by CommandLine often misses `node dist/src/main.js` because the path
#   may be relative (no $RepoRoot in Win32 CommandLine). We also stop listeners
#   on RELAY_PORT / PORT (from repo .env) and Next default 3000 so the API/UI
#   actually restart instead of leaving an old process bound to the port.
# - If you use PowerShell 7 (`pwsh`), this still works when invoked via powershell.

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$WebRoot = Join-Path $RepoRoot "web"
$EnvFile = Join-Path $RepoRoot ".env"

function Stop-ListenersOnPort {
  param([int]$Port, [string]$Label)

  $conns = @(
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.OwningProcess -and $_.OwningProcess -ne 0 }
  )
  if (-not $conns) { return }

  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    try {
      $p = Get-Process -Id $procId -ErrorAction Stop
      if ($p.ProcessName -ne "node") {
        continue
      }
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Host "  Stopped node PID $procId (listener on $Label port $Port)"
    } catch {
      Write-Warning "  Could not stop listener on port ${Port} (PID $procId): $($_.Exception.Message)"
    }
  }
}

Write-Host "Stopping existing Rescue node processes..."

$nodeProcs = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -and
    $_.CommandLine -match [regex]::Escape($RepoRoot)
  }

foreach ($proc in $nodeProcs) {
  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    Write-Host "  Stopped PID $($proc.ProcessId)"
  } catch {
    Write-Warning "  Could not stop PID $($proc.ProcessId): $($_.Exception.Message)"
  }
}

$relayPort = 8787
if (Test-Path -LiteralPath $EnvFile) {
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ($line -match '^\s*PORT\s*=\s*(\d+)\s*$') {
      $relayPort = [int]$Matches[1]
      break
    }
  }
}
Stop-ListenersOnPort -Port $relayPort -Label "relay"
# Next.js dev (package.json pins hostname 127.0.0.1; default port 3000)
Stop-ListenersOnPort -Port 3000 -Label "web"

# Brief pause so the OS releases listen sockets before rebuild/start.
Start-Sleep -Seconds 1

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
Write-Host "Open the web UI at the URL shown in the frontend window (http://127.0.0.1:3000)."
Write-Host "If you still use http://localhost:3000 and see connection refused, use 127.0.0.1 instead (IPv4 vs IPv6 loopback on Windows)."
