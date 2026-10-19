# 04: Update all-paid access when the tier catalog changes

**What to build:** A post intended for all paid patrons receives the current expanded paid-tier list when the supplied tier catalog changes, even if the provider's post revision is unchanged. Repeating the same effective access remains a no-op.

**Blocked by:** None (can start immediately). This ticket preserves compatibility with existing derived revisions without changing the shared persisted-key encoding addressed by ticket 05.

**Status:** ready-for-agent

**Priority:** P2

**Source:** Batch replay and revisions audit, finding 4. All-paid expansion appends the same `:tier_expand` suffix for different expanded tier lists, so replay detection suppresses the access update.

**Scope:** All-paid enrichment, effective post revision identity, legacy derived-revision compatibility, and focused ingestion/access regressions. No entitlement-engine rewrite, new pricing rules, automatic catalog discovery, or provider mapping redesign.

- [ ] Effective revision identity distinguishes changes to the normalized expanded paid-tier set under the same provider revision. Reordering or duplicating equivalent tier IDs does not manufacture a new revision.
- [ ] A changed expanded set writes one new post version with the updated access and follows the existing event contract for an accepted version. Replaying that effective revision adds no versions or events.
- [ ] Seed a legacy post stored with the existing `:tier_expand` suffix and replay markers. An unchanged provider revision and equivalent expanded access remain a no-op after deployment; a genuinely changed expanded set is accepted once. Do not republish unchanged posts merely because the derived revision format changes.
- [ ] Preserve the current expansion rules, including behavior when no usable paid catalog is supplied. This ticket addresses incoming posts and their supplied catalog; it does not rescan every stored post when a tier-only batch arrives.
- [ ] A regression starts with paid tier A at 1000 cents, then adds paid tier B at 100 cents while resubmitting the same provider revision marked all-paid. The stored post includes B and the existing access check permits B. Repeat with equivalent tier ordering and a persisted legacy suffix.
- [ ] Run focused enrichment, ingestion, and affected access checks plus scoped Ponytail Review before marking implementation complete. Preserve unrelated work.
