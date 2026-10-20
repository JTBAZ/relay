$ErrorActionPreference = 'Stop'
$relayRoot = 'C:\Users\jorda\Documents\Codex\2026-10-11\c\work\relay'
$priorRuntime = Get-Content -LiteralPath (Join-Path $relayRoot 'work/bda01-runtime.json') -Raw | ConvertFrom-Json
$relayApiPids = @(Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
if ($relayApiPids.Count -ne 1 -or $relayApiPids[0] -ne $priorRuntime.pid) { throw 'API listener differs from the verified prior runtime; no process was stopped.' }
$relayApiProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($relayApiPids[0])"
if ($relayApiProcess.Name -ne 'node.exe' -or $relayApiProcess.CommandLine -notmatch 'dist[/\\]src[/\\]main\.js') { throw 'API command does not match the known local API; no process was stopped.' }
$relayRuntimePath = Join-Path $relayRoot 'work/bgb01-runtime.json'
if (Test-Path -LiteralPath $relayRuntimePath) { throw 'Runtime evidence already exists.' }
Stop-Process -Id $relayApiPids[0]
$env:NODE_ENV = 'development'
$env:PORT = '8788'
$env:RELAY_EDITOR_BENCH_LIVE = '1'
$env:RELAY_SPLIT_WORKER_PROCESS = '1'
$relayStarted = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'dist/src/main.js' -WorkingDirectory $relayRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $relayRoot 'work/bgb01-api.out.log') -RedirectStandardError (Join-Path $relayRoot 'work/bgb01-api.err.log') -PassThru
$relayHealth = 0
for ($relayAttempt = 0; $relayAttempt -lt 35; $relayAttempt++) {
  Start-Sleep -Milliseconds 500
  try { $relayHealth = (Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8788/health' -TimeoutSec 2).StatusCode } catch { $relayHealth = 0 }
  if ($relayHealth -eq 200) { break }
}
if ($relayHealth -ne 200) { throw 'Reloaded API did not become healthy.' }
$relayProtected = @{}
foreach ($relayPath in @('conversation/cell/skip','conversation/cell/restore','conversation/x-draft/review','conversation/deviantart-draft/review')) {
  try { $relayStatus = (Invoke-WebRequest -UseBasicParsing -Method Post -Uri ('http://localhost:8788/api/v1/editor-bench/schedule/' + $relayPath) -ContentType 'application/json' -Body '{}' -TimeoutSec 5).StatusCode } catch { $relayStatus = [int]$_.Exception.Response.StatusCode }
  if ($relayStatus -ne 401) { throw "Unexpected unauthenticated route response: $relayPath = $relayStatus" }
  $relayProtected[$relayPath] = $relayStatus
}
$relayResult = [ordered]@{ port = 8788; previousPid = $relayApiPids[0]; pid = $relayStarted.Id; startedAt = [DateTime]::UtcNow.ToString('o'); health = $relayHealth; protectedPosts = $relayProtected; backgroundWorkersDisabled = $true; temporarySessionsCleared = $true; browserTested = $false }
$relayResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $relayRuntimePath
$relayResult | ConvertTo-Json -Depth 6
