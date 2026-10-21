# PS-08: Durable Patreon change work

Claimed in “Review Patreon sync flow” on 2026-10-20 at `91a72d2`, with PS-07's local changes preserved. No other chat claimed this item. Concurrent Library work is outside this scope.

Status: complete locally on 2026-10-20. Scope: verified webhook acceptance, minimal shared work records, bounded coalescing, BullMQ recovery/execution, retries and retention. Changes are uncommitted. Ownership policy, targeted refresh semantics, and hosted rollout remain separate.

## Acceptance and recovery

The signed platform route still resolves the opaque delivery token and verifies the signature over raw bytes. It validates every accumulated resource and checks every distinct campaign through the existing ownership resolver before writing anything. Unknown event families remain ignored. Recognized changes need a valid post/member ID and campaign ID; malformed changes receive 400, ownership conflicts receive 409, and unavailable durable storage/configuration receives a private 503. Metadata lookup failures also return a retryable response.

Recognized deliveries commit minimal `PatreonChangeWork` records in one PostgreSQL transaction before returning 202. The route performs no Patreon request and needs no live Redis connection to accept work. It requires Prisma, `RELAY_JOB_BACKEND=bullmq`, and a valid `REDIS_URL` configuration. Local memory-only or file-only setups receive 503 for recognized changes instead of acknowledging volatile work. This follows [Patreon's documented delivery retry behavior](https://docs.patreon.com/#robust-retries).

The new BullMQ `patreon_change_work` queue receives an unconditional five-second recovery tick whenever shared persistence is configured. It is independent of incremental autosync. Existing API scheduler registration recreates ticks on startup; workers scan committed due records and expired claims. A failed dispatch, API restart, or loss of queued jobs leaves the database records available to a later tick. If Redis loses its scheduler data, restart the API producer to recreate repeat schedules. Jobs carry an optional opaque `workId` and the existing trace field; repeat ticks carry neither provider payloads nor credentials.

## Coalescing, concurrency, and retries

One row represents each creator/campaign/resource. Identical pending deliveries share it. A different event or payload updates its latest descriptor and generation. Identical thin events received after execution starts or completes also retain a new generation: a hash cannot prove that a later edit is a duplicate. A → B → A remains legitimate work. No per-delivery payload or unbounded duplicate receipt list is stored.

New work waits ten seconds for a burst, capped at sixty seconds from that burst's first pending change. The cap bounds coalescing; provider delays and processing capacity can extend actual execution time. Acceptance and completion lock the same row. Work arriving during execution remains pending after the older generation finishes. Ten records are considered per tick and executed concurrently, with a conditional database claim for each. Leases last two minutes and renew every fifteen seconds. Expired leases recover after restart; stale lease holders cannot acknowledge another worker's work. Processing is at least once, so existing canonical revision replay remains necessary. A lost lease can leave an old provider request finishing while another worker recovers; it cannot acknowledge the newer lease.

The database owns attempt counts and next-attempt time. Exponential backoff starts at two seconds, honors longer provider retry delays, and stops after five claimed attempts. New arrivals cannot erase the same resource's known cooldown. A crash on the last attempt becomes a visible failed record after lease expiry. Failed records survive BullMQ failed-job retention and can be retried through `PatreonChangeWorkStore.retryFailed(workId, creatorId)`, which verifies creator scope and preserves provider cooldown. This is an internal operator method; a repair UI belongs to later work.

## Data and boundaries

Records retain creator/campaign/resource identifiers, event type, a delivery fingerprint, generation/progress, lease state, retry timing, and a fixed safe failure code. They retain no raw webhook JSON, content, email, webhook secret, or OAuth credential. Completed rows expire after thirty days; pending/running/failed rows remain until processing or repair. Cleanup uses indexed status/timestamp predicates. Tenant deletion cascades to its work. The migration enables RLS and revokes public, `anon`, and `authenticated` access; privileged server/worker access remains required.

The worker rechecks existing campaign ownership before executing. It now awaits member sync and its health recording; the volatile member timer is removed. The retained event/resource identity is ready for PS-09/PS-10, but execution still uses the existing post campaign sync and member roster sync. This item does not implement targeted old-post updates, deletion semantics, or targeted member refresh. PS-05's commit-to-event-publication loss window remains separate.

## Integration and rollout

Apply `20261020010000_patreon_change_work` before deploying API/worker writers. Configure the same PostgreSQL database, the existing shared credentials/session stores, `RELAY_JOB_BACKEND=bullmq`, and Redis on API and workers. The API registers recovery schedules even in split-worker mode; dedicated workers consume them. Drain old synchronous webhook handlers and member timers when replacing processes. A missing table or unavailable store returns 503; it does not fall back to synchronous acceptance. PS-06's session-vault cutover and the program's staging acceptance remain prerequisites for hosted rollout.

PS-07's uncommitted changes were preserved. The Library chat concurrently changed its editor routes/tests and handoff documents, including separate hunks in `src/server.ts`; those changes remain outside this task. Ownership policy and provider-account transfer logic were not changed.

Ponytail Review scope: only PS-08's new work-store/worker modules, webhook parsing and signed-route hunks, member-execution changes, queue/scheduler/worker-registration additions, Prisma model/migration, associated tests, and program status documentation. Connected reads include raw signature verification, opaque metadata lookup, existing campaign ownership, API/worker startup and shutdown, BullMQ retention/stall handling, sync error/health paths, and PS-05/PS-07 replay boundaries. Expected load is hosted API processes with independent workers.

No hosted deployment, live Patreon delivery, full repository test run, or production migration is claimed.

## Verification and scoped review

- The final connected run passed 17 suites and all 79 checks, with no skips. It includes eighteen new PostgreSQL/BullMQ cases across the three new integration suites, plus member execution, producer/worker wiring, signed routing, replay controls, post-commit events, live Redis checks, and built-worker startup. Five historical baseline assertions remain expected failures owned by PS-09/11/12; they do not establish those features' completion.
- A fresh application of the actual SQL migration in an isolated schema checked insertion, lease constraints, and index creation. The main disposable database also checked RLS/revoked browser grants and tenant deletion cascading. Neither check touched the linked hosted database.
- Strict TypeScript checks of the new suites and connected source passed. `npm run build` passed. An earlier build check observed temporary type errors in the concurrently edited Library source; that chat corrected them, and this task did not edit those files.
- Scoped Ponytail Review found and fixed acceptance/completion row-lock races, stale/unclaimed completion, repeated thin-event suppression, retry-delay bypass on newer generations, and missing retention indexing. Regression checks cover those cases. No blocking finding remains within PS-08's scope.
- Preservation checks confirm PS-07 runtime/test files are unchanged and the schema outside the new Tenant relation/model is unchanged. Concurrent Library edits, including its separate `server.ts` route-registration hunks, remain in place. No commit, push, or deployment was performed.

Verdict: ready for local integration. Apply the migration and configure compatible API/BullMQ workers before hosted release; then obtain live staging evidence under PS-15.
