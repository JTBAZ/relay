# Stop local Relay dev listeners (API + Next web) and repo-scoped node processes.
# Dot-source or call from dev restart scripts. Repo root = parent of scripts/.

param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $RepoRoot ".env"

function Write-KillLog {
  param([string]$Message)
  if (-not $Quiet) {
    Write-Host $Message
  }
}

function Stop-ListenersOnPort {
  param(
    [int]$Port,
    [string]$Label
  )

  $conns = @(
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.OwningProcess -and $_.OwningProcess -ne 0 }
  )
  if (-not $conns) {
    return
  }

  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    try {
      $p = Get-Process -Id $procId -ErrorAction Stop
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-KillLog "  Stopped PID $procId ($($p.ProcessName) on $Label port $Port)"
    } catch {
      Write-Warning "  Could not stop listener on port ${Port} (PID $procId): $($_.Exception.Message)"
    }
  }
}

function Stop-RepoNodeProcesses {
  $patterns = @(
    [regex]::Escape($RepoRoot),
    [regex]::Escape((Join-Path $RepoRoot "dist\src\main.js")),
    [regex]::Escape((Join-Path $RepoRoot "web"))
  )

  $nodeProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      if ($_.Name -ne "node.exe" -or -not $_.CommandLine) {
        return $false
      }
      foreach ($pattern in $patterns) {
        if ($_.CommandLine -match $pattern) {
          return $true
        }
      }
      return $false
    }

  foreach ($proc in $nodeProcs) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      Write-KillLog "  Stopped repo node PID $($proc.ProcessId)"
    } catch {
      Write-Warning "  Could not stop PID $($proc.ProcessId): $($_.Exception.Message)"
    }
  }
}

$relayPort = 8787
if (Test-Path -LiteralPath $EnvFile) {
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ($line -match '^\s*PORT\s*=\s*(\d+)\s*(?:#.*)?$') {
      $relayPort = [int]$Matches[1]
      break
    }
  }
}

Write-KillLog "Stopping Relay dev processes..."
Stop-RepoNodeProcesses
Stop-ListenersOnPort -Port $relayPort -Label "relay API"
Stop-ListenersOnPort -Port 3000 -Label "web (Next.js)"

Start-Sleep -Seconds 1
