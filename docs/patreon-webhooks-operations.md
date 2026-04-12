# Patreon webhooks — operations runbook

**Scope:** Creator-side **platform** webhooks (posts + members) that call Relay’s signed HTTPS endpoint. This is the **T-006** path: register with Patreon’s API, verify **HMAC-MD5** on delivery, route to `scrapeOrSync` or debounced `syncMembers`. *Not* the unsigned stub `POST /api/v1/webhooks/patreon` (dev/test only).

**Related code:** `src/patreon/patreon-webhook-registration.ts`, `patreon-webhook-platform.ts`, `patreon-webhook-signature.ts`, `src/server.ts` (route `/api/v1/webhooks/patreon/platform/:opaqueToken`).

---

## 1. Prerequisites

| Requirement | Why |
|-------------|-----|
| **Public HTTPS URL** for this API | Patreon delivers POSTs from their servers; `localhost` is not reachable. Use your deployed host (e.g. Coolify + DNS + TLS). |
| **`RELAY_PUBLIC_WEBHOOK_BASE_URL`** | **HTTPS origin, no trailing slash**, e.g. `https://api.yourdomain.com`. Same host/port the API actually serves. Alias: `PUBLIC_WEBHOOK_BASE_URL`. |
| **Creator OAuth with webhook scope** | `PATREON_CREATOR_OAUTH_SCOPES` in `src/patreon/patreon-creator-oauth-scopes.ts` includes **`w:campaigns.webhook`** so Relay can create/list webhooks via Patreon’s API. Re-authorize if an older connect omitted it. |
| **Single default Patreon campaign** (or explicit handling) | If the token sees **multiple** campaigns, registration returns **409** until a default campaign is chosen (see API error `AMBIGUOUS_CAMPAIGN`). |
| **Campaign ↔ creator routing** | Webhook payloads include a Patreon **campaign id**. Relay checks it against `patreon_campaign_creator_index` (see `PatreonCampaignCreatorIndex`). A successful **`POST /api/v1/patreon/scrape`** (or autosync) upserts the index so routing matches. |

---

## 2. How registration works

1. Relay builds a stable callback:  
   `{RELAY_PUBLIC_WEBHOOK_BASE_URL}/api/v1/webhooks/patreon/platform/{opaque_token}`  
   (`opaque_token` is per-creator, stored encrypted with webhook metadata.)

2. **`ensurePatreonPlatformWebhook`** lists existing Patreon webhooks; **reuses** one whose `uri` matches, otherwise **creates** via Patreon API (`PATREON_PLATFORM_WEBHOOK_TRIGGERS`: posts + members events).

3. **Triggers:** `posts:publish`, `posts:update`, `posts:delete`, and member pledge/membership events — see `patreon-webhook-registration.ts`.

4. **Automatic attempt:** After successful **`POST /api/v1/auth/patreon/exchange`**, Relay **fire-and-forgets** registration (best-effort). If `RELAY_PUBLIC_WEBHOOK_BASE_URL` was unset, metadata records skip/failure — fix env and **register again**.

5. **Manual retry:**  
   `POST /api/v1/patreon/webhooks/register`  
   Body: `{ "creator_id": "<relay_creator_id>" }`  
   Returns `200` with `webhook_id` and `uri`, or documented error codes.

---

## 3. Delivery path (Patreon → Relay)

1. **Raw body** must be verified: route uses **`express.raw`** for JSON so the **byte-for-byte** body matches Patreon’s `X-Patreon-Signature` (MD5 HMAC). Do not put this route behind middleware that parses JSON first.

2. Headers: **`X-Patreon-Signature`** (required), **`X-Patreon-Event`** (used to choose post sync vs member sync debounce).

3. **409 `WEBHOOK_CAMPAIGN_MISMATCH`:** Payload campaign id maps to a **different** Relay creator than the opaque token — refuse (security). Usually means wrong index data or shared webhook URL misuse.

4. On success: **202** `{ accepted: true }`. Post events trigger **`scrapeOrSync`**; member-family events schedule **`syncMembers`** (debounced).

---

## 4. Verification checklist

1. **Env:** `RELAY_PUBLIC_WEBHOOK_BASE_URL` set on the **running** API process (Coolify secrets / compose env).

2. **Register:** Complete creator OAuth **or** call `POST .../webhooks/register` once tokens exist.

3. **Observe:**  
   `GET /api/v1/patreon/sync-state?creator_id=...`  
   Response includes **`webhook_registration`** (public summary from `PatreonWebhookMetadataStore` — status, last error, etc.).

4. **Patreon:** In Patreon’s developer/app tools, confirm a webhook exists whose **URI** matches Relay’s registered URL.

5. **End-to-end:** Publish a test post on Patreon; confirm ingest activity (logs, sync health, or Library). If nothing fires, confirm **autosync** or manual scrape has populated the campaign index and tokens are healthy.

---

## 5. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Registration skipped / “no public base” | Missing or wrong **`RELAY_PUBLIC_WEBHOOK_BASE_URL`**. |
| **503** `WEBHOOK_NOT_READY` on delivery | Secret not persisted — run **`POST .../webhooks/register`** after fixing storage/encryption. |
| **401** on delivery | Wrong secret, body altered (proxy changed JSON), or signature header missing. |
| **409** `WEBHOOK_CAMPAIGN_MISMATCH` | Campaign in payload doesn’t match index for this creator — re-scrape / fix index. |
| **502** `PATREON_WEBHOOK_ERROR` | Failure inside `scrapeOrSync` / member sync (tokens, Patreon API, ingest). Check logs and sync health. |
| Works in staging, not local | Expected: Patreon cannot POST to `127.0.0.1`. Use tunnel or test on deployed URL. |

---

## 6. Complement: autosync (T-007 / T-008)

Scheduled **`RELAY_PATREON_INCREMENTAL_AUTOSYNC_MS`** / **`RELAY_AUTOSYNC_ENABLED`** does **not** replace webhooks; it catches **missed or delayed** events. Run both in production for best behavior.

---

## 7. Tests

- `tests/patreon-platform-webhook-route.test.ts` — signature, 202 for ignored events, campaign mismatch **409**.
- `tests/patreon-webhook-signature.test.ts` — HMAC helpers.

```bash
npx vitest run patreon-platform-webhook-route patreon-webhook-signature
```
