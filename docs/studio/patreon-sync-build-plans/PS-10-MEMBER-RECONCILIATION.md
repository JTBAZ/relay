# PS-10 member reconciliation

Status: complete locally and independently approved. No deployment or production migration was run. Requirements: [PS-10 phased plan](PHASED-BUILD-PLAN.md), [R10 acceptance](ACCEPTANCE.md), and [proposed design](PS-10-DESIGN.md).

## Behavior

Signed member work from PS-08 now refreshes the named member, verifies its campaign and user relationships, and accepts the current authoritative state. A delayed delete rereads the member. Only a verified missing resource with a previously accepted binding can clear access. A timeout, 403, unknown binding, or wrong campaign remains retryable. Paid access requires active status and a verified positive-price campaign tier; free followers receive no paid tier.

An independent 60-second BullMQ roster tick processes bounded pages and resumes durable continuation after restart. A successful campaign remains current for six hours. Page acceptance and continuation commit together. Complete traversal creates absence candidates; each candidate receives an authoritative single-member request before removal. Empty rosters block completion, and failed or partial scans cannot mass-revoke access. The separate patron OAuth stale-refresh worker remains scheduled.

Membership, entitlement snapshot, member state and derived ledger events commit together in PostgreSQL. Sequence-based ledger keys preserve repeated legitimate transitions at the same timestamp. The old timestamp uniqueness rule remains only for legacy events without keys. Current sessions resolve current membership tiers. Other providers and other verified or unresolved campaigns retain their tiers.

Provider identity locks precede sorted creator locks. A global pre-request observation sequence rejects slower OAuth, roster and targeted collectors, including unchanged verification and inactive members without an identity row. Unlink and account purge advance a durable hashed identity watermark. They preserve accepted creator-owned provider state and ledger sequence, so later verified observations cannot fabricate a new join or reuse an old transition key. Actual account bindings, credentials, sessions and access follow existing unlink/deletion rules. Stored-token refresh and OAuth token persistence recheck the binding under the same lock before saving credentials.

The file adapter uses one full-document lock and atomic replacement for identities, sessions, member state and its local ledger. Corrupt storage fails closed. Concurrent processes and expired-session cleanup share that lock; renewed sessions survive old cleanup. This adapter supplies local durability only. Hosted signed work and the roster worker require the shared DB identity adapter explicitly; Prisma configuration alone does not select it.

Webhook registration includes `members:create`. Existing endpoints receive missing required triggers through PATCH without changing `paused`; registration succeeds only after actual trigger confirmation. New endpoints also confirm returned or reread triggers. Snapshot sources distinguish OAuth, signed work, scheduled reconciliation and manual requests.

## Scope and evidence

The exact PS-10 file/hunk inventory and before/after hashes are saved at `C:/Users/jorda/AppData/Local/Temp/relay-ps10-before/scope.json`; `scope.diff` contains only those changes against captured before files. Prior PS-07/08/09 and unrelated Library/editor-bench changes are outside this scope. The reconstructed single-hunk baseline for `src/patreon/patreon-change-work.ts` matches the frozen PS-09 SHA-256 `a9f021d1fdc30448b67cf73bbebf6c9b3db1ae888c08aca62fafb8d20ce444dc`.

The connected run passed 243/243 checks across 37 files. This includes 27 PS-10 real PostgreSQL cases, PS-08/09 PostgreSQL and queue regressions, real BullMQ lost-dispatch recovery, two file processes, rollback injection for ledger/snapshot/member/checkpoint/outbox, delayed OAuth/page/member observations, unlink/new-creator overlap, purge continuity and both delayed credential-persistence paths. Evidence: `connected-final.json` and `member-pg-final.json` beside the scope manifest.

The scoped strict TypeScript check and root `npm run build` passed (exit 0). Prisma Client 7.7.0 generated successfully after test clients closed. The scoped Ponytail Review covered the declared hunks and connected identity, provider, session, queue and deletion callers for multiple API/worker processes; no remaining implementation finding was identified. Independent review passed 65 checks with no findings.

A 5,000-state disposable benchmark used the creator/user expression index for a scoped user lookup (0.043 ms); a representative synthetic identity anti-join used a hash anti join (4.259 ms), rather than the full production membership/account/unnest query. Fixture inserts rolled back. Query plans are in `explain.json` beside the scope manifest.

The final additive migration SQL passed isolated-schema validation, including private RLS tables, creator/user lookup index, keyed dedupe and the legacy partial uniqueness rule. Its runtime tables were exercised only on guarded disposable loopback PostgreSQL. Evidence: `migration-verification.json` beside the scope manifest. No linked Supabase project or live Patreon account was accessed.

## Remaining cutover evidence

Legacy paid memberships without a verified member binding remain `blocked` with reason `legacy_member_binding_unverified` and an unresolved count. A current roster observation establishes the mapping automatically. For an already absent legacy member, removal requires trusted provider evidence linking the real member resource, user and campaign, followed by an authorized bounded resolution. No synthetic member ID or absence-only revoke is allowed. PS-14 can present these counts; PS-15 must resolve or explicitly gate them.

The identity watermark stores at most one hash and bigint per unlinked or purged provider identity. It has no TTL. The table contains no raw provider ID, account ID or token; accepted creator provider observations and ledger history retain their existing lifecycle continuity separately.

Deploy the additive schema first, then replace/drain all old identity/member writers together before relying on the new lock, observation and keyed-ledger guarantees. Old binaries do not honor them. Production migration, real Patreon trigger/endpoint behavior, installed-browser evidence and bounded rollout remain PS-15 gates. This record establishes local implementation evidence only; ownership policy and later metadata/payment evidence stay separate.
