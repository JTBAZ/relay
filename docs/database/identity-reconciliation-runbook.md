# Identity reconciliation runbook

**Purpose:** Detect and safely resolve split Patreon identities / studio ownership mismatches.  
**Script:** `npm run audit:identity-ownership` (dry-run report; exit `2` when conflicts exist).  
**Claim API:** `POST /api/v1/creator/studio/claim-from-patreon` with `{ relay_creator_id, dry_run? }`.

## Rules

1. Never merge or transfer ownership from email equality alone.
2. Require agreement among: current Relay session Account, `Account.patronPatreonUserId`, creator `ProviderAccount.providerUserId`, and studio ownership rows.
3. Prefer `--dry-run` / `dry_run: true` before any write.
4. Every claim/conflict writes an `identity_audit_events` row (no tokens).

## Operator steps

1. Ensure `RELAY_DB_STORE_IDENTITY=1` and migrations applied (`oauth_transactions`, `identity_audit_events`).
2. Run `npm run audit:identity-ownership` (or `:json`).
3. Triage `conflict` findings with the account owner; use blind support tools first.
4. For unambiguous same-account claims, call claim API with `dry_run: true`, then without.
5. Re-run the audit; do not remove localStorage studio fallbacks until conflicts are zero and session projection is stable.

## Rollback

- Mistaken `primaryRelayCreatorId` can be nulled (`onDelete: SetNull` relation) after human review.
- Do not auto-reassign `ProviderAccount.userId` during backfill.
- Web studio dual-read: set `NEXT_PUBLIC_RELAY_STUDIO_FROM_SESSION=0` to force localStorage during soak rollback.
- Kill unified onboarding rollout on rising OAuth failure/replay rates, any ownership mismatch, cross-tenant results, or unexplained session/localStorage divergence.
