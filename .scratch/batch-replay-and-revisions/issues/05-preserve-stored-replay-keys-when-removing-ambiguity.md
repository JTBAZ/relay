# 05: Preserve stored replay keys when removing ambiguity

**What to build:** Distinct valid ingestion identities no longer suppress each other's imports, and replay protection for already-imported content survives the change under an explicitly approved stored-key compatibility policy.

**Blocked by:** None for the read-only compatibility assessment. No other ticket must finish before that assessment can start.

**Status:** ready-for-agent (assessment first; implementation requires the decision below).

**Priority:** P2

**Source:** Batch replay and revisions audit, finding 5. Joining opaque identity fields with `|` before hashing makes different valid tuples share a replay key.

**Decision required before implementation:** The stored-key compatibility policy is unresolved. Before changing key generation or stored markers, present the proposed versioned encoding and the handling of legacy markers for user approval. Approval to publish this ticket does not approve that policy. Legacy records contain a digest and first-seen time, without the original identity tuple; ambiguous ownership cannot always be recovered from those records.

**Scope:** Replay tuple encoding, the approved compatibility path through existing file/database persistence, and focused ingestion/reload regressions. Preserve the accepted opaque-ID contract. No replay-table reset, bulk reimport, schema migration, general replay framework, or unrelated store redesign without separate authorization.

- [ ] The read-only assessment inventories affected replay namespaces and available entity/version evidence in both persistence modes, including any deletion markers or derived tier revisions introduced by tickets 02 and 04 if they have landed.
- [ ] Propose and obtain explicit approval for a bounded versioned rollout: which existing keys remain readable or writable, how provable legacy replays stay suppressed, how a distinct tuple colliding with a legacy marker is admitted, and what happens when legacy ownership cannot be established. Identify any operator action or unresolved case before implementing. Escalate if safe compatibility requires broader schema or migration work.
- [ ] Do not clear stored markers, blindly trust ambiguous legacy hashes, or silently accept replaying every previously imported post. Rejecting previously valid delimiter-bearing identifiers also requires an explicit input-contract decision.
- [ ] After policy approval, distinct valid tuples have unambiguous identity encoding with creator and entity namespaces preserved. For the same creator, post `post|part` at revision `r1` and post `post` at revision `part|r1` both import once and subsequently replay independently.
- [ ] Regression fixtures contain legacy markers and existing entity/version history. Verify unchanged legacy content remains a no-op under the approved policy, colliding distinct content is not silently skipped, and unresolved legacy cases follow the approved behavior. Include persistence/reload through both supported stores.
- [ ] Run focused key-generation, ingestion, and affected persistence checks plus scoped Ponytail Review before marking implementation complete. Preserve unrelated work and record the approved compatibility decision with the completion evidence.
