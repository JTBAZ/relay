# PS-07: OAuth request reliability

Claimed in “Review Patreon sync flow” on 2026-10-20, starting at `91a72d2`.
The other implementation chats were idle, PS-07 had no claim, and the working tree was clean.

Scope: explicit post fieldsets, bounded requests and provider retry delays, sparse response validation, stable content/access revisions, list-first enrichment, and coordinated creator-token rotation. The hybrid architecture and existing ownership policy stay in place.

Status: complete locally on 2026-10-20. Changes are uncommitted; hosted rollout is pending.

## Implemented behavior

List and single-post OAuth requests share the supported post fieldset, including `embed_url` and `embed_data`. Pagination retains cursors and reapplies fields. Next links must use HTTPS, the Patreon API origin, and the same campaign/resource path; redirects are rejected before forwarding credentials. These choices follow the [Patreon v2 resource and field documentation](https://docs.patreon.com/#post-v2).

Requests allow at most three attempts, ten seconds per attempt including the body, and a 35-second overall budget. GETs retry transient transport/5xx failures. Token POSTs retry only explicit 429 responses because replaying an interrupted rotation could spend the refresh token twice. Short delays honor the larger of `Retry-After` and Patreon's documented [`retry_after_seconds`](https://docs.patreon.com/#rate-limits). Delays above five seconds return a safe retryable error with the required delay instead of sleeping in an HTTP request. Provider bodies and credentials do not enter these errors. Existing sync health records the failed run as `patreon_retry_required`.

Missing or invalid publication dates and unknown audiences fail before canonical post ingestion. OAuth `is_paid: false` alone cannot establish public access: Patreon defines it as pay-per-post billing. Explicit `is_public`, concrete tiers, and the conservative cookie rules retain their source-specific behavior. Nullable title/content/embed values remain supported.

Post revisions include normalized content, access, and ordered media identities. Media revisions use their own normalized identity, location, MIME type, and role; title/access changes do not create media revisions. Known Patreon CDN sizing and signature parameters are excluded from comparison while original fetchable URLs remain on the payload. Other hosts and meaningful URL parameters retain their identity.

Fresh Patreon snapshots resolve content-hash occurrences inside the existing creator-serialized canonical mutation. The accepted version sequence distinguishes A → B → A from replay. Repeated current observations reuse their accepted revision; stored batch replays keep the existing marker rules. This is an internal ingest option used only after provider collection, with no new wire field or database schema. Older timestamp-based markers and IDs remain intact. The first upgraded observation can create one new accepted revision.

Cookie enrichment starts with the OAuth list, fills missing bodies and authoritative access, stops after the last target, then uses single-post fallback for unresolved gaps. An OAuth-only import uses its already fetched metadata. Failed pagination or per-post requests abort before post ingest and watermark advancement.

Token stores serialize read/rotate/write across API and worker processes. PostgreSQL uses a creator advisory lock in a Read Committed transaction, with a ten-second lock timeout and 50-second transaction timeout. Local files use the existing `proper-lockfile` dependency and atomic encrypted replacement. All token writes use the same store boundary. A waiting automation rereads the stored token and expiry under the lock, skips a completed rotation, and preserves `provider_user_id`. Corrupt local stores fail closed.

## Review scope and operating limits

Ponytail Review is limited to this item's hunks in `src/auth/{auth-service,patreon-client,token-store,token-store-db}.ts`, `src/ingest/ingest-service.ts`, `src/patreon/{patreon-resource-api,patreon-sync-service,map-patreon-to-ingest,sync-post-access-from-oauth,sync-error-copy}.ts`, the three new Patreon request/revision helpers, their new tests, related fixture expectations, and this item's status documentation. Connected reads cover caller wiring, refresh callers, access normalization, canonical replay, shared-media saving, post-commit events, and HTTP/worker health recording. Expected load is the hosted API with independent worker processes. Concurrent Library docs and generated evaluation outputs are outside this scope.

Deploy compatible token writers together. Hosted API and workers must use the existing shared creator OAuth database store (`RELAY_DB_STORE_CREATOR_OAUTH=1`), the same database and encryption key; local file locks coordinate only processes using the same file. No migration or ownership-policy change is introduced here. PS-06's production vault cutover still applies.

A provider can consume a rotating token just before a network interruption, process death, or failed local commit. The bounded client avoids ambiguous immediate POST retries, but cannot atomically commit with Patreon; reconnect can still be necessary. Durable delayed dispatch and missed-event recovery belong to PS-08 onward. Long retry delays are reported in health and the typed error; this item does not persist a cross-run cooldown or reschedule durable jobs. Archive completion, old-post event refresh, media repair, and extension reconsent remain with PS-09/11/12/13. Hash occurrences describe accepted observations, not a provider edit timestamp; PS-09 must reread current upstream state before applying delayed work.

No live Patreon request, hosted rollout, full repository suite, forced process kill, or power-loss test is claimed.

## Verification and verdict

- The initial request/revision regression run reproduced eight failures against the previous implementation.
- The connected run passed 44 suites: 251 checks, one Windows file-symlink permission skip, and one existing media-extraction TODO. Its five expected-failure baseline assertions still belong to PS-09/11/12; they do not establish those items' completion. Nineteen PostgreSQL checks ran, including five new token/revision cases and the prior vault/event cases.
- After review removed obsolete path-based enrichment suffixes and added the equivalent-content regression, the affected five-suite recheck passed all 19 checks, including the built worker smoke test. PS-07 adds 28 passing regressions across new suites and the access/health suites.
- Strict TypeScript checking of the five new suites and connected source passed. `npm run build` passed after the final runtime changes.
- Scoped Ponytail Review found no remaining blocking defects. It checked failed/partial collection, refresh and canonical locks, rotating-token ambiguity, A → B → A, stored replay, signed URL renewal, list/fallback equivalence, source-specific access, and post-commit publication. No ownership-policy decision or provider-account reassignment logic was changed.
- Preservation checks found only this task's source/tests/program documents plus the independently changing Library handoff documents. The Library changes and evaluation outputs were left untouched. No commit, push, deployment, or shared-database migration was performed.

Verdict: ready for local integration. Hosted release still requires compatible API/worker writers, the documented shared credential configuration, PS-06 cutover, and staging evidence.
