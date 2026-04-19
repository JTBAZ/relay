# Firefox AMO — permission justifications

Technical scope matches the Chrome / Edge package. Below are the **same verbatim reviewer strings** as Chrome (plan §6.B); use them when AMO fields map 1:1.

## Verbatim strings (plan §6.B)

**`cookies`** — Reads the user's own Patreon `session_id` cookie at their explicit request to back up their content.

**Patreon host** — Scopes the cookie permission to Patreon only; we do not access any other site.

**Relay host** — Sends the cookie to the user's own Relay account.

**`alarms`** — Periodically checks if the cookie has refreshed (12h interval).

**`storage`** — Stores the per-installation grant token locally so the user does not have to re-authorize.

**Consent / external** — Used by the Relay consent page to deliver the one-time authorization code.

## AMO notes

- Map **Patreon** line to host permission `https://www.patreon.com/*`.
- Map **Relay** line to host permission `https://relayapp.me/*`.
- The last bullet describes the consent handshake (Chrome `externally_connectable`); describe the same user-visible behavior if AMO uses different labels.
