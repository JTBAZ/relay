# Relay — Patreon connector (long description)

**Relay** helps Patreon creators own and back up their content. This official connector extension lets you securely link the Patreon session in **your** browser to **your** Relay studio—so Relay can fetch media and metadata Patreon only returns to the authenticated creator.

## What it does

- After you sign in on [Relay](https://relayapp.me) and approve access on our consent page, the extension reads **only** the Patreon `session_id` cookie on `patreon.com` when you connect or when that cookie changes.
- It sends that cookie value to Relay over HTTPS together with your Relay creator id and a Relay-issued grant token, so backups run as **you**—not as a third party.
- A periodic check (12-hour interval) can pick up a refreshed Patreon session without extra clicks.
- When you click **Publish to Patreon** in Relay, the extension opens Patreon's post editor and pre-fills title, body, and images (best-effort) from your Relay post. **You** review the draft and click Publish in Patreon; the extension never publishes on your behalf.

## What it does **not** do

- **No telemetry** or third-party analytics (see product policy P-5).
- No access to sites other than Patreon (cookie scope) and Relay (API + consent).
- The extension never sees Relay’s web login cookie (`relay_session`); it uses a separate per-device grant you can revoke.
- Does not set Patreon audience/tier/paywall, schedule posts, or click Patreon's Publish button.

## Privacy

Full notice for this extension: **https://relayapp.me/legal/extension-privacy**

## Support

Questions: **support@relay.example** (replace with the live support address shown in the Relay app if different).
