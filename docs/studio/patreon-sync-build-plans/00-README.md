# Patreon sync reliability and metadata build plan

Status: PS-00 through PS-13 complete locally as of 2026-10-21, including the independently reviewed [PS-10 platform projection correction](PS-10-PLATFORM-PROJECTIONS.md), [PS-12 media repair](PS-12-MEDIA-REPAIR.md) and [PS-13 extension checks](PS-13-VERIFIED-EXTENSION.md). PS-14 is in progress. The latest combined production build passes; deployment and reliability release remain pending. PS-01 to PS-03 were completed by the existing import-persistence work; PS-03 landed separately as `c82c9ed`. The completion records below retain each item's checks and rollout limits.

Keep Relay's hybrid Patreon connection. Make imports, updates, access changes, and media recovery dependable before adding more analytics. Use the extension for the remaining browser-dependent work, while the server owns scheduling, progress, retries, and access decisions.

- [Phases and work items](PHASED-BUILD-PLAN.md)
- [Acceptance and rollout](ACCEPTANCE.md)
- [Deployment identity and isolated acceptance](DEPLOYMENT-READINESS.md)
- [Supervised execution and current claims](PROGRAM-EXECUTION.md)
- Completed reliability records: [PS-06 session vault](PS-06-SESSION-VAULT.md), [PS-07 OAuth](PS-07-OAUTH-RELIABILITY.md), [PS-08 durable work](PS-08-DURABLE-CHANGE-WORK.md), [PS-09 targeted posts](PS-09-TARGETED-POSTS.md), [PS-10 members](PS-10-MEMBER-RECONCILIATION.md), [PS-11 progress](PS-11-RESUMABLE-POSTS.md)
- [PS-10 proposed reconciliation design](PS-10-DESIGN.md)
- [PS-11 proposed archive and fairness design](PS-11-DESIGN.md)
- [PS-12 media repair completion](PS-12-MEDIA-REPAIR.md)
- [PS-12 proposed media repair design](PS-12-DESIGN.md)
- [PS-13 proposed extension checks and collection design](PS-13-DESIGN.md)
- [PS-13 verified extension checks](PS-13-VERIFIED-EXTENSION.md)
- [PS-14 proposed completeness and repair design](PS-14-DESIGN.md)
- [Metadata evidence readiness](METADATA-READINESS.md)
- [PS-00 baseline, contracts, and regression ownership](BASELINE-CONTRACTS.md)
- [Existing sync hardening ledger](../../part1-sync-hardening-ledger.md)
- [Patreon ingest contract](../../patreon-ingest-canonical.md)
- [Part 1 product scope](../../part1-patreon-pipeline-focus.md)

## Current work and reuse

The import-persistence tickets already own the shared storage changes. Continue those tickets and record their evidence there. This program references them without creating replacement implementations or changing their status.

