# Relay browser extension — operations runbook

Engineering and on-call reference for publishing updates, emergency session revocation, and secret rotation. For product behavior and architecture, see [`docs/EXTENSION_BUILD_PLAN.md`](../EXTENSION_BUILD_PLAN.md) and [`extension/README.md`](../../extension/README.md).

**Secrets:** This document names env vars only. Never paste real keys into tickets or commits. Load production values from your host secret store (see [`docs/database/operations-and-security.md`](../database/operations-and-security.md)).

---

## 1. Production extension IDs (TBD until Phase 7.A)

After Chrome Web Store and Firefox AMO publish, record the live IDs and confirm these are set on the **API** and **web** deploys (then restart API + rebuild web):

| Variable | Where | Purpose |
|----------|--------|---------|
| `RELAY_EXTENSION_ORIGINS` | API `.env` | CORS allowlist: comma-separated `chrome-extension://…`, `moz-extension://…` for `/api/v1/auth/extension/*` |
| `NEXT_PUBLIC_RELAY_EXTENSION_IDS` | `web` env | Consent page validates `?ext_id=` against this list |

Details: [`docs/EXTENSION_BUILD_PLAN.md`](../EXTENSION_BUILD_PLAN.md) §7.A and Appendix B.

---

## 2. Publish a new extension version

1. **Version** — Bump `"version"` in both [`extension/manifests/manifest.chrome.prod.json`](../../extension/manifests/manifest.chrome.prod.json) and [`extension/manifests/manifest.firefox.prod.json`](../../extension/manifests/manifest.firefox.prod.json) (and dev manifests if you keep them aligned).
2. **Build** — From `extension/`:
   - Chrome: `npm run build:chrome:prod`
   - Firefox: `npm run build:firefox:prod`
3. **Package** — From `extension/`, run `npm run pack:chrome` / `npm run pack:firefox` (or `npm run pack:store`) after prod builds — writes **`chrome.zip`** / **`firefox.zip`** with the correct flat layout. See [`extension/README.md`](../../extension/README.md) § Store zips.
4. **Upload** — Chrome Web Store and Microsoft Edge (Chrome package). Firefox AMO: expect a **full source/code review** on each submission per Mozilla policy.
5. **Smoke** — After approval, install from the store on a clean profile and run a short consent + sync check against staging or production as appropriate.

Store copy and permission text live under [`extension/store/`](../../extension/store/).

---

## 3. Privacy and support URL

Store listings and the extension privacy notice must stay aligned with:

**https://relayapp.me/legal/extension-privacy**

Implemented in-repo as [`web/app/legal/extension-privacy/page.tsx`](../../web/app/legal/extension-privacy/page.tsx).

---

## 4. Emergency: revoke all extension Bearer sessions

**Effect:** Every **extension** session row is marked revoked. All installed extensions lose API authorization until each user completes the consent flow again. **Web** sessions (`kind = 'web'`) are unchanged.

**Before running:** Page on-call; plan user comms. Prefer targeted revoke via product UI (`/settings/connected-extensions`) when a single grant is compromised.

**Schema** (Prisma [`prisma/schema.prisma`](../../prisma/schema.prisma) — `Session` → table `sessions`, columns mapped as below):

| Logical field | Postgres column | Notes |
|---------------|-----------------|--------|
| `kind` | `kind` | Enum `SessionKind`: `'web'` \| `'extension'` |
| `revokedAt` | `revoked_at` | Set to mark revocation |

**SQL (Postgres):**

```sql
UPDATE "sessions"
SET "revoked_at" = NOW()
WHERE "kind" = 'extension'
  AND "revoked_at" IS NULL;
```

Verify in a read-only session (counts only):

```sql
SELECT COUNT(*) AS extension_sessions_still_active
FROM "sessions"
WHERE "kind" = 'extension'
  AND "revoked_at" IS NULL;
```

If your environment uses **Supabase** with strict RLS, run this with a role that is allowed to update `sessions` (often service role / migration role — **not** the anon key).

---

## 5. Rotate `RELAY_EXTENSION_CONSENT_SECRET`

**Effect:**

- Invalidates **in-flight** one-time consent codes (users mid-flow may need to start authorize again).
- **Existing** extension grants (Bearer tokens already exchanged) **continue to work** until they expire or are revoked — the secret is for the consent handshake only.

**Procedure (typical single-node API):**

1. Generate a new random secret (≥ 16 characters; match app validation).
2. Update the API host env (`RELAY_EXTENSION_CONSENT_SECRET` in `.env` or secret manager).
3. **Restart** all API processes so every instance loads the new value.
4. There is no “dual-secret” window in v1: plan a short maintenance note (“If consent fails, retry from the extension”).

Document the rotation time in your change log. See [`docs/EXTENSION_BUILD_PLAN.md`](../EXTENSION_BUILD_PLAN.md) §0.C / Appendix B.

---

## 6. Rotate `RELAY_TOKEN_ENCRYPTION_KEY`

**Effect:** Patreon cookie payloads at rest under [`src/auth/cookie-store.ts`](../../src/auth/cookie-store.ts) are encrypted with **`TokenEncryption`** ([`src/lib/crypto.ts`](../../src/lib/crypto.ts), AES-256-GCM). Changing the key **without** re-encrypting existing ciphertext **breaks** decryption for stored cookies.

**Current repo state:** There is **no** checked-in sweep script that decrypts-with-old / encrypts-with-new across the file store. Before rotating in production:

1. **Freeze** cookie writes if possible (maintenance window).
2. **Backup** the cookie store file path used by `FilePatreonCookieStore` in production.
3. Implement or run a **one-off** operator script that:
   - Reads each record’s `encrypted_session_id`,
   - Decrypts with the **old** key,
   - Re-encrypts with the **new** key,
   - Writes atomically (or to a new file + swap).
4. Deploy the new `RELAY_TOKEN_ENCRYPTION_KEY`, restart API, verify a known creator can still sync.

Track automation as a follow-up if you rotate before a script exists; do not rotate blindly.

---

## 7. Quick reference — dashboards and repo map

| Resource | Link / path |
|----------|-------------|
| Extension package README | [`extension/README.md`](../../extension/README.md) |
| Repo map | [`AGENTS.md`](../../AGENTS.md) |
| Chrome Web Store | [Developer Dashboard](https://chrome.google.com/webstore/devconsole) |
| Firefox AMO | [Developer Hub](https://addons.mozilla.org/developers/) |
| Edge Partner | [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/) |

---

## 8. Tier 0 reminder

Extension code must not read `relay_session` (HttpOnly). Cookie and consent flows must stay on documented verbs and routes; see [`docs/AUTH_GUARDRAILS_TIER_1.md`](../AUTH_GUARDRAILS_TIER_1.md) and [`docs/qa/HTTP_VERB_HYGIENE.md`](../qa/HTTP_VERB_HYGIENE.md).
