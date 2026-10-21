# PS-00 baseline and sync contracts

Status: complete on 2026-10-20. Source baseline: `4098b8c`, with unrelated working-tree changes preserved. The contracts below separate existing behavior from requirements for later items; they introduce no new API fields, schema, or runtime behavior.

## Concurrent work and accepted fixes

| Item | Evidence at the start of PS-00 | Disposition |
|---|---|---|
| PS-01 / Import 01 | Commit `7cb5c70`; parent posts update in place and preserve creator-owned relationships. | Keep the fix and existing regressions. Live foreign-key acceptance remains in PS-15. |
| PS-02 / Import 02 | Commit `4098b8c`; ticket complete. Creator mutation acquires a transaction advisory lock before loading; reads, callback, and saving share an explicit Read Committed transaction. | Already implemented by another chat. No new claim, duplicate lock, or code changes here. |
| PS-03 / Import 03 | The other active chat, "Save current build as branch", has a user-authorized read-only migration-policy assessment in progress. Its ticket still requires a separate policy decision before implementation. | Leave the assessment and policy decision with that work. No ownership changes, transfers, or approval implied here. |
| PS-04 / Import 04 and PS-05 / Import 05 | Both tickets still marked ready; their respective shared-media and event-publication paths remain unchanged. | Pending; do not start them under this request. |

PS-02's completion record reports six live PostgreSQL cases using separate clients, 175 focused tests, and a final 40-test recheck. Those are the implementing task's recorded results. PS-00 rechecked the current source and reran the affected adapter suites; it did not restart that task's temporary database or repeat its live run.

Explicit `save`, `saveForCreator`, and global `mutate` remain offline maintenance operations under the canonical ingest contract. The PS-02 lock covers database-backed `mutateForCreator`; it does not establish safety with old deployed writers that ignore that lock, or make domain publication atomic with saving. Deploy compatible API/worker writers together when that fix is released.

## Authority and identity

| Concern | Existing contract | Required boundary for later items |
|---|---|---|
| Relay creator | `SyncBatchInput.creator_id`; canonical rows are creator-scoped. | Resolve requests/jobs to the authenticated account or verified campaign. Keep creator identity in every progress/work key. |
| Patreon campaign | Numeric provider campaign ID; canonical campaign uses the existing provider mapping. `CreatorProfile.patreonCampaignId` and routing checks bind it to Relay. | An opaque webhook URL or browser-supplied ID cannot authorize reassignment. Preserve the PS-03 policy boundary. |
| Post and media | Stable `patreon_post_<id>` and provider media IDs, with current and historical revisions. Cookie and OAuth media mapping have different input shapes. | Preserve mapping compatibility and canonical cover/attachment rules. A signed URL is a location, not a new asset identity. |
| Member | Member resource ID identifies the campaign relationship; user ID identifies the person. Existing identity linkage can survive masked email/name. | Target member events by member ID and campaign. Never substitute email or a synthetic fallback address for provider identity. |
| Access | OAuth post/tier data and existing identity/access services determine gates. Cookie data needs source-specific normalization. | Browser collection cannot grant access. A missing field is unknown, not public or zero. Other providers' entitlements survive a Patreon change. |
| Creator curation | Presentation, links, metrics, and creative-work membership are Relay-owned relationships. | Provider refresh/deletion follows existing canonical soft-deletion and overlay contracts. Do not destroy curation or merge work automatically. |

## Revisions, deletion, and durable work

- Existing replay identity uses creator, entity ID, and source revision, with legacy compatibility checks. Cookie post revisions include `edited_at` when supplied; OAuth list fieldsets do not currently request a reliable edit marker. PS-07 must specify normalized source-revision derivation and prove compatibility before changing that meaning. Transient URL renewal alone is not a content revision.
- `IngestTombstone` already requires entity type, ID, and stable `deleted_at`. PS-09 must distinguish a provider deletion time from Relay's first observed time and persist any fallback observation for repeatability. Timeouts, missing access, and partial scans do not prove deletion.
- Signed webhook verification and ownership checks remain before acceptance. The current dispatch function keeps campaign/event information but discards the affected resource ID. PS-08/PS-09/PS-10 must retain that identity from the verified payload. The fixture's old post is `9001`; a deletion regression must carry that ID through the new dispatch boundary once it exists.
- Database locking now protects canonical creator mutation, but ingestion still publishes events during application before save completion. PS-05 owns buffering those events. Durable webhook receipts in PS-08 are a separate acceptance boundary and do not remove PS-05's remaining commit-to-publication crash limit.
- PS-08 must fix the meaning of accepted, retryable, failed, and completed work against shared storage before changing the HTTP acknowledgment path. A pending timer, successful dispatch attempt, or received request is not completed sync.