| Existing work | Observed state | Treatment here |
|---|---|---|
| [Import 01: preserve links and metrics](../../../.scratch/import-persistence/issues/01-preserve-platform-links-and-metrics-on-post-refresh.md) | Complete, committed as `7cb5c70`. Imported parent posts update in place. The ticket records 154 focused tests and a later 34-test recheck, using mocked database adapters. | Accepted baseline; preserve its behavior. Live database relationship verification remains part of the reliability acceptance check. |
| [Import 02: overlapping imports](../../../.scratch/import-persistence/issues/02-preserve-overlapping-imports-for-one-creator.md) | Complete, committed as `4098b8c`. Database creator mutations lock before reading and share one transaction through saving. The ticket records six real PostgreSQL cases and a final 40-test recheck. | Accepted existing completion for PS-02; do not claim or implement it again. |
| [Import 03: creator ownership](../../../.scratch/import-persistence/issues/03-protect-creator-ownership-during-imports.md) | Complete in `c82c9ed` after separate policy approval in the owning chat. | Preserve its guards and decision record. PS-04 makes no ownership-policy change. |
| [Import 04: shared media revisions](../../../.scratch/import-persistence/issues/04-persist-shared-media-revisions-before-replay-markers.md) | Complete locally. Shared revisions, associations, and markers survive reload together; 14 new PostgreSQL cases pass in both provider lanes. | PS-04 completion record owns verification and limits. |
| [Import 05: events after save](../../../.scratch/import-persistence/issues/05-publish-import-events-only-after-successful-save.md) | Complete locally. Batch events publish after canonical saving resolves; 12 orchestration and six PostgreSQL cases pass. The commit-to-publication crash gap remains. | PS-05 completion record owns verification and delivery limits. |
| [PS-06: shared encrypted sessions](PS-06-SESSION-VAULT.md) | Complete locally. Coordinated file/database adapters, shared API/worker selection, and restartable migration are verified. Eight PostgreSQL cases include real-process writers, migration overlap, age, rejection, deletion, and database access controls. | Apply the reviewed migration and complete the recorded cutover before hosted rollout. Ownership policy is unchanged. |
| Existing export retries, Library Retry, tier normalization, sync health, OAuth refresh, signed webhooks, BullMQ jobs, CSV imports, and Platform Instances | Implemented building blocks with focused tests. Their recovery gaps are the subject of this program. | Extend the existing paths. Preserve shipped controls and caller contracts. |

Status is a snapshot, not a claim that no other worker has since started. Check the ticket, current diff, and latest verification before taking any work item. Do not reset another worker's changes or repeat completed work.

## Architecture responsibilities

| Responsibility | Owner |
|---|---|
| Campaign, tiers, members, and supported post metadata | Patreon OAuth API, mapped through the existing Patreon services |
| Campaign and creator ownership, access truth | Server validation and existing identity/access services; browser-supplied data cannot grant access |
| Change delivery | Signed webhook receipt persisted before acknowledgment, then existing job infrastructure |
| Initial archive and missed changes | Resumable server imports and bounded reconciliation |
| Missing media and expired URLs | Independent server repair work using the existing export path |
| Historical analytics | Creator-uploaded Patreon CSV, extended in place |
| Browser session consent and unavailable browser-only observations | Extension, bounded to the connected workspace and requested operation |
| Sync health and completion | Server-confirmed progress and results, projected into existing Library surfaces |

The current encrypted server-side Patreon session remains available for media retrieval. This plan does not move the entire importer into the browser. Routine API-supported sync must work with the browser closed. Closing the browser may delay browser-only observations, and that limitation must be visible.

The extension does not acquire a second job scheduler, become the authority for entitlements, run an always-on analytics scraper, or publish without creator confirmation. Its existing posting and reminder behavior remains intact.

## Phase order

| Phase | Work items | Exit condition | Initial status |
|---|---|---|---|
| 0. Confirm baseline and contracts | PS-00 | Current fixes and data boundaries are recorded; reproductions cover the remaining failures. | Complete; see baseline record |
| 1. Protect accepted data and credentials | PS-01 to PS-06 | Persistence survives overlap, conflicts, rollback, and session writes; existing import tickets are satisfied. | Complete locally; hosted migration/cutover and rollout verification remain pending |
| 2. Keep posts and members current | PS-07 to PS-11 | Durable targeted updates, safe deletion, complete roster reconciliation, and resumable archive/catch-up work. | Complete locally; production cutover and live acceptance remain pending |
| 3. Recover media and verify health | PS-12 to PS-15 | Media recovery and extension checks work end to end; reliability acceptance passes. | PS-12/13 locally complete; PS-14 in progress; PS-15 pending |
| 4. Collect useful evidence | PS-16 to PS-19 | Freshness, windows, conversions, member lifecycle, and asset metadata retain source meaning. | Waits for PS-15 |
| 5. Use the evidence in existing products | PS-20 to PS-22 | Library and Coach use the evidence without changing attribution or publishing contracts. | Waits for Phase 4 |

