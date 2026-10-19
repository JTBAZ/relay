# 02: Preserve overlapping imports for one creator

**What to build:** Two imports arriving together for the same creator both retain their accepted content and replay protection, so one successful import cannot overwrite the other.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** Import persistence audit, finding 2. Creator snapshots are loaded before the save transaction. Overlapping requests can load the same old snapshot, then serially save competing replacements that lose the first request's post and replay marker.

**Scope:** Protect the full creator-scoped load, apply, and save operation using database coordination acquired before loading. Cover ingestion callers that bypass provider-specific exclusivity. Keep different creators independent. No queue replacement, Redis dependency, generic locking framework, or broader store rewrite.

- [ ] Overlapping imports of distinct posts for one creator both survive database reload with their revision histories and replay markers intact.
- [ ] Coordination covers the initial creator snapshot read through transaction completion; serializing only writes or one provider adapter is insufficient.
- [ ] A later request applies against the preceding committed state. Repeating either accepted batch remains a no-op.
- [ ] A failed or rolled-back import releases coordination, leaves no partial content or false replay markers, and permits a later retry.
- [ ] Creator isolation and provider-lane preservation remain intact. Imports for different creators do not share a global lock.
- [ ] Add a deterministic overlapping-transaction regression through the database store, including rollback and retry. Run focused creator-boundary and persistence checks plus scoped Ponytail Review; preserve unrelated work.
