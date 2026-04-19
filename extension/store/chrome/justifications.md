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

## `externally_connectable: relayapp.me`

Used by the Relay consent page to deliver the one-time authorization code.
