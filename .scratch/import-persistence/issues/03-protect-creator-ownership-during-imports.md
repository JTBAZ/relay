# 03: Protect creator ownership during imports

**What to build:** Establish an approved, bounded migration policy, then ensure an ordinary import cannot remove another creator's content when an imported identifier conflicts with an existing owner.

**Blocked by:** None. The user approved the assessed migration policy before implementation on 2026-10-20.

**Status:** complete

**Source:** Import persistence audit, finding 3. Automatic workspace reassignment deletes foreign-owned posts, media, or campaigns on identifier conflicts without establishing that the previous owner is eligible for migration. Existing tests intentionally allow legacy reassignment, so changing that behavior requires an explicit policy decision.

**Approved migration policy:** Ordinary imports reject every foreign owner, including Relay-native content and `dev_creator`. Missing identity or OAuth records do not establish migration eligibility. Prefer verified routing or an eligible studio claim that retains the canonical creator ID. A true content move requires separate approval of a named source, destination, exact content, ownership evidence, dependent records, replay handling, and recovery plan. This approval authorizes no actual transfer, automatic legacy exemption, override flag, schema migration, or replay reset. See the [operator runbook](../../../docs/database/identity-reconciliation-runbook.md#canonical-import-ownership-conflicts).

**Scope:** Foreign-owner conflict handling and the smallest migration path required by the approved policy. Preserve valid same-creator imports and legitimate legacy migration needs. No automatic tenant merging, broad authorization or RLS redesign, schema-wide identity rewrite, live migration, or unrelated data cleanup.

- [x] Complete a read-only assessment of current reassignment behavior, its callers and tests, and the evidence available to distinguish active owners from eligible legacy sources. Record unresolved cases without treating missing evidence as migration permission.
- [x] Present the recommended eligibility, ownership proof, authorization, ordinary-conflict behavior, operator workflow, and rollout/recovery policy for explicit user approval before changing code.
- [x] After approval, an ordinary batch for creator B that conflicts with creator A follows the approved conflict behavior without deleting, transferring, or partially changing either creator's posts, media, campaign/tier relationships, dependent records, or replay markers.
- [x] Valid same-creator imports retain their behavior. Any approved legacy transfer is a distinct deliberate action and affects only the authorized content and owners.
- [x] Focused regressions seed an active foreign owner and verify preservation after a conflicting batch, including a batch with earlier otherwise-valid records. Test any approved legacy transfer separately from normal ingestion.
- [x] Record the approved policy and run the affected ownership, migration, and persistence checks plus scoped Ponytail Review before implementation completion. Preserve unrelated work; do not execute a live transfer as part of this ticket.

## Implementation and verification (2026-10-20)

Database canonical saves check campaign, stored tier, post, and media ownership before any persistence writes and again after writes. References to campaigns, tiers, and posts receive the same check. The post-tier check uses the latest deduplicated version that persistence actually writes. The destructive reassignment block is removed. A conflict rolls back the creator's whole transaction, including earlier valid records and replay-marker changes.

Campaign and tier updates filter by creator; a missing owned row is inserted. If another creator wins that ID after preflight, the insert fails instead of updating the foreign row. After rollback, a fresh ownership check converts that unique-key collision into the typed conflict. Explicit Read Committed transactions and the final reference check also cover references whose foreign owner appears after preflight. The existing creator lock, provider lanes, replay encoding, native-content preservation, and platform links/metrics remain intact.

Synchronous canonical, Patreon, and SubscribeStar ingestion return HTTP 409 with `INGEST_OWNERSHIP_CONFLICT` and a generic message. Paged SubscribeStar ingestion propagates this error to its route. Public responses omit foreign identifiers; logs and dead letters retain the conflict details. Queue retries and the original failed batch are preserved. Earlier committed pages remain committed.

No legacy content transfer was approved or executed. The runbook describes evidence, authorization, inventory, stable-ID routing/claim repair, stopped writers, backup, verification, and recovery for a separately approved operator case. A general transfer command is outside this ticket.

- The new foreign-owner unit regressions failed against the original reassignment behavior. Real PostgreSQL race tests also exposed that owner-filtered Prisma upserts could still update a foreign campaign/tier; owner-filtered updates plus inserts fixed that race.
- The final dedicated run passed all 38 tests: 16 real PostgreSQL concurrency/preservation checks and 22 creator-scoped checks. PostgreSQL cases cover campaign/post/media conflicts, native content, dependent links/metrics/presentation/work membership, earlier valid records, replay rollback, and competing campaign/tier/post/media IDs and campaign references.
- All 191 tests passed across the 20 connected persistence, replay, link/metric, presentation, backfill, export, HTTP, queue, and paged-ingestion suites. Including PostgreSQL, verification covers 207 tests across 21 suites. The slow broader run spent most of its time collecting server imports and completed without a failure.
- Strict TypeScript checks passed for the six affected persistence, concurrency, queue, and paged-ingestion test files and their connected source imports. HTTP ownership-response and queue diagnostics regressions passed in the focused development run. A combined run hit an earlier 15-second database-test deadline under workspace load; the final 30-second test deadline passed with the runtime transaction timeout unchanged.
- The current schema was applied only to a separate disposable loopback PostgreSQL cluster, through the existing explicit test URL guard. No shared database, provider, schema, migration, dependency, or application configuration was changed.
- Source transpilation passed for the five changed source files. The staged whitespace check respects the server file's existing CRLF line endings. Only the task's five server hunks are staged; reversing them reproduces its pre-existing working-tree contents. Other work remains unstaged, including concurrent edits observed in three editor-bench files.

## Ponytail Review

What this change does: Imports stop when an identifier belongs to another creator. The entire creator save rolls back, and concurrent claims cannot turn that rejection into a foreign update.

Scope: Only this ticket's hunks against `4098b8c`: canonical ownership checks and safe campaign/tier writes, the typed error, four HTTP catch blocks and their import, queue diagnostics, paged SubscribeStar error propagation, focused tests, and these policy/contract notes. Existing server changes and other working-tree work are excluded. Connected code inspected includes canonical save/mutation callers, ingestion enrichment/apply/replay, provider mapping, file-store behavior, packaging helpers, HTTP and queued ingestion, SubscribeStar autosync, operator backfill/reconciliation, and relationship persistence. Expected load is multiple API/worker processes sharing PostgreSQL.

Looks good. Ship. No blocking findings remain in scope. Ownership checks are bulk queries, at most four before and four after a save, with no new query per post. New campaigns/tiers need an insert after a failed owned-row update. There is no new lock framework, dependency, schema change, transfer bypass, or replay rewrite.

Rollout: Inventory legacy collisions, back up, drain ingestion, and replace all API/worker writers together. Old writers can still reassign foreign content. Explicit snapshot replacement remains an offline maintenance operation; global saves commit creators separately. Existing imports that depended on automatic reassignment now require routing repair or a separately approved operator case.

Not checked: Full repository build/suite, live provider traffic, production collision inventory, mixed-version deployment, or live identity/content repair. Shared-media persistence and pre-save event publication remain separate tickets 04 and 05; no implementation of either is included here.
