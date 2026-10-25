# Selected piece subject and evidence implementation

Status: SPP-01 accepted, 2026-10-22. Sol planned, Luna implemented, and the supervisor independently reviewed and verified the subject/evidence contract. The user authorized supervised implementation of the [selected piece performance plan](SELECTED-PIECE-PERFORMANCE-PLAN.md). The first acceptance gate has passed; later chat integration remains a separate ticket.

## Scope

Add a backend read module and focused tests under `src/analytics/` and `tests/`. SPP-01 resolves one owned selected post or explicit Work/Bundle and returns typed metric facts with source provenance, coverage, freshness, and a frozen subject fingerprint. Finding generation, AI interpretation, session history, HTTP wiring, and product UI belong to later tickets.

No provider call, source edit, platform refresh, draft, goal, publishing task, schema change, deployment, or live-account mutation is part of this ticket. Existing analytics/Coach behavior stays unchanged. The working tree contains unrelated server, AI, editor, extension, and UI changes; those are outside the SPP-01 edit scope.

## Sol implementation decisions

The internal module consumes a trusted creator principal supplied by the authenticated host. It requires the existing Tenant and filters every domain read by that creator. It does not create another account authorization path. Missing and foreign subjects share a not-found result.

Without an explicit hint, one distinct selected post means post scope. Multiple selected media from one post do not widen that scope. A post hint must refer to a selected post. A work hint must contain the submitted anchor posts, and its complete membership comes from the server. A post never expands to sibling posts implicitly.

Load at most 17 member rows and 33 active platform instances to detect the approved limits of 16 posts and 32 instances. Reject an oversized subject before loading its metrics. Freeze a stable fingerprint of the creator, selected scope, member IDs, and current instance/link identities. Later history persistence will reread that binding and reject a changed subject.

Resolve snapshots against the current owned link. Include instance-only snapshots; admit attempt-only legacy snapshots only when the current attempt and saved external identity match. Order observations by capture time, existing source priority for ties, then stable record ID. A newest null remains unknown and blocks an older known value. Read latest counters independently of a bounded history query so a history cap cannot hide the current counter.

CSV observations need an owned post association and both an upload time and effective observation time at or before the frozen cutoff. Preserve row/import references and distinguish supplied observation time from import-time fallback. CSV fills a metric only when no eligible captured snapshot exists, including a null snapshot.

A cumulative window change requires a valid baseline at or before the window start, an ending observation within the window, compatible counter/link semantics, and checked history without a reset or unresolved gap. Existing rollup aggregation's absolute-value fallback cannot establish that change. A fresh rollup computation cannot establish a fresh platform observation.

Relay-native views, likes, and comments are recorded event counts within a period. Aggregate in the database using the existing event mappings and exact creator/post filters. Preserve the rollup's maximum-per-day merge across overlapping view sources. Empty event collection does not prove zero collection coverage, and period event counts never become lifetime counters.

Current collector support differs from the destination adapter catalog: the extension refresh flow currently collects Patreon metrics. Its established expected fields are impressions, seen, likes, and comments; views can be shown when captured. Historical X, DeviantArt, and Bluesky snapshots remain usable, but their absence must not create invented mandatory collector fields or promise a working refresh. Relay has its existing three event metrics.

Keep genuine zero counters, unknown values, missing data, stale observations, and backend failures distinct. Partial source failure may yield a partial report when usable evidence remains. Total evidence failure is unavailable, never a successful no-data report. A PostgreSQL query failure aborts its transaction; error handling must respect that instead of claiming success from an aborted read.

## Required verification

The new contract tests cover ownership, selection scope, subject/link fingerprints, bounds, exact link identity, null versus zero, source ties, CSV cutoffs, valid and invalid period changes, history overflow, observation freshness, Relay event aggregation, and partial/total failure. Fakes must check the query filters and bounds as well as the returned figures.

Run the new focused tests, existing performance read/snapshot/rollup/Coach suites, and the root backend build. Review the new files and the existing helpers they call using the repository's required Ponytail Review. Record failures and fixes before accepting this ticket. No UI, installed-extension, or live platform verification is claimed by these checks.

