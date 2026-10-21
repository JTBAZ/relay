$ErrorActionPreference = 'Stop'
$relayLog = 'work/pcb01-root-tests.log'
$relayExit = 'work/pcb01-root-tests.exit.json'
if ((Test-Path -LiteralPath $relayLog) -or (Test-Path -LiteralPath $relayExit) -or (Test-Path -LiteralPath 'work/pcb01-root-tests.json')) { throw 'Root test evidence already exists.' }
& npx.cmd vitest run tests/editor-bench/real-library-conversation-routes.test.ts tests/editor-bench/large-library-chat.test.ts tests/editor-bench/real-library-retrieval.test.ts tests/editor-bench/real-library-selection.test.ts tests/editor-bench/conversation.test.ts tests/editor-bench/runtime.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --reporter=json --outputFile=work/pcb01-root-tests.json *> $relayLog
$relayCode = $LASTEXITCODE
[ordered]@{command = 'Focused real Library Conversation, shared retrieval/selection, mock Conversation and budgeted runtime backend tests'; exitCode = $relayCode; log = $relayLog} | ConvertTo-Json | Set-Content -LiteralPath $relayExit
Get-Content -LiteralPath $relayExit
exit $relayCode
