# Patreon sync acceptance and rollout

Status: planned verification. The cases below are requirements, not evidence that the new behavior has shipped. Use [the phased plan](PHASED-BUILD-PLAN.md) for owners and prerequisites.

R04 now has local PostgreSQL evidence in [Import 04](../../../.scratch/import-persistence/issues/04-persist-shared-media-revisions-before-replay-markers.md): fourteen shared-media cases pass for Patreon and SubscribeStar. Deployment and the complete reliability acceptance run remain separate.

R05 has local evidence in [Import 05](../../../.scratch/import-persistence/issues/05-publish-import-events-only-after-successful-save.md): twelve orchestration and six PostgreSQL cases pass, including a deferred failure at transaction commit. Rejected batches release no events or outbox writes through ingestion. Best-effort publication after commit retains its documented loss window; R05 does not establish atomic delivery.

R06 has local evidence in [PS-06](PS-06-SESSION-VAULT.md): eight PostgreSQL cases, real-process file/database writers, corrupt-vault and replacement-failure cases, private HTTP errors, API/worker selection, built-worker startup, and CLI dry-run/apply/resume/read-back checks pass. Migration preserves age and hosted deletion/rejection state. The Windows file-symlink case was skipped for missing OS permission. Production migration and API/worker cutover have not been performed.