Default execution order is the numbered order in [the phased plan](PHASED-BUILD-PLAN.md). Design and fixture work may proceed before its implementation dependency, but integration and release must satisfy that dependency. Metadata collection and product implementation wait for PS-15. No delivery dates are assumed.

The PS-03 migration-policy decision does not block independent work on PS-04, PS-05, or PS-06. Serialize shared-file edits when that policy's implementation is ready. Phase 1's release condition still requires the ownership behavior to be resolved and verified.

## Working boundaries

- Implement bounded items in dependency order. The user has authorized scoped implementation and review agents under one supervisor; [the execution record](PROGRAM-EXECUTION.md) tracks claims. The existing ticket remains authoritative where one is linked.
- Serialize changes to `src/ingest/canonical-store-db.ts`, `src/patreon/patreon-sync-service.ts`, `src/server.ts`, job registration, `prisma/schema.prisma`, extension storage, and Library API contracts. Recheck adjacent workers' changes before merging.
- Keep code, necessary fixtures, migrations, caller updates, and focused verification in the owning item. Report pre-existing failures without unrelated fixes.
- Use Ponytail and scoped Ponytail Review for implementation. Apply the repository's UI and copy skills when an item reaches those surfaces. Verify changed UI at desktop and mobile sizes and test keyboard/focus behavior.
- Completion records include item ID, files, schema changes, commands/results, failure and recovery evidence, remaining limitations, and the next unblocked item. Production deployment is separate from local completion.
- Preserve creator-owned presentation, links, metrics, creative-work membership, Relay-native posts, provider boundaries, replay compatibility, and existing access safeguards. Shared ingest changes retain SubscribeStar behavior without expanding that provider's product scope.
- Airtable execution requirements remain retired. Escape Hatch remains deferred. No external messages, production migrations, backfills, extension-store publication, or deployment are performed by this planning task.

## Decisions already made and decisions still needed

The architecture and priority order above are set by this request. Reusing existing services and narrowing the extension do not require another architecture approval.

Import 03's separately approved migration policy remains in its owning ticket and runbook. Resolve permission for unsupported Patreon collection before expanding that collection or publicly rolling it out; the repository's [current rationale](../../cookie-auth-legal-rationale.md) is not evidence that permission has been granted. Internal reliability work and tests can continue while that question is resolved. Record the approved collection scope and evidence with the rollout record; do not contact Patreon as part of this plan.

Changing attribution thresholds, source precedence, paid-support definitions, or publishing autonomy requires an amendment to the owning product contract. This program preserves those contracts.

## External interface references

Recheck these when implementing a provider-facing item. Availability in a help article does not establish a public API field or guarantee that every creator sees the same panel or CSV columns.

- [Patreon API](https://docs.patreon.com/): explicit field requests, post and member resources, pagination, rate handling, and webhook management. The public Post schema does not document the complete media relationships used by Relay's cookie path.
- [Individual-post insights](https://support.patreon.com/hc/en-us/articles/41859205833741-View-insights-for-an-individual-post): Patreon-reported memberships, purchases, free-member growth, and media performance, where available.
- [Post Insights and CSV exports](https://support.patreon.com/hc/en-us/articles/360042841711-Post-Insights): bulk history and metric definitions.
- [Patreon security policy](https://www.patreon.com/policy/security): unsupported collection requires checking with Patreon first.
- [Chrome cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies) and [browser-controlled request headers](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header): use browser-managed credentials for extension fetches.

## Next action

PS-14 is implementing persisted completeness and targeted repair after PS-13 passed independent review. Concurrent Library edits are preserved. The latest combined build passes; isolated staging, remaining checks and live acceptance still precede release. The supervisor continues through PS-22 as dependencies and checks pass. Ownership policy is unchanged; metadata/product implementation still waits for PS-15.
