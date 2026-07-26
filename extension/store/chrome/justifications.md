# Chrome / Edge — permission justifications (reviewer paste)

Use these strings when the store asks why each permission is needed. Wording matches [`docs/EXTENSION_BUILD_PLAN.md`](../../../docs/EXTENSION_BUILD_PLAN.md) §6.B.

## `cookies`

Reads the user's own Patreon `session_id` cookie at their explicit request to back up their content.

## `host_permissions: patreon.com` (https://www.patreon.com/\*)

Scopes the cookie permission to Patreon only; we do not access any other site.

## `host_permissions: relayapp.me` (https://relayapp.me/\*)

Sends the cookie to the user's own Relay account.

## `alarms`

Periodically checks if the cookie has refreshed (12h interval).

## `storage`

Stores the per-installation grant token locally so the user does not have to re-authorize.

## `scripting`

When the creator clicks **Publish to Patreon** in Relay, injects a short script into Patreon's post editor tab to pre-fill title, body, and (best-effort) images from their Relay post. The creator reviews the draft and publishes manually in Patreon; the extension never clicks Publish or changes paywall/audience settings automatically.

## `externally_connectable: relayapp.me`

Used by the Relay consent page to deliver the one-time authorization code.
