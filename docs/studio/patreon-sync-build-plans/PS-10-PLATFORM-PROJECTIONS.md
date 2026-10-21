# PS-10 platform entitlement projections

Status: local code reviewed; combined production build blocked by concurrent Library errors. This follows [PS-10 member reconciliation](PS-10-MEMBER-RECONCILIATION.md) and preserves the platform patron model in [Option B](../../architecture/multi-tenant-option-b.md).

## Correction

Provider acceptance remains bound to a patron membership for the requested creator. Accepted creator state now updates the same account's existing reserved-platform snapshot in the same PostgreSQL transaction. Existing feed, search and follow readers retain their membership keys. The platform membership's own tier list and Patreon observation remain unchanged. Derived snapshots carry the accepted source and emit no additional lifecycle or tier-change events.

Seed and manual fixture callers use a separate projection-only helper. It checks the reserved platform anchor and target creator, writes the snapshot, and leaves identity, membership tiers and provider fences alone. No HTTP parameter or source string enables this path. The full seed's PS-12 media-proof changes are preserved.

Member acceptance reads a creator's legacy platform snapshot when the creator membership is absent. A verified cancellation can therefore clear that campaign's access and preserve other creators, campaigns and providers. First creator-scoped OAuth defers intermediate snapshot creation until the final scoped merge, so it cannot erase unresolved campaign evidence before that merge.

Creator-scoped refresh and initial creator OAuth share a strict relationship check before admission. Every active member must identify its campaign explicitly. An active member for the target campaign must also provide a valid tier-link array; an explicit empty array remains valid free-membership evidence. Sparse, malformed or blank links return `identity_campaign_binding_unverified` before identity or entitlement admission. Refresh may rotate an expired OAuth credential before fetching the next identity response; that existing guarded rotation remains unchanged. Explicit other-campaign memberships may omit irrelevant tier details. The general parser and unified OAuth retain their existing behavior.

Platform-keyed provider refresh resolves the same account's creator membership only after checking account, provider identity, creator/campaign and the exact encrypted credential revision used for collection. Patreon admission checks the original observation against both membership state and accepted provider-member observations, including inactive members with no creator membership. Unlink and purge retain the existing durable hashed identity fence. Identity locks precede creator locks; multi-creator invalidation takes creator locks in sorted order.

Patreon unlink removes Patreon access from every affected account projection, including platform-only snapshots, while retaining other providers. Account purge removes account-owned projections through the existing cascade and preserves creator-owned provider state and ledger sequence. Projection failure rolls back canonical access, lifecycle derivation and member checkpoints together.

Roster completion counts unresolved Patreon access from creator memberships and platform snapshots once per account. A missing provider binding remains unresolved. These rows retain access and block completion with `legacy_member_binding_unverified`; they do not acquire fabricated member IDs or become revocation evidence.

## Scope and verification

Exact before bytes, scoped patches and hashes are under `C:/Users/jorda/AppData/Local/Temp/relay-ps10-projection-before/`. `scope.json` and `scope.diff` identify the frozen runtime candidate and caller/test hunks. No schema, ownership-policy, reader or unrelated Library change is included.

The final hermetic run exercised 40 files: 262 checks passed, four failed and none were skipped (exit 1). All four failures were unchanged RLS-context tests because the disposable fixture lacked `auth_account_id()`. The complete 12-case projection PostgreSQL suite and unchanged 10-check full-seed/feed/permission suite passed. Evidence: `connected-final.json` and `connected-paths.json` beside the scope manifest.

Before the strict relationship check, independent verification passed all 12 projection PostgreSQL cases with no skips and exit 0 (`independent-projection-review.json`). Tests cover wrong account/creator/campaign rejection, SubscribeStar profile and credential revisions, first scoped OAuth preservation, existing feed/search/follow readers, cancellation without a creator membership, unlink/purge races, projection-write rollback, event attribution/deduplication and unresolved roster accounting. The later seven-file affected run passed 90/90 checks with no skips and exit 0 (`campaign-guard-connected.json`). It includes 15 projection PostgreSQL cases, the existing 27 member PostgreSQL cases, creator OAuth, general/unified parser compatibility, and shared-check unit tests. Sparse-response cases compare authorization rows before and after both real callers and verify the All Patrons access gate. Their unchanged-credential assertions cover successful first-fetch responses where token rotation is unnecessary. Independent final review also passed 14 strict-check unit cases, with no skips or transport denials. All isolated runs recorded zero external transport denials. The final scoped strict TypeScript check passed with exit 0.

The actual unresolved-access query was inspected with `EXPLAIN ANALYZE` on disposable fixtures: 0.909 ms, indexed creator-tenant, membership, snapshot and provider-user lookups. The observed plan included 40 platform anchors; this is a local query-plan check, not a large-roster benchmark. Evidence: `unmapped-explain.json`.

All database commands target the guarded private loopback database on port 49952. The reviewed TEMP runner at `C:/Users/jorda/AppData/Local/Temp/relay-ps15-guard/isolated-tests.cjs` supplies both explicit database URLs, isolated Redis database 15, a clean child environment, repository-dotenv suppression and external-transport denial. Earlier seed-containing runs lacked R2 isolation and cannot exclude object reads; those runs are excluded from final isolated evidence. No storage writes or unrelated resource cleanup were requested or performed by this correction.

An earlier permission-suite attempt failed collection on a duplicate `replay` declaration in concurrently edited `src/distribution/conversation-draft-variants.ts`. After that unrelated file changed, the final unchanged suite collected and passed. This correction made no edit to that file. The supervisor restored the missing existing RLS function only in the disposable fixture and separately verified all four checks passing. This correction includes no schema change. The combined production build ran after all test clients closed. Prisma generation passed; TypeScript failed with nine diagnostics in concurrently edited `src/distribution/conversation-draft-variants.ts` and `src/distribution/distribution-package.ts`, both outside this correction. Evidence: `C:/Users/jorda/AppData/Local/Temp/relay-combined-build-20261021.json`. The combined build and deployment remain blocked; no unrelated source was changed.

## Limits

Old binaries must be drained before relying on atomic creator/projection writes and observation fences. Legacy unresolved access still gates PS-14/15 cutover. No live provider, deployment or production database evidence is claimed.

The pre-existing SubscribeStar refresh-token writer can race that provider's unlink and repersist credentials. Its credential lifecycle is a separate follow-up; this correction does not claim to resolve it. Account ownership and retention policy remain separate.
