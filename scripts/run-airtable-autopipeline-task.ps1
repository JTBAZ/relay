#Requires -Version 5.1
<#
.SYNOPSIS
  Runs Cursor Agent CLI against a pregenerated prompt + optional delta-in file (Airtable auto-pipeline).

.DESCRIPTION
  See docs/database/AIRTABLE_AUTOPIPELINE.md. This script does NOT call the Airtable API unless you extend it;
  it reads prompt/delta files from docs/Airtable Drops/.

.PARAMETER TaskKey
  e.g. T-001 — selects docs/Airtable Drops/prompts/<TaskKey>-prompt.md

.PARAMETER RepoRoot
  Repository root (defaults to parent of scripts/)

.PARAMETER SkipAgent
  If set, only prints the bundled prompt to stdout (dry run).

.PARAMETER Model
  Cursor Agent CLI model id (see agent --help). Default: composer-2 (Composer 2) for repeatable runs.

.EXAMPLE
  .\scripts\run-airtable-autopipeline-task.ps1 -TaskKey "T-001"
.EXAMPLE
  .\scripts\run-airtable-autopipeline-task.ps1 -TaskKey "T-001" -Model "composer-2-fast"
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $TaskKey,

  # Prefer passing from autopipeline-runner.mjs; default must not use $PSScriptRoot in param() — it can be empty when spawned with -File.
  [string] $RepoRoot = "",

  [string] $Model = "composer-2",

  [switch] $SkipAgent
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $scriptDir = $PSScriptRoot
  if ([string]::IsNullOrWhiteSpace($scriptDir)) {
    $scriptDir = Split-Path -Parent -LiteralPath $MyInvocation.MyCommand.Path
  }
  if ([string]::IsNullOrWhiteSpace($scriptDir)) {
    throw "Could not resolve repository root: pass -RepoRoot or run from a context where the script path is known."
  }
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
}

function Get-AgentInvocation {
  if (Get-Command agent -ErrorAction SilentlyContinue) {
    return @{ Command = "agent"; IsScript = $false }
  }
  $ps1 = Join-Path $env:LOCALAPPDATA "cursor-agent\agent.ps1"
  if (Test-Path $ps1) {
    return @{ Command = $ps1; IsScript = $true }
  }
  throw "Cursor CLI 'agent' not found. Install: irm 'https://cursor.com/install?win32=true' | iex"
}

$agentInfo = Get-AgentInvocation
$promptFile = Join-Path $RepoRoot "docs\Airtable Drops\prompts\$TaskKey-prompt.md"
$deltaInFile = Join-Path $RepoRoot "docs\Airtable Drops\incoming\$TaskKey-delta-in.md"

if (-not (Test-Path $promptFile)) {
  throw "Missing prompt file: $promptFile (create per AIRTABLE_AUTOPIPELINE.md)"
}

$deltaIn = if (Test-Path $deltaInFile) {
  Get-Content $deltaInFile -Raw
} else {
  "(no delta-in file; optional)"
}

$promptBody = Get-Content $promptFile -Raw

$bundle = @"
## Canonical prompt (from repo)
$promptBody

## Delta In (from previous task — delta only)
$deltaIn

## Instructions
- Follow the prompt validation steps.
- At the end, write Delta Out for the next task per docs/database/AIRTABLE_AUTOPIPELINE.md.
- If work is off-script or blocked (login, scope), stop; the operator will set Stopped_OffScript / Off Script in Airtable.
"@

if ($SkipAgent) {
  Write-Output $bundle
  exit 0
}

& $agentInfo.Command --model $Model --print --trust --workspace $RepoRoot --output-format json -- $bundle
exit $LASTEXITCODE
