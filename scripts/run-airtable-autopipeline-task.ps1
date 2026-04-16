#Requires -Version 5.1
<#
.SYNOPSIS
  Runs Cursor Agent CLI against a pregenerated beat prompt + optional delta-in file (Airtable writing pipeline).

.DESCRIPTION
  See Story Blocks/docs/AIRTABLE_WRITING_PIPELINE.md. This script does NOT call the Airtable API unless you extend it;
  it reads prompt/delta files from Story Blocks/Airtable Drops/ first, then legacy docs/Airtable Drops/.
  Override pack root with env STORY_BLOCKS_DIR (absolute path) if the pack is not at <RepoRoot>/Story Blocks.

.PARAMETER TaskKey
  e.g. T-001 — selects Story Blocks/Airtable Drops/prompts/<TaskKey>-prompt.md (or legacy docs/Airtable Drops/prompts/)

.PARAMETER RepoRoot
  Repository root (defaults to parent of scripts/)

.PARAMETER SkipAgent
  If set, only prints the bundled prompt to stdout (dry run).

.PARAMETER Model
  Cursor Agent CLI model id (see agent --help). Default: composer-2 (Composer 2) for repeatable runs.

.PARAMETER ToneFile
  Optional path to a story tone/theme markdown file. When set, this file is used instead of the default
  Story Blocks/Airtable Drops/story/TONE.md (see Story Blocks/docs/AIRTABLE_WRITING_TONE_THEMES.md).

.EXAMPLE
  .\scripts\run-airtable-autopipeline-task.ps1 -TaskKey "T-001"
.EXAMPLE
  .\scripts\run-airtable-autopipeline-task.ps1 -TaskKey "T-001" -Model "composer-2-fast"
.EXAMPLE
  .\scripts\run-airtable-autopipeline-task.ps1 -TaskKey "S01-CH01-B01" -ToneFile "C:\work\my-story\TONE-alt.md"
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $TaskKey,

  # Prefer passing from autopipeline-runner.mjs; default must not use $PSScriptRoot in param() — it can be empty when spawned with -File.
  [string] $RepoRoot = "",

  [string] $Model = "composer-2",

  [string] $ToneFile = "",

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

$storyBlocksRoot = if (-not [string]::IsNullOrWhiteSpace($env:STORY_BLOCKS_DIR)) {
  $env:STORY_BLOCKS_DIR
} else {
  Join-Path $RepoRoot "Story Blocks"
}

$promptPrimary = Join-Path $storyBlocksRoot "Airtable Drops\prompts\$TaskKey-prompt.md"
$promptLegacy = Join-Path $RepoRoot "docs\Airtable Drops\prompts\$TaskKey-prompt.md"
$promptFile = $null
if (Test-Path -LiteralPath $promptPrimary) {
  $promptFile = $promptPrimary
} elseif (Test-Path -LiteralPath $promptLegacy) {
  $promptFile = $promptLegacy
}
if (-not $promptFile) {
  throw "Missing prompt file for TaskKey '$TaskKey'. Tried: $promptPrimary ; $promptLegacy (see Story Blocks/docs/AIRTABLE_WRITING_PIPELINE.md and Story Blocks/Airtable Drops/prompts/BEAT-TEMPLATE-prompt.md)"
}

$deltaPrimary = Join-Path $storyBlocksRoot "Airtable Drops\incoming\$TaskKey-delta-in.md"
$deltaLegacy = Join-Path $RepoRoot "docs\Airtable Drops\incoming\$TaskKey-delta-in.md"
$deltaIn = if (Test-Path -LiteralPath $deltaPrimary) {
  Get-Content -LiteralPath $deltaPrimary -Raw
} elseif (Test-Path -LiteralPath $deltaLegacy) {
  Get-Content -LiteralPath $deltaLegacy -Raw
} else {
  "(no delta-in file; optional)"
}

$promptBody = Get-Content $promptFile -Raw

$defaultTonePrimary = Join-Path $storyBlocksRoot "Airtable Drops\story\TONE.md"
$defaultToneLegacy = Join-Path $RepoRoot "docs\Airtable Drops\story\TONE.md"
$toneResolved = ""
if (-not [string]::IsNullOrWhiteSpace($ToneFile)) {
  $toneResolved = $ToneFile
} elseif (Test-Path -LiteralPath $defaultTonePrimary) {
  $toneResolved = $defaultTonePrimary
} else {
  $toneResolved = $defaultToneLegacy
}

$toneSection = ""
if (Test-Path -LiteralPath $toneResolved) {
  $toneRaw = Get-Content -LiteralPath $toneResolved -Raw
  if (-not [string]::IsNullOrWhiteSpace($toneRaw)) {
    $toneSection = @"

## Story tone & theme (artist control — optional file)
$toneRaw

"@
  }
}

$bundle = @"
## Canonical prompt (from repo)
$promptBody
$toneSection## Delta In (from previous beat — delta only)
$deltaIn

## Instructions
- Honor **Story tone & theme** above when present; then follow the beat prompt: scope, non-goals, **tone & theme** section, and **acceptance rubric** for this pass (outline, draft, line edit, continuity, etc.).
- At the end, write **Delta Out** for the next beat per Story Blocks/docs/AIRTABLE_WRITING_PIPELINE.md (continuity, threads, voice, **tone/theme mix if changed**, risks, next-step hint).
- If a **human gate** applies (sensitivity, major plot fork, voice/continuity break, or you cannot satisfy the rubric), stop; the operator sets **Stopped_OffScript** / **Off Script** in Airtable.
"@

if ($SkipAgent) {
  Write-Output $bundle
  exit 0
}

& $agentInfo.Command --model $Model --print --trust --workspace $RepoRoot --output-format json -- $bundle
exit $LASTEXITCODE
