# Relay dry scrape: POST /api/v1/patreon/scrape with dry_run=true and include_batch=true,
# then print a compact human-readable summary (no giant raw JSON).
#
# From repo root:
#   .\scripts\rds.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\rds.ps1
#
# Optional env:
#   $env:RELAY_API_URL = "http://127.0.0.1:8787"
#   $env:RELAY_CREATOR_ID = "dev_creator"
#   $env:RELAY_DRY_SCRAPE_MAX_PAGES = "100"   # 1-100, default 100 (full Patreon page budget)
#   $env:RELAY_DRY_SCRAPE_RESPECT_WATERMARK = "1"  # if set, do NOT force_refresh (faster; may return 0 posts)
#
# Optional: first arg = max post rows in table (default 30), e.g. .\scripts\rds.ps1 50
#
# Shell alias: add to $PROFILE (see scripts/README.md):
#   $RelayRepo = 'C:\path\to\Rescue'
#   function rds { & (Join-Path $RelayRepo 'scripts\rds.ps1') @args }

$ErrorActionPreference = "Stop"

$MaxPostRows = 30
if ($args.Count -ge 1) {
  $n = 0
  if ([int]::TryParse([string]$args[0], [ref]$n) -and $n -gt 0) {
    $MaxPostRows = $n
  }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$cwd = (Get-Location).Path
if ($cwd -notlike "$RepoRoot*") {
  Write-Error "Run from inside the Rescue repo (current: $cwd). Repo root: $RepoRoot"
  exit 1
}

$api = "http://127.0.0.1:8787"
if ($env:RELAY_API_URL -and $env:RELAY_API_URL.Trim()) {
  $api = $env:RELAY_API_URL.Trim().TrimEnd('/')
}

$creator = "dev_creator"
if ($env:RELAY_CREATOR_ID -and $env:RELAY_CREATOR_ID.Trim()) {
  $creator = $env:RELAY_CREATOR_ID.Trim()
}

$maxPostPages = 100
if ($env:RELAY_DRY_SCRAPE_MAX_PAGES -and $env:RELAY_DRY_SCRAPE_MAX_PAGES.Trim()) {
  $mp = 0
  if ([int]::TryParse($env:RELAY_DRY_SCRAPE_MAX_PAGES.Trim(), [ref]$mp)) {
    if ($mp -lt 1) { $mp = 1 }
    if ($mp -gt 100) { $mp = 100 }
    $maxPostPages = $mp
  }
}

# Bypass sync watermark so dry runs still list posts/media (same as live force_refresh).
# Set RELAY_DRY_SCRAPE_RESPECT_WATERMARK=1 for incremental-style preview only.
$forceRefresh = $true
if ($env:RELAY_DRY_SCRAPE_RESPECT_WATERMARK -eq "1") {
  $forceRefresh = $false
}

$body = @{
  creator_id                   = $creator
  dry_run                      = $true
  max_post_pages               = $maxPostPages
  include_batch                = $true
  force_refresh_post_access    = $forceRefresh
} | ConvertTo-Json -Compress

Write-Host ""
Write-Host "Relay dry scrape  (dry_run + include_batch)" -ForegroundColor Cyan
Write-Host "  API:         $api"
Write-Host "  creator_id:  $creator"
Write-Host "  max_post_pages: $maxPostPages  force_refresh_post_access: $forceRefresh"
Write-Host "  post preview rows: $MaxPostRows"
Write-Host ""

try {
  $response = Invoke-RestMethod -Method POST -Uri "$api/api/v1/patreon/scrape" `
    -ContentType "application/json" -Body $body
} catch {
  Write-Error $_
  exit 1
}

if ($response.error) {
  Write-Host "ERROR: $($response.error.message)" -ForegroundColor Red
  exit 1
}

$d = $response.data
if (-not $d) {
  Write-Host "Unexpected response (no data)." -ForegroundColor Red
  $response | ConvertTo-Json -Depth 6
  exit 1
}

Write-Host "=== Run ===" -ForegroundColor Yellow
$traceId = ""
if ($response.meta -and $response.meta.trace_id) { $traceId = $response.meta.trace_id }
[PSCustomObject]@{
  creator_id           = $d.creator_id
  patreon_campaign_id  = $d.patreon_campaign_id
  media_source         = $d.media_source
  pages_fetched        = $d.pages_fetched
  posts_fetched        = $d.posts_fetched
  trace_id             = $traceId
} | Format-List

if ($d.tier_access_summary) {
  $tas = $d.tier_access_summary
  Write-Host "Tier access: source=$($tas.media_source)  OAuth list updated $($tas.oauth_list_posts_updated) post(s) in $($tas.oauth_list_pages_fetched) page(s); per-post OAuth targets=$($tas.per_post_oauth_targets) (body $($tas.per_post_filled_body), tiers $($tas.per_post_filled_tiers))" -ForegroundColor DarkCyan
}

Write-Host "=== Summary (would ingest) ===" -ForegroundColor Yellow
if ($d.summary) {
  [PSCustomObject]@{
    campaigns    = $d.summary.campaigns
    tiers        = $d.summary.tiers
    posts        = $d.summary.posts
    media_items  = $d.summary.media_items
  } | Format-Table -AutoSize
} else {
  Write-Host "(no summary)"
}

Write-Host "=== Warnings ===" -ForegroundColor Yellow
if ($d.warnings -and $d.warnings.Count -gt 0) {
  $d.warnings | ForEach-Object { Write-Host "  - $_" }
} else {
  Write-Host "  (none)"
}

Write-Host ""
Write-Host "=== Tiers (from batch) ===" -ForegroundColor Yellow
$batch = $d.batch

$tiers = if ($batch) { $batch.tiers } else { $null }
if ($tiers -and $tiers.Count -gt 0) {
  $tiers | ForEach-Object {
    [PSCustomObject]@{
      tier_id       = $_.tier_id
      title         = $_.title
      amount_cents  = $_.amount_cents
      campaign_id   = $_.campaign_id
    }
  } | Format-Table -AutoSize -Wrap
  Write-Host "  Total tiers: $($tiers.Count)"
} elseif (-not $batch) {
  Write-Host "  (no batch in response - include_batch missing from API?)"
} else {
  Write-Host "  (no tiers in batch - check OAuth / campaign_id)"
}

Write-Host ""
Write-Host "=== Media (from batch posts) ===" -ForegroundColor Yellow
$batchForMedia = $d.batch
if ($batchForMedia -and $batchForMedia.posts -and @($batchForMedia.posts).Count -gt 0) {
  $totalMedia = 0
  $withUrls = 0
  $postsWithMedia = 0
  foreach ($p in @($batchForMedia.posts)) {
    $marr = @($p.media)
    if ($marr.Count -gt 0) { $postsWithMedia++ }
    foreach ($m in $marr) {
      $totalMedia++
      if ($m.upstream_url -and [string]$m.upstream_url.Trim()) { $withUrls++ }
    }
  }
  $pc = @($batchForMedia.posts).Count
  Write-Host "  Posts in batch: $pc"
  Write-Host "  Posts with >=1 media item: $postsWithMedia"
  Write-Host "  Total media attachments (rows): $totalMedia"
  Write-Host "  Media rows with upstream_url: $withUrls"
  if ($d.media_source -eq "oauth" -and $totalMedia -eq 0) {
    Write-Host "  Tip: OAuth-only path often has no images. POST /api/v1/patreon/cookie with session_id for cookie scrape." -ForegroundColor DarkYellow
  }
  if ($d.media_source -eq "cookie" -and $totalMedia -eq 0 -and $pc -gt 0) {
    Write-Host "  Tip: Posts exist but zero media - check Patreon post types or cookie session." -ForegroundColor DarkYellow
  }
} else {
  Write-Host "  (no posts in batch - nothing to count; tiers may still be from OAuth)"
  if ($d.media_source -eq "oauth") {
    Write-Host "  Tip: Store Patreon session cookie for media-rich dry runs." -ForegroundColor DarkYellow
  }
}

Write-Host ""
Write-Host "=== Posts: sample (API preview, up to 8) ===" -ForegroundColor Yellow
if ($d.sample_posts -and $d.sample_posts.Count -gt 0) {
  $d.sample_posts | ForEach-Object {
    $tid = if ($_.tier_ids) { $_.tier_ids -join ", " } else { "" }
    [PSCustomObject]@{
      post_id     = $_.post_id
      title       = $_.title
      published   = $_.published_at
      tier_ids    = $tid
      media_count = $_.media_count
    }
  } | Format-Table -AutoSize -Wrap
} else {
  Write-Host "  (none)"
}

Write-Host ""
$postCount = 0
if ($batch -and $batch.posts) { $postCount = @($batch.posts).Count }
Write-Host "=== Posts: batch preview (first $MaxPostRows of $postCount) ===" -ForegroundColor Yellow
$posts = if ($batch) { $batch.posts } else { $null }
if ($posts -and @($posts).Count -gt 0) {
  $slice = $posts | Select-Object -First $MaxPostRows
  $slice | ForEach-Object {
    $mc = 0
    if ($_.media) { $mc = @($_.media).Count }
    $tid = if ($_.tier_ids) { $_.tier_ids -join ", " } else { "" }
    [PSCustomObject]@{
      post_id     = $_.post_id
      title       = $_.title
      published   = $_.published_at
      tier_ids    = $tid
      media_count = $mc
    }
  } | Format-Table -AutoSize -Wrap
  if ($postCount -gt $MaxPostRows) {
    Write-Host "  ... $($postCount - $MaxPostRows) more post(s) not shown (pass a number: rds 100)" -ForegroundColor DarkGray
  }
  Write-Host "  Total posts in batch: $postCount"
} else {
  Write-Host "  (no posts in batch)"
}

Write-Host ""
Write-Host "Done. Live ingest: .\scripts\rscrape.ps1  (or dry_run=false same body)" -ForegroundColor DarkGray
Write-Host ""