## Progress and completeness

| Meaning | Current representation | Frozen requirement and owner |
|---|---|---|
| New-post discovery | `watermark_published_at` and the newest-publication probe. | Keep its narrow meaning. A matching newest post cannot establish older edits, archive completeness, members, or media. PS-11. |
| Archive/catch-up progress | Per-run page budget; no persisted continuation exposed by the current sync contract. | Persist continuation and distinguish unknown, partial, and complete coverage. Commit progress with accepted work; do not strand equal-time posts or an unfinished range. PS-11. |
| Member reconciliation | `members_synced`, page count, and warnings; no complete-roster proof. | Persist coverage separately. Removal by absence needs a complete verified scan and the anomaly safeguards in PS-10. |
| Media completion | Ingested media plus export index/failures and Library Retry. | Metadata import and watermark advancement do not establish durable blob availability. Retry missing media independently and record its accepted revision. PS-12. |
| Credential health | OAuth health; cookie local age/rejection; extension grant and cached last-upload hash/time. | Keep local observation, server acknowledgment, and data-sync success separate. Scope cached upload state to grant and workspace; preserve current expiry policies. PS-06/PS-13. |
| User-visible health | Existing sync-state fields and `SyncHealthWebDto`. | Extend compatibly; show pending/partial/stale/unknown without inventing success or zero. Reads do not schedule mutations. PS-14. |

These are semantic contracts, not names for new persisted columns or enums. The owning item selects the smallest representation after checking existing stores and callers. Metadata provenance, windows, units, currency, and source-update time remain PS-16's contract work after the reliability acceptance check.

## Shared fixtures and executable baseline

[Synthetic fixture](../../../tests/fixtures/patreon/sync-baseline.json) contains a campaign/tier, two post pages, an old-post update without a publication-date change, cookie-only media for the newest post, active/absent member responses, and expired/missing credential conditions. All content and identifiers are synthetic. Requests in the baseline suite are injected and never reach Patreon.

[Baseline tests](../../../tests/patreon-sync-baseline.test.ts) use the real sync service, mapping, batch application, and event bus with in-memory persistence and injected network/export boundaries. Two ordinary controls prove that both pages and initially available cookie media can be imported.

At PS-00, six `it.fails` assertions encoded unmet desired behavior. Their observations run in `beforeEach`, outside the expected-failure assertion, so setup, fetch, and unexpected service failures fail normally. They establish historical defects, not acceptance passes. PS-05 converted its assertion into a normal passing test; PS-09 converted its two old-post assertions; PS-11 converted its capped-page assertion. PS-12 replaced its two media assertions with named ordinary-sync PostgreSQL integration cases below. No expected-failure marker remains. The controls and required outcomes are preserved. Live store concurrency uses the existing PS-02 suite, not this in-memory adapter.

| Baseline behavior | Result observed at PS-00 | Expected result | Owner / acceptance |
|---|---|---|---|
| Old-post update | `Older original` remains. | Import `Older edited` independently of discovery cutoff. | PS-09 / R09 |
| Old-post deletion | Imported status remains `active`. | Apply a targeted soft deletion. | PS-09 / R09 |
| Two runs capped at one page | Only one post is imported. | Eventually import both pages. | PS-11 / R11 |
| Cookie added after OAuth import | Newest post still has zero media. | Recover its cookie-only asset. | PS-12 / R12 |
| Download fails, then source recovers | Only one export attempt across two ordinary sync runs. | A later run retries the failed asset. | PS-12 / R12 |
| Canonical save fails | One publication event escapes. | No publication event before successful persistence. | PS-05 / R05 |

## Remaining regression ownership

Every reliability finding has one implementation owner and a defined acceptance case. Existing suites provide starting points; rows marked pending need their additional defect/restart regression in that item before completion.

