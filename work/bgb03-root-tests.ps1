$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath 'work/bgb03-root-tests.json') { throw 'Root test evidence already exists.' }
$ErrorActionPreference = 'Continue'
npx.cmd vitest run tests/editor-bench/conversation.test.ts tests/editor-bench/runtime.test.ts tests/editor-bench/distribution-variant-adapter.test.ts --testTimeout=30000 --reporter=json --outputFile=work/bgb03-root-tests.json *> work/bgb03-root-tests.log
$relayTestExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
@{ exitCode = $relayTestExit; command = 'Conversation, budgeted runtime and draft adapter backend tests only' } | ConvertTo-Json | Set-Content -LiteralPath work/bgb03-root-tests.exit.json
if (Test-Path -LiteralPath 'work/bgb03-root-tests.json') {
  $relayResults = Get-Content -LiteralPath 'work/bgb03-root-tests.json' -Raw | ConvertFrom-Json
  @{ passed = $relayResults.numPassedTests; failed = $relayResults.numFailedTests; files = $relayResults.testResults.Count; exitCode = $relayTestExit } | ConvertTo-Json
}
exit $relayTestExit