[PS-00's baseline record](BASELINE-CONTRACTS.md) distinguishes committed PS-01/PS-02 fixes, current passing controls, expected failures, and pending regression work. Expected-failure assertions do not satisfy these release cases. PS-02's existing live database evidence remains recorded in Import 02; it was not rerun by PS-00.

## Reliability acceptance

| ID | Scenario | Required result | Owner |
|---|---|---|---|
| R01 | Refresh an imported post with confirmed platform links, metric history, presentation, and creative-work membership. | Parent identity and all creator-owned relationships survive reload; accepted versions, audience, and media update. Verify real foreign keys as well as adapter behavior. | PS-01, PS-15 |
| R02 | Two processes import distinct posts for the same creator; one run also fails and retries. | Both accepted imports and replay markers survive. Failed work commits nothing and releases coordination; other creators can proceed. | PS-02 |
| R03 | An import conflicts with another owner after earlier valid records in the same batch. | The approved conflict policy preserves both owners; no partial destructive mutation, event, or false replay marker. Test approved legacy transfer separately. | PS-03 |
| R04 | New p2 references a new revision of media originally attached to unchanged p1. | Revision, associations, status, and marker agree after reload. Failed media persistence rolls back; replays do not duplicate history. | PS-04 |
| R05 | A batch is rejected or its save/commit fails after application collected events. | No batch events escape. Successful retry and committed replay retain the existing event contract and its stated crash limit. | PS-05 |
| R06 | Two creators update sessions concurrently across API/worker instances; repeat through restart and vault migration. | Both encrypted records survive; deletion/rejection is shared, original age is preserved, and no raw credentials reach logs. Corruption is surfaced. | PS-06 |
| R07 | OAuth responds sparsely, times out, rate-limits, or needs simultaneous token refresh. | Explicit field requests, safe audience handling, bounded retry, and coordinated rotation preserve accepted state. URL-only renewal does not invent content revisions. | PS-07 |
| R08 | A verified event is acknowledged, then the API/worker dies before dispatch or application. | Durable work resumes after restart. Invalid signature/owner is rejected. Duplicate/reordered events and repeated legitimate changes converge without an unbounded receipt store. | PS-08 |
| R09 | An old post changes audience/title/body/media or is deleted; deliver events late and out of order. | Targeted refresh bypasses discovery cutoff, access stays safe, deleted content is unavailable, and no 403/timeout becomes a deletion. | PS-09 |
| R10 | Member change/deletion is missed, repeated, continuously delivered, or absent from a later roster. | Targeted work plus complete reconciliation converges. Partial/failed/unexpectedly empty scans do not revoke the roster or another provider's access. | PS-10 |
| R11 | Archive and forward catch-up exceed one page budget; restart midway and add equal-time/newer posts. | Saved progress eventually covers all pages with no gaps or duplicates. Old cursor-only imports remain unknown until verified. Creator caps do not starve later creators. | PS-11 |
| R12 | Import without cookie, add consent later; exhaust one download, restore the source, then run ordinary sync. | Existing posts recover missing media without republishing or a manual whole-library refresh. URLs renew, failures remain actionable, and retries survive restart. | PS-12 |
| R13 | Browser cookie is unchanged while Relay loses its stored cookie or grant expires; reconnect to another workspace. | A real server check detects the condition. Reconsent captures the correct current session, cached state is rebound, and no local timestamp claims server success. | PS-13 |
| R14 | Run a Patreon metrics request inside installed Chrome and Firefox builds, with and without valid credentials. | Browser-managed authentication is observed on the actual request; missing counters and panel failures report partial/unavailable, not fabricated success. No scheduled tabs are opened. | PS-13 |
| R15 | Open Library with partial archive, stale access/member checks, failed media, and rejected credentials. | The existing UI separates each condition, shows its last verified time, and supports scoped repair. GET reads do not schedule business mutations. Desktop/mobile and keyboard behavior pass. | PS-14 |
| R16 | Browser closes; run OAuth-supported sync, missed-event reconciliation, and server-capable repair through restart. | Server work continues. Browser-only observations remain explicitly pending. Cross-posting, reminders, manual cookie fallback, provider lanes, and Relay-native content retain their contracts. | PS-15 |

PS-15 requires R01 to R16, with live staging evidence for provider/browser behavior. A mock passing is not a substitute for network authentication, real database coordination, or restart evidence.

## Evidence and product acceptance

| ID | Scenario | Required result | Owner |
|---|---|---|---|
| E01 | Compare a stale source update, recent capture, cumulative total, period total, and daily delta. | Distinct timestamps, aggregation, windows, and coverage survive persistence and rollup. Incompatible quantities are not summed; missing is not zero. | PS-16 |
| E02 | Import overlapping CSV exports and capture the same post through the extension. | Existing source precedence and per-grain dedupe hold. Period totals do not become invented daily deltas; unmatched post IDs remain recoverable. | PS-16, PS-17 |
| E03 | Capture conversions/revenue from a verified panel or export; omit some fields and vary locale/currency. | Supported measures retain Patreon meaning and units; unsupported/partial measures remain unavailable. Duplicate imports do not inflate totals or Relay support events. | PS-17 |
| E04 | Observe free, paid, trial, gifted, masked, canceled, and returning memberships. | Current access and historical payment/acquisition evidence remain distinct. Stable identity and retry-safe lifecycle events do not depend on email or invented history. | PS-18 |
| E05 | Change metadata/order and renew signed URLs on existing assets. | Metadata survives reload/replay without identity churn, lost curation, unnecessary downloads, or automatic cross-post merging. | PS-19 |
| E06 | Find and export an older asset; inspect a suggested related work and a failed item. | Existing Library search/details/manifests use the new metadata; matching requires confirmation and repair stays scoped. Desktop/mobile accessibility passes. | PS-20 |
| E07 | Ask Coach for paid-support evidence with sparse, stale, incompatible, or already-attributed observations. | Existing confidence thresholds and attribution classes hold. Patreon totals are source-reported evidence, free joins are funnel evidence, and no patron identities or duplicate conversions enter facts. | PS-21, PS-22 |

## Verification approach

Keep the smallest regression that fails for each defect, with the owning implementation. Reuse these existing suites before adding focused cases:

- Persistence: `canonical-store-db-save`, `canonical-store-presentation-ingest`, `creator-scoped-canonical-store`, `ingest-replay-compatibility`, `ingest-media-url-replay`, `ingest-deletion-replay`, `ingest-all-paid-replay`.
- Sync: `patreon-sync-state-watermark`, `patreon-sync-media-source`, `patreon-platform-webhook-route`, `patreon-member-sync-coordinator`, `patreon-sync-members-route`, `incremental-autosync-worker`, `patreon-oauth-proactive-refresh`, `patreon-sync-post-access`.
- Credentials/media: `patreon-cookie-auth`, `extension-consent-flow`, `identity/extension-session`, `export-media-retry`, `cookie-scrape-content-enrich`, `patreon-post-metrics-fetch`.
- Evidence: `patreon-insights-csv`, `patreon-metrics-parser`, `membership-ledger-sync`, `external-metric-rollup-service`, platform-instance suites, and connected Goal Cycle attribution/outcome tests.

Existing mocked tests cover portions of these contracts; new acceptance cases require new failure/restart/overlap fixtures. Use disposable PostgreSQL and Redis databases for destructive fixtures and multi-process checks. Never aim test cleanup at a shared development or production tenant.

For changed backend code, run focused tests and `npm run build`. For extension changes, run `npm run verify:phase2 --prefix extension` and installed-browser checks. For changed web code, run relevant tests, `npm run lint --prefix web`, `npm run build --prefix web`, and rendered checks. Finish integration with the root suite, recording pre-existing failures separately. These commands are future implementation checks; no runtime behavior was changed in the planning task.

## Release records

Keep reliability and metadata release records separate. Each names the commit/configuration, applicable work-item completion records, acceptance IDs, migrations, data movement, commands/results, staging observations, unavailable checks, and rollout/recovery owner.

Reliability can ship independently of metadata. New metadata collectors and views stay disabled until their evidence cases pass. Missing external access leaves its case open; elapsed time does not satisfy it.

## Deployment and recovery

1. Add compatible shared-store/cursor/work fields before deploying writers that need them. Existing rows retain unknown coverage where necessary. Inventory old readers/writers and remove incompatible writers from the rollout before they can overwrite new progress or state.
2. Migrate cookie records with read-back and retained encrypted backup. Check age, deletion, key availability, and API/worker consistency before switching the selected store.
3. Stage durable dispatch and consumers, then enable targeted events and reconciliation for a bounded cohort. Retain manual sync and repair. Prove that accepted receipts survive worker and API restarts.
4. Observe oldest pending work, last verified post/access/member state, archive coverage, repair backlog, retries/failures, and source-side rate responses using existing operational tooling. Fix per-creator starvation without creating an account-wide retry storm.
5. Stop affected processing on ownership violations, lost acknowledged work, false complete state, or persistent authorization failure. Keep accepted receipts, cursors, source observations, and creator records for diagnosis and replay. Disabling the extension adapter must not disable OAuth access checks.
6. Recover with a compatible fixed writer and bounded replay from saved progress. Do not roll back by restoring destructive import behavior, resetting cursors to a guessed completion point, widening access, or blindly replaying expired credentials. Treat source deletions and local cleanup as separate operations.
7. Release Phase 4 fields incrementally, then their Phase 5 consumers. A failed parser/measure can be disabled independently of sync, repair, access, and posting.

Existing Import 03's migration-policy approval still governs foreign-owner transfers. Platform permission for unsupported collection must be resolved before expanding collection or publicly rolling it out. Production changes, test publications, and extension-store releases require the applicable existing authorization; this plan performs none of them.
