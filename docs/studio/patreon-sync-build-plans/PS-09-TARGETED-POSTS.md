# PS-09: Targeted post refresh and safe deletion

Implemented in “Review Patreon sync flow” on 2026-10-20 at `91a72d2`, with the existing PS-07/PS-08 and concurrent Library changes preserved. Status: complete locally. Independent scoped Ponytail Review approved the runtime changes, and the supervisor confirmed the root build passes. Changes remain uncommitted. No deployment or production migration was performed.

## Current-source behavior

Signed post work carries its resource ID into `PatreonSyncService.refreshPost`. The worker refreshes that post directly, without consulting or advancing the publication watermark. The creator token must still expose the signed campaign. A successful single-post response must contain the requested resource and matching campaign relationship. Single-post OAuth requests now request the campaign relationship. Cookie detail requests also validate the resource and campaign, use the bounded request helper, and retain existing session-rejection handling.

The first canonical commit applies authoritative OAuth content and access while retaining accepted media associations. Cookie collection and blob export follow that commit. A public-to-paid change therefore closes both the canonical tier gate and the database head gate before media can wait or fail. The media stage retains its separately collected OAuth payload. When no cookie exists and OAuth provides no media, accepted media remains available under the updated gate; complete media recovery remains PS-12 work.

A signed delete is a request to check current source state. A current 200 response refreshes the existing resource. Only OAuth 404 or 410, following campaign validation and canonical campaign-binding checks, can produce a tombstone. Update failures, malformed resources, unknown audiences, 403 responses, and timeouts cannot establish deletion. Pending, running, and failed durable work retain unresolved signed-delete intent when a later update coalesces into the same row. Successful completion ends that latch; every execution still rereads current upstream state.

## Shared persistence and ordering

Fresh targeted, campaign, and access-only collections compare their expected post state inside the existing canonical creator transaction. The comparison includes the accepted observation, source, status, head revision/sequence, access, and referenced media heads and URLs. A later accepted observation invalidates an older fetch, including unchanged observations and shared-media changes accepted through another post. Network calls remain outside the canonical lock. Rejected stale work remains retryable through the existing durable work path.

The existing idempotency table stores one `patreon_post_observation:v1` fence per post. It also stores `patreon_post_deletion_observed:v1` entries keyed by post and accepted head sequence. These entries preserve the first accepted Relay observation for retry identity; they do not claim a provider deletion timestamp. Tombstones retain their existing deletion-key format. Fresh authoritative restoration creates a new occurrence even when content matches the deleted head, so a subsequent real deletion has a separate identity. Access-only changes retain canonical public-tier representation; fresh snapshot resolution checks actual access as well as the revision string before treating an observation as replay. Stored batch replay keeps its existing behavior.

Targeted signed post work requires an adapter that commits shared creator mutations atomically. `DbCanonicalStore` declares that capability. Signed HTTP acceptance returns a private 503 for post work when the selected adapter lacks it; an incorrectly configured worker fails before provider I/O and retains durable retry state. Configure `RELAY_DB_STORE_CANONICAL=1` consistently on API and workers, alongside PS-08's database/BullMQ configuration. The existing file adapter has no cross-process mutation lock, and this item makes no such guarantee for ordinary file-backed sync.

Canonical posts retain their verified campaign binding, including public posts in creators with multiple campaigns. Gate/status/content changes keep accepted media IDs in place and use the existing guarded media updater. Pinned comment and engagement foreign keys therefore survive refresh and soft deletion. Creator presentation, tags, platform links, creative-work membership, version history, storage keys, native posts, provider boundaries, and ownership rejection rules remain intact.

No schema or migration is added. The new namespaces use the existing `IngestIdempotencyKey` storage. PS-08's migration remains a rollout prerequisite.

## Exact review scope

Runtime changes are limited to these files and purposes:

- `src/ingest/canonical-store.ts`: optional campaign binding and atomic-mutation capability.
- `src/ingest/apply-batch.ts`: retain a supplied single campaign binding on accepted post rows.
- `src/ingest/canonical-store-db.ts`: round-trip/validate that binding, persist changed head gates, compare changed version gates, and retain accepted media rows through the existing guarded update lane.
- `src/ingest/ingest-service.ts`: capture expected states, check them within canonical mutation, and publish only after the accepted mutation commits.
- New `src/patreon/post-refresh-state.ts`: observation fences, stable deletion observations, media-preserving access staging, and state comparisons.
- `src/patreon/current-snapshot-revisions.ts`: fresh restoration and actual-access checks before revision reuse.
- `src/patreon/patreon-sync-service.ts`: targeted orchestration and expected states for campaign collection.
- `src/patreon/patreon-resource-api.ts` and `src/patreon/cookie-scraper.ts`: campaign-bound single-resource collection.
- `src/patreon/patreon-webhook-platform.ts`: dispatch resource identity to targeted refresh.
- `src/patreon/patreon-change-work.ts`: retain unresolved signed-delete intent through coalescing.
- `src/patreon/sync-post-access-from-oauth.ts`: collect access observations, then check and apply them together under the canonical creator lock. Generic/manual audience-helper callers are unchanged.
- `src/server.ts`: one signed-post acceptance condition requiring the shared canonical capability. Concurrent Library route hunks are outside this scope.

