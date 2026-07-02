# Relay — Patreon connector (AMO long description)

Relay is a creator platform for backing up and publishing your own Patreon content. This WebExtension connects **your** Patreon browser session to **your** Relay account—nothing runs for visitors or other creators.

**Flow:** Install → open Relay → approve the consent page → the extension reads only the Patreon `session_id` cookie on `patreon.com` when you connect or when that cookie changes, and sends it to Relay over HTTPS with your creator id and a grant token issued after consent.

**Cross-post:** From Relay, click **Publish to Patreon** to open Patreon's editor with your Relay draft pre-filled (title, body, images best-effort). You review and publish manually; the extension never clicks Publish or sets audience/tier for you.

**Privacy:** No bundled telemetry (project policy P-5). Extension-specific privacy notice: **https://relayapp.me/legal/extension-privacy**

**Revoke access:** In Relay, use **Settings → Connected extensions** to disconnect a device.

**Support:** **support@relay.example** (use the live address from the Relay site if it differs).
