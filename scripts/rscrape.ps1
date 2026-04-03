# Patreon live scrape — backward-compatible entry; prefer scripts\rls.ps1 + profile function `rls`.
$ErrorActionPreference = "Stop"
& "$PSScriptRoot\relay-live-scrape.ps1" @args