| Review finding | Owner | Acceptance | Existing suite or fixture boundary |
|---|---|---|---|
| 1. Old updates/deletions | PS-09; durable dispatch PS-08 | R08, R09 | Executable baseline above; platform webhook route/payload suites need affected resource identity. |
| 2. Archive page loss | PS-11 | R11 | Executable baseline; sync watermark and incremental-worker suites need restart/equal-time/creator-fairness cases. |
| 3. Media after recovery | PS-12 | R12 | Executable baseline; export retries and media-source suites need durable repair restart cases. |
| 4. Cached extension success | PS-13 | R13 | [Local PS-13 approval](PS-13-VERIFIED-EXTENSION.md): bound checks, real two-API consent replay, age and recovery proof pass. Installed-browser checks remain pending. |
| 5. Cookie write overlap | PS-06 | R06 | Pending: two writers, corrupt vault, age-preserving migration; cookie-auth tests remain controls. |
| 6. Volatile member timers | PS-08, PS-10 | R08, R10 | Pending: acknowledgment/restart and continuous-event maximum wait; member coordinator suite currently checks debounce. |
| 7. Absent roster member | PS-10 | R10 | Pending: active/absent fixture with confirmed complete coverage; partial/empty anomaly response cannot mass-revoke. |
| 8. Foreign-owner conflicts | Existing Import 03 / PS-03 | R03 | Active assessment owns the policy; current migration fixtures must not be rewritten here. |
| 9. Overlapping creator mutations | Existing Import 02 / PS-02 complete | R02 | Existing `canonical-store-concurrency.integration.test.ts`, adapter tests, and completion record. PS-15 retains deployment acceptance. |
| 10. Shared-media persistence | Existing Import 04 / PS-04 | R04 | Pending: shared asset across unchanged p1/new p2, then real store reload and rollback. |
| 11. Premature publication | Existing Import 05 / PS-05 | R05 | Executable baseline; owning fix adds commit rejection, retry, and replay cases. |
| 12. Browser request authentication | PS-13 | R14 | Local browser-managed request and partial-capture behavior pass [PS-13 checks](PS-13-VERIFIED-EXTENSION.md). Installed Chrome/Firefox authentication evidence remains pending. |
| 13. OAuth fields | PS-07 | R07 | Resource API field tests need strict sparse-response fixtures; future PS-07 must not assume `edited_at` in public OAuth. |
| 14. Per-asset global inventory reads | PS-12 | R12, R16 | Export suite needs creator-scoped reads and another creator's inventory as a boundary. |

## Verification and scope record

Command: `npm exec -- vitest run tests/patreon-sync-baseline.test.ts tests/canonical-store-db-save.test.ts tests/creator-scoped-canonical-store.test.ts tests/canonical-store-presentation-ingest.test.ts tests/canonical-store-concurrency.integration.test.ts`.

Result: 36 ordinary tests passed and all six known-gap assertions failed as expected; Vitest reports 42 passed. Six opt-in PostgreSQL tests were skipped because no dedicated test URL was supplied. This task made no live database, Redis, provider, or browser claim. Strict TypeScript checks passed for the new test and its source imports. New document links, fixture structure, work-item references, and scoped whitespace were checked.

Preservation check: all 70 pre-existing changed tracked files outside this task remained byte-identical. No canonical implementation, import ticket, schema, dependency, branch, or index entry was changed by PS-00.

Scoped Ponytail Review covers this baseline, its fixture/test, and the PS-00/PS-02 status edits in the program documents. Connected source read includes sync, webhook dispatch, replay, transaction locking, member/cookie state, and health DTOs. Expected load remains the documented hosted API plus workers. No runtime fix is introduced; no blocking finding remains in this task's scope. The six expected failures and the other open findings remain assigned to their owning items.

PS-00 is complete. PS-02 was already complete and was not claimed. PS-03's read-only assessment and policy decision remain separate. PS-04 is the next unimplemented shared-store fix after checking current ownership; this request does not start it.

## Subsequent completion: PS-04 (2026-10-20)

The PS-00 snapshot above remains historical. A later request authorized PS-04 after checking concurrent work. PS-03 landed independently as `c82c9ed` before the PS-04 source edit. [Import 04](../../../.scratch/import-persistence/issues/04-persist-shared-media-revisions-before-replay-markers.md) now records fourteen passing PostgreSQL regressions and R04's local completion. The PS-05/09/11/12 expected failures remain assigned to those items; ownership policy was not changed by PS-04.

## Subsequent completion: PS-05 (2026-10-20)

