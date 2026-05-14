<#
.SYNOPSIS
    Prints a cryptographically random value suitable for Relay SubscribeStar OAuth state HMAC signing.

.DESCRIPTION
    Sets RELAY_SUBSCRIBESTAR_OAUTH_STATE_SECRET (or RELAY_SUBSCRIBESTAR_CREATOR_OAUTH_STATE_SECRET).
    Relay requires minimum 16 characters; this emits 64 hex chars (256 bits).

.EXAMPLE
    .\scripts\generate-subscribestar-oauth-state-secret.ps1
.EXAMPLE
    .\scripts\generate-subscribestar-oauth-state-secret.ps1 -Bytes 48
#>
[CmdletBinding()]
param(
  [ValidateRange(16, 128)]
  [int] $Bytes = 32
)

$buf = New-Object byte[] ($Bytes)
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $rng.GetBytes($buf)
}
finally {
  $rng.Dispose()
}

$hex = -join ($buf | ForEach-Object { '{0:x2}' -f $_ })

Write-Host ""
Write-Host '# SubscribeStar OAuth state HMAC - use ONE of these env names (same value is fine):' -ForegroundColor DarkGray
Write-Host "RELAY_SUBSCRIBESTAR_OAUTH_STATE_SECRET=$hex"
Write-Host "# RELAY_SUBSCRIBESTAR_CREATOR_OAUTH_STATE_SECRET=$hex"
Write-Host ""
