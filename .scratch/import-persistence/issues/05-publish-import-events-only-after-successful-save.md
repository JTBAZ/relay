# 05: Publish import events only after a successful save

**What to build:** Downstream consumers receive publication events only for imports whose canonical save succeeded. A failed import must not announce content that was never committed.

**Blocked by:** None (can start immediately).

**Status:** complete locally (2026-10-20, Review Patreon sync flow)

PS-05 is owned by the current sync chat after checking the ticket, current diff, recent commits, and active chats. The separate PS-03 owner is idle after commit `c82c9ed`. Preserve the uncommitted PS-04 work and all unrelated changes. Ownership policy remains outside this ticket.

**Source:** Import persistence audit, finding 5. Batch application publishes events before canonical persistence finishes. The event bus can insert an outbox record independently even when the canonical transaction later fails.

**Scope:** Buffer this batch's publication events during application and release them after the canonical mutation/save succeeds. Preserve the event bus contract for other producers and its existing delivery-failure behavior. Crash-safe atomic outbox delivery is a separate durability decision; this ticket does not introduce a queue, schema migration, global event-bus redesign, or exactly-once delivery guarantee.

- [x] Rejection before writes, failure during saving, and transaction commit failure publish no events for that batch and create no outbox records through its publication path.
- [x] A successful import publishes its accepted post events after save completion with the existing names, payloads, producer identity, creator trace, and ordering.
- [x] A retry after a rolled-back save publishes the expected events once the retry succeeds. Replaying a committed batch emits no additional publication events.
- [x] A batch rejected by replay compatibility or ownership checks releases no buffered events, including events collected before a later record fails.
- [x] Keep existing post-save event-delivery failure semantics explicit. Do not claim that buffering closes the process-crash gap between canonical commit and publication.
- [x] Add focused ingestion orchestration regressions covering save/commit rejection, successful publication timing and payloads, and retry/replay behavior. Run connected event and ingestion checks plus scoped Ponytail Review; preserve unrelated work.

## Implementation and evidence (2026-10-20)

`src/ingest/ingest-service.ts` uses a batch-local `InMemoryEventBus` during application, then publishes through the configured bus after `mutateForCreator` resolves. The store's promise covers saving and database commit. Rejected mutations discard their buffer. The existing bus constructs the externally visible IDs/timestamps and retains event names, payloads, producer, tenant/trace correlation, and per-batch ordering. No caller, low-level batch application, or global bus interface changed.

Eight of the twelve new orchestration cases failed against the original code. After the fix, all twelve pass: rejection before application, failure during saving, held/rejected commit, successful timing and payloads for both providers, retry/replay, ownership and replay conflicts, overlapping buffers, asynchronous outbox error handling, and a synchronous partial-publication failure.

Six additional cases use the real canonical store and `DbEventBus` against a disposable loopback PostgreSQL database. For both providers, a late post-version CHECK failure and a deferred constraint trigger failure at COMMIT leave no content, replay markers, in-memory events, or outbox rows for the rejected creator. After removing the fault, retry produces two events/outbox rows and committed replay adds none. Actual ownership rejection of a mixed batch leaves the existing owner unchanged and publishes nothing for the rejected batch.

The integration suite requires `CANONICAL_STORE_TEST_DATABASE_URL` and rejects URLs outside the dedicated loopback `relay_ingest_test_<uuid>` pattern. It never falls back to the application's configured database. Fault constraints/functions were removed and checked absent after testing; the disposable PostgreSQL server was then stopped. No production schema or migration changed.

- `node node_modules/vitest/vitest.mjs run` passed all 219 checks across 23 connected suites. This includes 36 real PostgreSQL cases and five expected-failure baselines still assigned to PS-09, PS-11, and PS-12. PS-05's former expected failure is now a normal passing assertion in `tests/patreon-sync-baseline.test.ts`.
- The suites were `ingest-service-events` (unit and integration), `patreon-sync-baseline`, `canonical-store-concurrency.integration`, `canonical-store-shared-media.integration`, `canonical-store-db-save`, `canonical-store-presentation-ingest`, `creator-scoped-canonical-store`, `ingest-media-url-replay`, `ingest-deletion-replay`, `ingest-replay-compatibility`, `ingest-all-paid-replay`, `media-storage-key`, `export-media-retry`, `workstream-b.ingest`, `workstream-b.retry-dlq`, `ingest-health-metrics`, `ingest-health-route`, `auto-enrich`, `patreon-sync-state-watermark`, `patreon-sync-media-source`, `run-subscribestar-posts-graphql-ingest`, and `subscribestar-creator-sync-posts-route.integration`.
- Strict TypeScript checks passed for the two new suites, the updated baseline, and their connected source imports. `npm run build` passed, including Prisma generation, backend compilation, and asset copying. Build generation ran after the tests to avoid Windows runtime file locks.
- Initial hashes were compared for 80 existing files. PS-04's canonical-store source, shared-media test, and completion ticket remained unchanged. Five unrelated Library-planning documents changed concurrently; those edits were preserved. This item adds no dependency, application configuration, schema migration, provider request, commit, push, or deployment.

## Delivery limits

`DbEventBus` remains asynchronous and best effort. It ignores duplicate-key insert errors and logs other insert failures; these do not reject `runBatch`. The returned `events_emitted` count does not guarantee durable delivery. A synchronous publisher error still propagates and stops later publication, now after canonical commit; a committed replay does not recover the unpublished remainder. A process crash after canonical commit or before asynchronous outbox persistence can lose events. Atomic outbox delivery and exactly-once semantics remain separate work.

## Ponytail Review

What this change does: Failed imports stop announcing uncommitted posts. Accepted batches publish their buffered events after saving and database commit succeed.

Scope: Only PS-05's import/buffer/publication hunks in `src/ingest/ingest-service.ts`, the two new `ingest-service-events` suites, the PS-05 baseline conversion, the event-timing contract paragraphs, this ticket, and PS-05 completion notes under `docs/studio/patreon-sync-build-plans/`. PS-04's persistence changes, PS-03's policy and implementation, and all other dirty files are excluded. Connected code inspected includes both canonical adapters and their transaction boundary, batch upsert/replay/tombstones, enrichment, both event buses, event contracts, HTTP/provider/queue callers, export ordering, and ingest health metrics. Expected load is multiple API/worker processes sharing PostgreSQL.

Looks good. Ship. No blocking findings remain in scope. The buffer is local to each call, so failed or overlapping attempts cannot flush another batch's events. The fix reuses the existing bus, adds no database queries or global state, and preserves the configured publisher's failure behavior. The documented crash gap is part of this ticket's bounded scope.

Not checked: The full repository suite, live provider traffic, production rollout, process-kill durability, or recovery of events already lost before this fix. No atomic delivery guarantee is claimed.

Next Phase 1 item: PS-06, after checking current ownership and receiving authorization to proceed. This item does not start it or change ownership policy.
