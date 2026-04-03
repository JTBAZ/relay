# Relay live scrape — thin wrapper for relay-live-scrape.ps1 (same as legacy rscrape.ps1).
#
# From repo root:
#   .\scripts\rls.ps1
#   .\scripts\rls.ps1 -CreatorId my_creator -MaxPostPages 5
#
# PowerShell profile (see scripts\README.md):
#   function rls { Push-Location $RelayRepo; try { & (Join-Path $RelayRepo 'scripts\rls.ps1') @args } finally { Pop-Location } }

$ErrorActionPreference = "Stop"
& "$PSScriptRoot\relay-live-scrape.ps1" @args
