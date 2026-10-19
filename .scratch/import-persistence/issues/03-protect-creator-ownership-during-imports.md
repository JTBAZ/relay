# 03: Protect creator ownership during imports

**What to build:** Establish an approved, bounded migration policy, then ensure an ordinary import cannot remove another creator's content when an imported identifier conflicts with an existing owner.

**Blocked by:** None for the read-only policy assessment. Implementation requires separate approval of the migration policy; no other ticket gates the assessment.

**Status:** ready-for-agent (assessment first; implementation requires migration-policy approval)

**Source:** Import persistence audit, finding 3. Automatic workspace reassignment deletes foreign-owned posts, media, or campaigns on identifier conflicts without establishing that the previous owner is eligible for migration. Existing tests intentionally allow legacy reassignment, so changing that behavior requires an explicit policy decision.

**Migration decision required:** Assess which legacy source owners may transfer content, what proves ownership and migration eligibility, who may authorize a transfer, how ordinary conflicts are reported, and the bounded operator workflow, rollout, and recovery requirements. Recommend rejecting foreign-owner conflicts during ordinary ingestion and reserving approved legacy transfers for an explicit migration path. This is a recommendation only. Publishing or approving this ticket does not select that policy, authorize a transfer, or approve removal of existing migration behavior. Obtain separate user approval before implementation.

**Scope:** Foreign-owner conflict handling and the smallest migration path required by the approved policy. Preserve valid same-creator imports and legitimate legacy migration needs. No automatic tenant merging, broad authorization or RLS redesign, schema-wide identity rewrite, live migration, or unrelated data cleanup.

- [ ] Complete a read-only assessment of current reassignment behavior, its callers and tests, and the evidence available to distinguish active owners from eligible legacy sources. Record unresolved cases without treating missing evidence as migration permission.
- [ ] Present the recommended eligibility, ownership proof, authorization, ordinary-conflict behavior, operator workflow, and rollout/recovery policy for explicit user approval before changing code.
- [ ] After approval, an ordinary batch for creator B that conflicts with creator A follows the approved conflict behavior without deleting, transferring, or partially changing either creator's posts, media, campaign/tier relationships, dependent records, or replay markers.
- [ ] Valid same-creator imports retain their behavior. Any approved legacy transfer is a distinct deliberate action and affects only the authorized content and owners.
- [ ] Focused regressions seed an active foreign owner and verify preservation after a conflicting batch, including a batch with earlier otherwise-valid records. Test any approved legacy transfer separately from normal ingestion.
- [ ] Record the approved policy and run the affected ownership, migration, and persistence checks plus scoped Ponytail Review before implementation completion. Preserve unrelated work; do not execute a live transfer as part of this ticket.
