# CP-09a3 — Owning Patreon attention-event helper

Root accepted as owning-service infrastructure, 2026-10-17. `createConversationalAttentionEventInTransaction` accepts only a bounded server-derived creator/key/canonical UTC/note/source payload in an existing transaction. It verifies the owned existing Post or exact correlated unpublished staged draft, then creates or reuses one make_post/Patreon event with the fixed Review Patreon post label. A staged draft has null canonical post; its later published-post transition remains an authority gap. It creates no post, distribution, engagement or publication evidence.

Replay checks creator/key/type/destination/parent and preserves live manual title/note/time/status/reminder/URL changes. New rows preserve exact note null/empty/whitespace, start pending with reminders enabled and no external URL, and call no entitlement refresh/link confirmation/nested transaction. Ordinary manual create logic is unchanged by source inspection.

Root independently passed 21 focused tests (12 helper plus 9 existing contract/URL-canonicalization checks) and backend build. Worker strict targeted TypeScript passed. The existing nine tests are not full manual CRUD proof. Mock tests establish payload/read/guard/reuse behavior, not actual transaction rollback, concurrent uniqueness or atomic pointer creation; CP-09c2 remains required.

No schema, ordinary database, model/provider, ledger, feature enablement or external posting changed. Root separately froze/dispatched CP-09a4 repository output transactions and shared private authority resolution. Materializer, server integration, full preparation acceptance and UI remain gated.
