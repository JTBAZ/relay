# 05: Reconcile uncertain collection-entry saves

**What to build:** After a collection-entry save reports an uncertain failure, a patron can check their collection to see whether the entry is present without submitting another write. A missing collection and a storage failure produce distinct responses, while retrying the original save remains protected from duplicate execution.

**Blocked by:** 04: Retry known failures without repeating uncertain writes (complete; can start immediately).

**Status:** ready-for-agent

**Priority:** P2

**Source:** Ticket 04's collection-entry error reporting and reconciliation follow-up. Its regression showed a saved entry followed by a store error returning a replayed 404.

**Scope:** One collection-entry save and authenticated read-back flow. Use the existing collection-detail read for reconciliation, with only the necessary store error distinction, response handling, tests, and retry documentation. No new reconciliation service, schema changes, UI work, shared retry-policy redesign, transaction rewrite, or expansion to other mutations.

- [ ] The entry-save response uses 404 only for a confirmed missing collection, retaining the existing protection against revealing another patron's collection. Storage failures with an uncertain write outcome return the existing INTERNAL error envelope with HTTP 500 and no raw storage details.
- [ ] An uncertain failure never receives the pre-write failure signal. Retrying the same caller, target, body, and key replays the original error and does not invoke the write again. Preserve successful replay, known pre-write recovery, reservation ownership, and requests without a key.
- [ ] A patron can use the existing collection-detail read to determine whether the requested entry is currently present, using the existing collection/media identity rules. The read performs no mutation and preserves authentication, creator scope, ownership, and entitlement filtering.
- [ ] A failed or corrupt persistence read in this flow surfaces a server error; it must not masquerade as an empty collection or a confirmed missing entry. A later successful read can reconcile the current state. An absent entry does not prove an earlier write never committed or authorize an automatic resubmission.
- [ ] A focused authenticated regression saves an entry, injects a failure after persistence, receives HTTP 500, then confirms the entry through collection detail. A same-key retry replays the error with one write call and one persisted entry.
- [ ] Focused regressions cover a genuinely missing collection, a storage failure without a confirmed commit, an unavailable reconciliation read followed by recovery, and another patron's denied read. Reads and retries must neither add entries nor expose another patron's data.
- [ ] Document the caller procedure: after an uncertain save response, inspect collection detail; preserve the original key when retrying the request. Do not instruct callers to use a new key or automatically resubmit after an inconclusive read. Read-back confirms current collection state, not the historical outcome of a specific request.
- [ ] Run focused collection-entry and retry middleware/store checks and scoped Ponytail Review before implementation is considered complete. Preserve the existing process/cache/expiry limits; this ticket adds no durable exactly-once guarantee.
