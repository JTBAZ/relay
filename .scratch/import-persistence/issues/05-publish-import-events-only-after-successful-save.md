# 05: Publish import events only after a successful save

**What to build:** Downstream consumers receive publication events only for imports whose canonical save succeeded. A failed import must not announce content that was never committed.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** Import persistence audit, finding 5. Batch application publishes events before canonical persistence finishes. The event bus can insert an outbox record independently even when the canonical transaction later fails.

**Scope:** Buffer this batch's publication events during application and release them after the canonical mutation/save succeeds. Preserve the event bus contract for other producers and its existing delivery-failure behavior. Crash-safe atomic outbox delivery is a separate durability decision; this ticket does not introduce a queue, schema migration, global event-bus redesign, or exactly-once delivery guarantee.

- [ ] Rejection before writes, failure during saving, and transaction commit failure publish no events for that batch and create no outbox records through its publication path.
- [ ] A successful import publishes its accepted post events after save completion with the existing names, payloads, producer identity, creator trace, and ordering.
- [ ] A retry after a rolled-back save publishes the expected events once the retry succeeds. Replaying a committed batch emits no additional publication events.
- [ ] A batch rejected by replay compatibility or ownership checks releases no buffered events, including events collected before a later record fails.
- [ ] Keep existing post-save event-delivery failure semantics explicit. Do not claim that buffering closes the process-crash gap between canonical commit and publication.
- [ ] Add focused ingestion orchestration regressions covering save/commit rejection, successful publication timing and payloads, and retry/replay behavior. Run connected event and ingestion checks plus scoped Ponytail Review; preserve unrelated work.
