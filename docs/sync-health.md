# Patreon sync health (Slice 4)

Relay keeps a small **file-backed** record of the latest post scrape and member sync outcomes per creator, plus **OAuth credential signals** from the encrypted token store. The Library reads this through **`GET /api/v1/patreon/sync-state`** (same response as the sync watermark).

## Storage path

- **Default:** `.relay-data/patreon_sync_health.json`
- **Override:** set **`RELAY_PATREON_SYNC_HEALTH_PATH`** in the root `.env` (see root `.env.example`).

This is **local disk only** in v1 — no cloud replication. Multi-instance deployments would need a shared store or DB in a future iteration.

## File shape

Top-level object with `records` keyed by **`creator_id`**:

- **`last_post_scrape`:** `finished_at`, `ok`, optional `error` (`code`, `message`, `hint`), `posts_fetched` / `posts_written`, optional `warning_snippets` (truncated Patreon scrape warnings).
- **`last_member_sync`:** same pattern with `members_synced` on success.

Handlers **`POST /api/v1/patreon/scrape`** and **`POST /api/v1/patreon/sync-members`** update these rows best-effort (failures to write the health file do not fail the HTTP request).

## API: `GET /api/v1/patreon/sync-state`

Existing fields are unchanged. Added:

- **`oauth`:** `credential_health_status`, `access_token_expires_at`, `access_token_expired`, `access_token_expires_soon` (within 24h). Raw access tokens are never returned.
- **`last_post_scrape`** / **`last_member_sync`:** objects as above, or **`null`** if never run.
- **`campaign_display`:** last Patreon OAuth snapshot of **`patreon_name`** (campaign **`vanity`**, lowercased), **`image_url`** (banner), **`image_small_url`** (profile), **`patron_count`**, and **`captured_at`**, or **`null`** if never scraped. Persisted in **`creator_campaign_display.json`** (override **`RELAY_CREATOR_CAMPAIGN_DISPLAY_PATH`** in root `.env.example`). The Library header uses the Relay chosen display name as the title and a **`patreon.com/{patreon_name}`** link beneath when **`patreon_name`** is present.

Error classification for failed runs uses **`src/patreon/sync-error-copy.ts`** (`classifySyncError`) so the UI can show stable **`code`** values and short **`hint`** text without echoing secrets.

## UI

The Library **Patreon** menu shows connection health, last scrape, and last member sync, with links to **Creator OAuth** and the **cookie** page. The top bar can show a **Sync issue** pill when OAuth is unhealthy, tokens are expired, or the last scrape/member sync failed.