New regressions are `tests/patreon-targeted-post.test.ts`, `tests/patreon-targeted-post.integration.test.ts`, and `tests/helpers/patreon-targeted-post.ts`. Existing fixture changes are limited to targeted resource setup and two normal passing PS-09 assertions in `tests/patreon-sync-baseline.test.ts`, the new capture-method mock in `tests/patreon-oauth-enrichment.test.ts`, shared/file configuration cases in `tests/patreon-change-acceptance.integration.test.ts`, and required adapter mocks/assertions in `tests/canonical-store-db-save.test.ts` and `tests/canonical-store-presentation-ingest.test.ts`.

The supervisor's independent scoped Ponytail Review covers these hunks and their connected callers. Snapshots taken before each shared-file edit support the scoped diff. Original CRLF conventions, including existing mixed endings in the database adapter fixture, were preserved. Program indexes, central acceptance/baseline records, ownership policy, and Library implementation are outside this builder's edits.

## Verification

The final connected invocation passed all 26 suites and 261 checks with no skips. Fourteen new unit cases and fourteen actual PostgreSQL cases cover targeted refresh, failure classification, staged gates, independent clients, delayed campaign/access snapshots, shared media, identical restoration, repeated deletion, multiple campaigns, native records, audit foreign keys, and durable coalescing. The two PS-09 baseline assertions are normal passing tests. Three expected failures still belong to PS-11/PS-12 and do not establish those features' completion.

The run used the task-owned disposable PostgreSQL database on loopback port 49952 and Redis on 49953, with explicit `CANONICAL_STORE_TEST_DATABASE_URL`, `PATREON_CHANGE_TEST_REDIS_URL`, `REDIS_URL`, and `SKIP_REDIS_IT=0` in the child shell. The test database guard rejects ordinary database URLs. The command was `npx vitest run` with these test filters:

```text
tests/patreon-targeted-post.integration.test.ts
tests/patreon-targeted-post.test.ts
tests/patreon-change-acceptance.integration.test.ts
tests/patreon-change-work.integration.test.ts
tests/patreon-change-bullmq.integration.test.ts
tests/patreon-current-snapshot.integration.test.ts
tests/canonical-store-shared-media.integration.test.ts
tests/canonical-store-concurrency.integration.test.ts
tests/canonical-store-db-save.test.ts
tests/creator-scoped-canonical-store.test.ts
tests/canonical-store-presentation-ingest.test.ts
tests/ingest-replay-compatibility.test.ts
tests/ingest-media-url-replay.test.ts
tests/ingest-deletion-replay.test.ts
tests/ingest-all-paid-replay.test.ts
tests/ingest-service-events.test.ts
tests/ingest-service-events.integration.test.ts
tests/patreon-sync-baseline.test.ts
tests/patreon-oauth-enrichment.test.ts
tests/patreon-oauth-reliability.test.ts
tests/patreon-sync-post-access.test.ts
tests/patreon-sync-post-access-route.test.ts
tests/patreon/patreon-resource-api-fields.test.ts
tests/register-workers.test.ts
tests/patreon-platform-webhook-route.test.ts
tests/patreon-sync-media-source.test.ts
```

Strict TypeScript checking of the changed tests and connected runtime imports passed using a temporary configuration extending the repository's strict settings. Earlier checks encountered temporary errors in the concurrently edited Library route; this builder did not change that route. The final strict check has no remaining diagnostics. The supervisor ran `npm run build` after the PostgreSQL clients closed. Prisma generation, the production TypeScript build, and asset copying passed.

The connected run includes PS-04's fourteen real-database media cases in both provider lanes, sixteen canonical concurrency/ownership cases, post-commit failure/rollback checks, and real BullMQ recovery. No live Patreon request, hosted configuration change, full repository suite, or production rollout is claimed. PS-15 retains the live staging gate; PS-10 is the next item after this accepted local result.