## Baseline

Before SPP-01 implementation, this regression command passed all 57 tests in five files:

```text
npm run test -- tests/performance-intelligence-read.test.ts tests/external-post-metrics-service.test.ts tests/external-metric-rollup-service.test.ts tests/coach-fact-pack.test.ts tests/coach-propose-service.test.ts
```

The baseline backend build also passed before implementation.

## Delivered contract

[`piece-performance-facts.ts`](../../src/analytics/piece-performance-facts.ts) exports `buildPiecePerformanceFacts` and `readPiecePerformanceBinding`. The builder returns owned subject metadata, metric facts, coverage, source failures, and an observation-independent binding fingerprint. The binding-only read permits later session persistence to recheck the subject without loading metrics again.

The current implementation uses raw snapshot boundary evidence for cumulative changes and parameterized SQL for bounded daily native-event aggregates. It does not read daily rollups as evidence of capture freshness or period change. Latest per-source counter reads remain independent of the bounded history reads. Newest null observations retain provenance. CSV cannot replace a possibly newer snapshot when its lookup failed. Explicit platform filters skip unrelated evidence readers while retaining a fingerprint of all current subject links.

[`piece-performance-facts.test.ts`](../../tests/piece-performance-facts.test.ts) contains 24 contract tests. They cover ownership and scope, membership/link bounds and fingerprints, exact legacy identities, null/zero handling, source precedence and validation, CSV cutoffs and overflow, optional captured Patreon views, exact snapshot baselines and counter resets, native event aggregation, and failure isolation.

## Supervisor verification

The supervisor reran the following checks after Luna's final fixes:

```text
npm run test -- tests/piece-performance-facts.test.ts tests/performance-intelligence-read.test.ts tests/external-post-metrics-service.test.ts tests/external-metric-rollup-service.test.ts tests/coach-fact-pack.test.ts tests/coach-propose-service.test.ts
Result: 6 files passed, 81 tests passed (24 new contract tests and 57 existing regressions).

npm run build
Result: passed Prisma generation, backend TypeScript compilation, and build asset copy.
```

The required Ponytail Review covered the complete two new files and their connected range resolver, source precedence/confidence helpers, metric models, migrations, and collector behavior. Review fixes addressed bounded event aggregation, UTC date handling, false rollup baselines, source failure attribution, filtered-link fingerprints, unknown-source records, lost null provenance, CSV overflow/fallback, and optional Patreon views. No blocking finding remains in that scope. Unrelated working-tree changes were preserved.

Acceptance is limited to the backend contract and fixture/query-contract tests. No live or disposable PostgreSQL instance, production query plan/latency, real-account metrics, AI, HTTP/chat mounting, or browser journey was exercised. In particular, the SQL aggregate tests check parameterization and scope through a fake client; they do not constitute a live PostgreSQL execution proof. Cumulative period changes intentionally remain unavailable without an exact boundary observation and compatible checked history.

SPP-01 passes its subject/evidence gate. SPP-02 may now add grounded findings and interpreter behavior; SPP-03 owns route/session persistence and SPP-04 owns the product mount.

### Integration correction, 2026-10-23

SPP-02 review found that the new destination validator included Instagram and omitted Bluesky, contrary to Relay's existing distribution catalog. Luna aligned it with `DISTRIBUTION_DESTINATIONS` plus Relay and added a Bluesky-accepted/Instagram-rejected regression. The supervisor independently reran the six suites above: all 82 tests passed, including 25 subject/evidence tests. The SPP-02 backend build will verify the shared import. This correction changes no collector or existing analytics behavior.

SPP-03 integration also aligned subject names with Relay's existing custom/work/series naming resolver and made binding reads transaction-compatible. Focused persistence tests verify owned naming graphs, foreign-relation defenses, and fingerprint changes. Its independent 208-test regression gate and backend build passed. A disposable PGlite integration case executed the native event SQL, proving that seeded views appear as window activity without a captured-total claim. See [SPP-03 acceptance](SPP-03-IMPLEMENTATION.md) for the engine and verification limits. This supersedes the earlier absence of a database execution proof for that projection.
