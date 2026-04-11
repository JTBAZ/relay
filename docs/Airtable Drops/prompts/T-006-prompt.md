# T-006 — P0 — Production Patreon webhooks end-to-end

## Goal

Verify and harden **production** Patreon webhooks: `RELAY_PUBLIC_WEBHOOK_BASE_URL`, registration (`patreon-webhook-registration`), **HMAC** verification, campaign routing, and handlers that trigger `scrapeOrSync` and member-sync debounce. Document or fix gaps so webhooks are trustworthy in prod.

## Scope / non-goals

- **In scope:** Webhook verification code paths, routing, idempotency where applicable; ops checklist for stable public URL.
- **Non-goals:** Implementing unrelated Patreon API features. If production credentials or URL are missing, **stop** and escalate per `.docs/anthropic/FAIL_TO_HUMAN.md` (do not loop on secrets).

## Validation

- Targeted tests around webhook registration / verification if present in repo.
- `npm run test` / `npm run build` for touched code.

## Handoff

After success, write **Delta Out** and follow **Runs** logging in `docs/database/AIRTABLE_AUTOPIPELINE.md`. Note any **Blocked** state if prod verification requires a human.
