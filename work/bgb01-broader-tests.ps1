$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath 'work/bgb01-tests.json') { throw 'Broader test evidence already exists.' }
$ErrorActionPreference = 'Continue'
npx.cmd vitest run tests/editor-bench tests/distribution-platform-formatters.test.ts tests/distribution-media-binding.test.ts tests/distribution-package.test.ts tests/post-distribution-identity.test.ts tests/conversational-planning/calendar-resolver.test.ts tests/extension/bench-x-handoff-contract.test.ts tests/extension/bench-x-handoff-fetch.test.ts tests/extension/bench-deviantart-handoff-contract.test.ts tests/extension/bench-deviantart-handoff-fetch.test.ts tests/extension/schedule-event-cross-post-transport.test.ts tests/extension/schedule-event-cross-post-package.test.ts tests/extension/schedule-event-cross-post-flow.test.ts tests/extension/dev-api-port.test.ts --testTimeout=30000 --reporter=json --outputFile=work/bgb01-tests.json *> work/bgb01-tests.log
$relayTestExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
@{ command = 'Scoped backend and pure Node transport suite; no frontend tests'; exitCode = $relayTestExit } | ConvertTo-Json | Set-Content -LiteralPath 'work/bgb01-tests.exit.json'
if (Test-Path -LiteralPath 'work/bgb01-tests.json') {
  $relayTests = Get-Content -LiteralPath 'work/bgb01-tests.json' -Raw | ConvertFrom-Json
  @{ passed = $relayTests.numPassedTests; failed = $relayTests.numFailedTests; files = $relayTests.numTotalTestSuites; exitCode = $relayTestExit } | ConvertTo-Json
}
exit $relayTestExit
