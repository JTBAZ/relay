# Delta In for T-007 (from T-006 completion)

## Delta

- **T-006 shipped in repo:** Signed platform webhook route (`POST /api/v1/webhooks/patreon/platform/:opaqueToken`) now returns **409** `WEBHOOK_CAMPAIGN_MISMATCH` when the JSON:API payload’s campaign id is indexed in `patreon_campaign_creator_index.json` to a **different** `creator_id` than the opaque token’s owner. Extraction uses `extractCampaignIdFromPatreonWebhookPayload`; dispatch takes `campaignId` once in `dispatchVerifiedPatreonPlatformPayload`.
- **Files touched:** `src/server.ts`, `src/patreon/patreon-webhook-platform.ts`, `tests/patreon-platform-webhook-route.test.ts` (409 case uses **fetch + raw Buffer** so HMAC matches—supertest was altering the body and caused 401 before 409), `.env.example`, `docs/part1-sync-hardening-ledger.md`.
- **Validation completed locally:** `npm run test` (195 tests), `npm run build` — green.

## Risks / blockers

- **Prod / Patreon:** Live webhook URL, portal registration, and sample delivery still need a human with deploy access (`FAIL_TO_HUMAN` if env missing).
- **Index bootstrap:** If a campaign id has **no** row in the index yet, mismatch detection does not apply until registration/sync populates it.

## Next step hint

T-007 — unattended incremental sync (`docs/Airtable Drops/prompts/T-007-prompt.md`); depends on refresh (T-005) and stable webhooks (T-006) behavior above.
