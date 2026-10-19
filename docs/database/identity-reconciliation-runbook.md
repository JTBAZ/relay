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

## Canonical import ownership conflicts

Ordinary canonical imports never transfer content between creators. A campaign, post, media asset, stored tier identity, or referenced campaign/post owned by another creator stops the creator's entire save. This applies to active and legacy owners, including `dev_creator`, and protects Relay-native content as well as imported content. No owner is automatically disposable because its Account, profile, or OAuth records are missing.

Direct synchronous ingestion and creator sync routes return HTTP 409 with `INGEST_OWNERSHIP_CONFLICT`. The public message contains no foreign owner or content identifiers. Server logs and ingest dead letters retain operator diagnostics. Queued ingestion keeps its existing bounded retries and preserves the failed batch for investigation. A failed page does not undo earlier pages that already committed.

1. Preserve the failed batch and trace ID. Inventory the conflicting canonical IDs, current owners, and dependent records without writes. The identity ownership audit above supplies supporting identity evidence; it does not inventory canonical content conflicts.
2. Verify the named source and destination creators, provider account/campaign ownership, and the rightful Relay Account. Email equality, matching content, a creator-route secret, and missing identity records do not authorize a transfer. Uncertain or conflicting proof stops the repair.
3. Prefer fixing routing or an eligible studio claim while keeping the existing canonical creator ID. Follow the existing claim checks; do not reset studio ownership or reassign ProviderAccount rows automatically. The claim API's `dry_run` still writes identity audit events, so it is not a strictly read-only inspection.
4. A true content move requires separate approval of a case-specific plan naming both creators and exact content. Include dependent presentation/work membership, links and metrics, tier relations, and creator-bound replay history. Do not delete/reimport content, clear replay markers, copy opaque hashes between owners, merge tenants, or enable an import override as a repair shortcut. This policy approves no actual transfer and adds no general transfer command.
5. For an approved repair, stop all writers, back up the affected data and identity/routing state, review the intended changes without applying them, then execute only the approved repair. Verify both owners, relationships, replay behavior, and routing before restarting writers. On failure, keep writers stopped and use the reviewed backup/recovery plan; do not restore automatic reassignment to bypass the conflict.

Before rolling out the import guard, inventory known legacy collisions, back up, and drain/replace all API and worker writers together. Older writers can still perform destructive reassignment. Existing legacy imports that relied on it will now stop until routing or an explicitly approved repair resolves ownership.