A later request authorized PS-05 after a fresh ticket/diff/chat check; the separate PS-03 owner was idle, and PS-04's uncommitted changes were preserved. [Import 05](../../../.scratch/import-persistence/issues/05-publish-import-events-only-after-successful-save.md) records twelve passing orchestration cases and six PostgreSQL cases. Its baseline now asserts zero events after failed saving as a normal passing test. The remaining five expected failures still belong to PS-09, PS-11, and PS-12. Canonical commit and event delivery remain separate durability boundaries; no ownership-policy change is part of PS-05.

## Subsequent completion: PS-06 (2026-10-20)

A fresh concurrency check found no vault owner. [PS-06](PS-06-SESSION-VAULT.md) now records encrypted database persistence, coordinated atomic file updates, compatible age/status transitions, shared runtime selection, and a restartable encrypted-file migration. Eight new PostgreSQL cases pass, including two actual writer processes and migration racing a hosted upload. The final connected run passes 146 checks with one Windows-permission skip; its five expected failures still belong to PS-09/11/12. Production cutover, full reliability rollout, and ownership policy remain separate.

## Subsequent completion: PS-07 (2026-10-20)

A fresh ticket/diff/chat check found PS-07 unclaimed at `91a72d2`. [PS-07](PS-07-OAUTH-RELIABILITY.md) records explicit bounded OAuth requests, content/access revision hashes with serialized occurrence handling, list-first enrichment, and coordinated creator-token rotation. The original baseline's five expected failures still belong to PS-09/11/12. Concurrent Library evaluation changes were preserved. Ownership policy and hosted deployment remain separate.

## Subsequent completion: PS-08 (2026-10-20)

PS-08 was unclaimed after a fresh chat/diff/plan check. [PS-08](PS-08-DURABLE-CHANGE-WORK.md) records transactional minimal webhook acceptance, shared coalesced generations, BullMQ recovery and leased execution, bounded retries, and receipt retention. Existing PS-07 changes and concurrent Library source, tests, and server hunks were preserved. The five baseline expected failures remain with PS-09/11/12. No ownership-policy change or hosted deployment is included.

## PS-09 completion

PS-09 was unclaimed after a fresh plan, diff, and chat check. [PS-09](PS-09-TARGETED-POSTS.md) records targeted current-source refresh, stable deletion observations, access-first persistence, and serialized observation checks against stale target, discovery, access-only, and shared-media writers. Media-linked comments and engagement records survive access changes, refresh, and soft deletion. Its two baseline assertions are now normal passing tests; the three remaining expected failures belong to PS-11/PS-12. Independent Sol High review, 261 connected checks, and the root production build pass. Existing credential/worker changes and concurrent Library work were preserved. Ownership policy and live rollout remain separate.

## PS-11 local completion update

PS-11 was unclaimed after a fresh plan, diff and chat check. [PS-11](PS-11-RESUMABLE-POSTS.md) records durable archive/catch-up checkpoints, verified older-post reconciliation, safe file replay and persisted creator fairness. Its capped-page baseline is now a normal passing assertion; two PS-12 media assertions remain expected failures. Independent Sol High review, 327 connected checks, 131 independent non-PG checks, nine independent PostgreSQL cases, seven final file checks and the root build pass. Existing PS-07 through PS-10 and unrelated Library changes were preserved. Production cutover, live acceptance and ownership policy remain separate.

## PS-12 local completion update

[PS-12](PS-12-MEDIA-REPAIR.md) is independently approved locally. Its durable PostgreSQL repair cases replace the two historical media expected failures while preserving the ordinary-sync outcome and PS-00/09/11 controls. No expected-failure marker remains in the baseline suite.

| Historical gap | Passing PostgreSQL equivalent in `tests/patreon-media-repair.integration.test.ts` |
|---|---|
| Cookie added after OAuth import | `recovers old OAuth-only media after cookie consent through ordinary sync and serves R2 content/ZIP on another API` |
| Exhausted download after source recovery | `retries exhausted downloads through ordinary sync from durable work after a fresh service starts` |

Acceptance requires the explicit private PostgreSQL/Redis opt-ins and zero skipped cases. The final connected batch passed 474 checks, the final affected batch passed 56, and independent review passed 125, all without skips or blocked transport attempts. R2/provider transports are injected; these are local acceptance results. Prisma generation passed, but the combined build failed on nine unrelated concurrent Library diagnostics. Deployment, live provider/browser evidence and PS-15 remain open. Ownership policy and unrelated changes are preserved.
