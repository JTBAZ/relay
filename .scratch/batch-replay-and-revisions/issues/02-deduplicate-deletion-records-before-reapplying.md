# 02: Deduplicate deletion records before reapplying

**What to build:** Retrying a deletion that was already processed cannot hide a newer imported post or media revision. A distinct later deletion can still remove that entity.

**Blocked by:** None (can start immediately). New deletion markers have no legacy deletion-key format to migrate; changing existing replay-key encoding belongs to ticket 05.

**Status:** ready-for-agent

**Priority:** P2

**Source:** Batch replay and revisions audit, finding 2. Deletion records are reapplied on every batch, including after a newer revision has restored the entity.

**Scope:** Stable deletion input, deletion replay markers in existing persistence, batch application, and focused API/store regressions. No general event-ordering engine, timestamp-based conflict resolution, schema redesign, or historical deletion reconstruction.

- [ ] Require stable caller-supplied deletion metadata. Missing or unusable `deleted_at` returns a field-scoped validation failure before mutation; retries must not acquire a new identity from the server's current time. Update affected first-party producers or fixtures within this contract.
- [ ] Identify a deletion unambiguously by creator, entity type, entity ID, and stable deletion metadata in a separate deletion-marker namespace. Persist the marker using the existing replay store without altering established campaign, tier, post, or media keys.
- [ ] Once a deletion has been processed, an identical replay changes no entity status and adds no applied-deletion count. Remember processed deletions even when their target is absent, so a replay cannot delete an entity imported afterward.
- [ ] A distinct later deletion still applies. Creator boundaries and post/media namespaces remain isolated, including identifiers containing delimiters. Deletions appearing after revisions in the same batch retain their existing precedence.
- [ ] Regressions cover deletion, fresh revision, and repeated deletion for posts and media; duplicate deletion within a batch; absent targets; distinct later deletions; and persistence/reload of markers. Verify that a previously restored asset remains visible after the old deletion is retried.
- [ ] Document that a stale deletion arriving for the first time remains outside this duplicate-protection guarantee. Existing processed deletions cannot be reconstructed from state that never recorded their identity.
- [ ] Run focused validation, ingestion, and affected persistence checks plus scoped Ponytail Review before marking implementation complete. Preserve unrelated work.
