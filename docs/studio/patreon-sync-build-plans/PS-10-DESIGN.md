# PS-10 proposed member reconciliation design

Status: proposed, 2026-10-20. No PS-10 runtime, schema, migration, or acceptance completion is established by this note. Integrate after PS-09; serialize shared files with its owner. Requirements remain in the [phased plan](PHASED-BUILD-PLAN.md) and [R10 acceptance](ACCEPTANCE.md).

## Existing behavior

PS-08 durably retains creator, campaign, member resource ID, event, and retry state. Member dispatch still runs a capped roster scan. It neither targets the member nor proves roster completeness.

`IdentityStore` exposes separate reads and writes. `DbIdentityStore.createUser` owns a transaction; `updateTiers` writes membership and snapshot separately. `syncMembers` updates identity before ledger append, so retry after ledger failure can lose a transition. Snapshot merging preserves other-provider tiers, while membership tier replacement can lose them. File identity writes are uncoordinated, corrupt reads become empty state, and file sessions retain captured tiers.

## Durable state

Propose two provider-specific records, with equivalent optional maps in the file identity document:

- Roster progress, keyed by creator/campaign: scan ID, continuation, start/completion times, status, counts, anomaly reason, and last verified complete scan. Preserve the last good completion during an interrupted scan.
- Member state, keyed by creator/campaign/member resource ID: verified opaque user/membership binding, last-seen scan ID, accepted Patreon tiers/status, observation sequence/time, and last verification. Retain enough binding to resolve deletion after the upstream resource disappears. Omit names, email, and raw payloads.

Keep health as a projection. Bound scans and paginate member state; avoid storing the full roster in one JSON array. Existing identities without member mappings require verified observations or candidate lookup before absence can revoke access.

## Acceptance mutation

Add a narrow `applyPatreonMemberObservation` command through `IdentityService`, implemented by both stores. Inputs contain verified identity/binding, normalized provider state, source, and observation context.

Fetch upstream outside database transactions. Under a transaction advisory lock for creator/campaign, resolve identity using existing conflict rules, merge Patreon tiers with other-provider/shared tiers in membership and snapshot, derive ledger changes from prior accepted Patreon state, and commit ledger/member state with the identity mutation. Checkpoint a page only after all its members are accepted.

Extract the existing identity helper needed to accept `Prisma.TransactionClient`; wrapping current calls in an outer transaction would leave their independent writes outside it. Let ledger helpers accept a transaction client. Persist first-observed time and transition identity so retries retain the original event. Detect timestamp-unique conflicts accurately; only introduce a ledger dedupe-key migration if the existing constraint cannot safely represent accepted transitions. Document compatibility with old writers.

For files, coordinate every identity mutation with the same lock and atomically replace the document. Preserve optional new maps during existing session/user writes. Missing files may initialize; corrupt/unreadable files must fail. Save a transition intent with identity so restart preserves event derivation. Report local analytics delivery limits explicitly. Resolve sessions against current user tiers or update affected cached tiers within that mutation.

## Reconciliation

Resume bounded roster scans from accepted continuation. Failures and partial pages cannot mark completion. Complete traversal creates absence candidates; unexpectedly empty responses, missing identity, campaign mismatch, and anomalous removals block bulk clearing. Authoritatively verify affected candidates. Reverify members changed by targeted work after scan start.

Targeted execution must consume member ID/event from durable work and validate campaign ownership. A stale delete cannot clear a currently valid membership; timeout/403 never proves absence. Periodic roster work runs independently of post discovery and preserves the patron OAuth stale-refresh worker. Add `members:create` and reconcile actual registered triggers before claiming registration success.

## Verified provider request contract

Checked official docs on 2026-10-20; runtime requests remain untested. [Single-member lookup](https://docs.patreon.com/#get-api-oauth2-v2-members-member_id) is `GET https://www.patreon.com/api/oauth2/v2/members/{member_id}` with `campaigns.members`, using member ID, not user ID. Request `include=campaign,currently_entitled_tiers,user` and explicit `fields[member]=patron_status,currently_entitled_amount_cents,pledge_relationship_start`; URL-encode brackets. Those relationships also support roster requests. [Member fields](https://docs.patreon.com/#member) permit masked names/email, so identity must use opaque IDs; email needs `campaigns.members[email]`.

[Triggers](https://docs.patreon.com/#triggers) distinguish member deletion from pledge cancellation: prior-paid memberships can remain with updated status; pledge creation excludes free/gift joins. Retain both event families and reread entitlement.

Webhook list/create/update require `w:campaigns.webhook`; listing exposes client-owned webhooks. POST supplies triggers, URI, and campaign relationship. [PATCH by webhook ID](https://docs.patreon.com/#patch-api-oauth2-v2-webhooks-id) supports triggers/URI for client-created webhooks, with JSON:API `data.id`, `type`, and attributes. Compare actual triggers, patch only when needed, and confirm accepted state. Omit `paused` during trigger reconciliation: setting it false can replay queued failed deliveries.

## Caller scope

- `src/patreon/`: `patreon-sync-service.ts`, member coordinator, resource API, webhook dispatch/registration/API, and `membership-ledger-sync.ts`.
- `src/identity/`: service, both stores/interface, types, and entitlement snapshot helper.
- `src/jobs/`: worker registration, repeat scheduling, queue payloads. Keep existing manual `sync-members` fields in `src/server.ts`; add honest partial/coverage results.
- `prisma/schema.prisma` and bounded additive migration. Preserve existing identity conflict policy and provider boundaries.

## Verification

Cover targeted create/update/delete, stale/reordered deletion, masked identity, campaign mismatch, unknown deletion mapping, and free membership. Test multiple page budgets, cursor restart, page failure, invalid continuation, empty/anomalous roster, missing identity, and targeted updates during scans.

Inject identity/snapshot/ledger/checkpoint failures; prove rollback or recoverable intent, stable retry events, and A-to-B-to-A transitions. Exercise concurrent workers/OAuth refresh, other-provider tiers in membership/snapshot/session, file corruption and overlapping session writes, and legacy documents. Use disposable PostgreSQL for real rollback/restart tests. Run focused suites and root build, scoped Ponytail Review, then relevant integration checks. Record unavailable provider evidence separately; PS-15 still owns full reliability release proof.
