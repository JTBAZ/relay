$ErrorActionPreference = 'Stop'
$relayRoot = 'C:\Users\jorda\Documents\Codex\2026-10-11\c\work\relay'
if (@(Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue).Count -gt 0) { throw 'An unexpected API is already listening; no process changed.' }
if (Test-Path -LiteralPath 'work/bgb03-runtime.json') { throw 'Runtime evidence exists.' }
if (Test-Path -LiteralPath 'work/bgb03-reload-attempt-02.json') { throw 'Failure evidence exists.' }
[ordered]@{ pid = 48764; exitCode = 1; pollingStoppedAfterFatalExit = $true; error = 'Shared Patreon session storage is required in split-worker mode'; stdout = 'work/bgb03-api-02.out.log'; stderr = 'work/bgb03-api-02.err.log' } | ConvertTo-Json | Set-Content -LiteralPath 'work/bgb03-reload-attempt-02.json'
$env:NODE_ENV = 'development'
$env:PORT = '8788'
$env:LOG_PRETTY = '0'
$env:RELAY_EDITOR_BENCH_LIVE = '1'
$env:RELAY_SPLIT_WORKER_PROCESS = '1'
$env:RELAY_DB_STORE_PATREON_COOKIE = '1'
$relayStarted = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'dist/src/main.js' -WorkingDirectory $relayRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $relayRoot 'work/bgb03-api-03.out.log') -RedirectStandardError (Join-Path $relayRoot 'work/bgb03-api-03.err.log') -PassThru
$relayHealth = 0
for ($relayAttempt = 0; $relayAttempt -lt 25; $relayAttempt++) {
  Start-Sleep -Milliseconds 500
  $relayStarted.Refresh()
  if ($relayStarted.HasExited) { throw "API process exited with $($relayStarted.ExitCode); see attempt 03 logs." }
  try { $relayHealth = (Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8788/api/v1/health' -TimeoutSec 1).StatusCode } catch { $relayHealth = 0 }
  if ($relayHealth -eq 200) { break }
}
if ($relayHealth -ne 200) { throw 'API retry did not become healthy.' }
$relayProtected = @{}
foreach ($relayPath in @('conversation/cell/skip','conversation/cell/restore','conversation/x-draft/review','conversation/deviantart-draft/review')) {
  try { $relayStatus = (Invoke-WebRequest -UseBasicParsing -Method Post -Uri ('http://localhost:8788/api/v1/editor-bench/schedule/' + $relayPath) -ContentType 'application/json' -Body '{}' -TimeoutSec 5).StatusCode } catch { $relayStatus = [int]$_.Exception.Response.StatusCode }
  if ($relayStatus -ne 401) { throw "Unexpected unauthenticated response: $relayPath = $relayStatus" }
  $relayProtected[$relayPath] = $relayStatus
}
$relayResult = [ordered]@{ port = 8788; previousPid = 47096; pid = $relayStarted.Id; startedAt = [DateTime]::UtcNow.ToString('o'); health = $relayHealth; protectedPosts = $relayProtected; backgroundWorkersDisabled = $true; temporarySessionsCleared = $true; browserTested = $false; processOnlyOverrides = @('LOG_PRETTY=0','RELAY_DB_STORE_PATREON_COOKIE=1'); configurationFilesChanged = $false; startupFailures = @('work/bgb03-reload-attempt-01.json','work/bgb03-reload-attempt-02.json') }
$relayResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'work/bgb03-runtime.json'
$relayResult | ConvertTo-Json -Depth 6
