# 04: Update all-paid access when the tier catalog changes

**What to build:** A post intended for all paid patrons receives the current expanded paid-tier list when the supplied tier catalog changes, even if the provider's post revision is unchanged. Repeating the same effective access remains a no-op.

**Blocked by:** None (can start immediately). This ticket preserves compatibility with existing derived revisions without changing the shared persisted-key encoding addressed by ticket 05.

**Status:** complete

**Priority:** P2

**Source:** Batch replay and revisions audit, finding 4. All-paid expansion appends the same `:tier_expand` suffix for different expanded tier lists, so replay detection suppresses the access update.

**Scope:** All-paid enrichment, effective post revision identity, legacy derived-revision compatibility, and focused ingestion/access regressions. No entitlement-engine rewrite, new pricing rules, automatic catalog discovery, or provider mapping redesign.

- [x] Effective revision identity distinguishes changes to the normalized expanded paid-tier set under the same provider revision. Reordering or duplicating equivalent tier IDs does not manufacture a new revision.
- [x] A changed expanded set writes one new post version with the updated access and follows the existing event contract for an accepted version. Replaying that effective revision adds no versions or events.
- [x] Seed a legacy post stored with the existing `:tier_expand` suffix and replay markers. An unchanged provider revision and equivalent expanded access remain a no-op after deployment; a genuinely changed expanded set is accepted once. Do not republish unchanged posts merely because the derived revision format changes.
- [x] Preserve the current expansion rules, including behavior when no usable paid catalog is supplied. This ticket addresses incoming posts and their supplied catalog; it does not rescan every stored post when a tier-only batch arrives.
- [x] A regression starts with paid tier A at 1000 cents, then adds paid tier B at 100 cents while resubmitting the same provider revision marked all-paid. The stored post includes B and the existing access check permits B. Repeat with equivalent tier ordering and a persisted legacy suffix.
- [x] Run focused enrichment, ingestion, and affected access checks plus scoped Ponytail Review before marking implementation complete. Preserve unrelated work.

## Completion evidence (2026-10-19)

- All-paid expansion derives `:tier_expand:v2:<digest>` from the sorted unique expanded paid-tier IDs. Catalog order, duplicate rows, and price ordering do not change that identity when membership is equivalent. The expansion filters and ingest notes are unchanged.
- Snapshot application compares expanded access against the current provider revision. A changed set follows the normal accepted-version path, including version sequencing and `post_published`. Returning from A+B to A and later A+B works even when a set's replay marker already exists; its original marker is retained. Equivalent legacy `:tier_expand` rows stay untouched without adding a new marker or republishing content. Provider revisions already in history cannot replace newer content through a newly expanded set.
- File-store regressions exercise the real ingestion service, restart/replay, byte-preserving no-ops, cheaper-tier access and free-tier denial, legacy rollout, returning to seen sets, duplicate post entries, older legacy and v2 provider revisions, creator boundaries, and tier-only batches. The existing database save path persists the new post version and updated tier links, then preserves the replay without recreating either. Database production code and schema are unchanged.
- Four tests failed before implementation. All 129 focused tests now pass across 13 suites: enrichment, expansion, all-paid replay, access ordering, post/media/deletion replay, real HTTP ingestion, creator-scoped storage, database save, presentation preservation, and Patreon access sync/routes. Focused strict TypeScript checks for all three changed test files and their imports pass.
- `npm run build` was attempted and failed on 16 TypeScript errors in unrelated `src/editor-bench/distribution-variant-adapter.ts` work (possibly undefined `existing`/`latest` and missing `plan_id`/`variant_id` properties). No error was reported in this ticket's files. That unrelated file is being edited concurrently and remains outside this commit; the repository-wide build is not verified green.
- A preservation comparison verified 598 pre-existing unrelated paths unchanged. Six editor-bench paths changed concurrently; seven locked service/log paths could not be hashed. None was edited or staged by this task. Only the two ingest modules, three test files, two scoped contract/pattern updates, and this ticket's completion evidence belong to this change.
- The shared stored-key encoder and existing markers remain unchanged. Ticket 05's separate stored-key compatibility decision is still unselected and unimplemented.

## Ponytail Review

What this change does: Incoming all-paid posts receive updated access when their supplied paid-tier set changes under the same provider revision. Equivalent sets and unchanged legacy expansions remain replays, while accepted changes retain normal version and event behavior.

Scope: The diff against `a4158c3`: the derived revision and compatibility helper in `auto-enrich`, the post replay guard and marker retention in `apply-batch`, the new all-paid replay suite, the added enrichment and database-save cases, the canonical contract and pattern pointer, and this completion evidence. Connected code inspected includes every enrichment/application caller, paid-tier expansion and access checks, provider dry runs and forced access refresh, post/media/deletion replay guards, file-store creator mutations, database version loading/preservation/materialization and tier links, existing key encoders, and focused ingestion/HTTP regressions.

Looks good. Ship. No blocking findings in this scope. The review traced unchanged legacy rows, added and removed tiers, returning sets, older provider history, repeated entries, URL-only replay behavior, and creator isolation. Ordinary revisions retain their existing key guard; the compatibility comparison is limited to validated expanded suffixes. The helper adds local set normalization and, when the current provider revision differs, a scan of that post's already-loaded history. Under the existing creator-scoped batch model it adds no queries, network calls, caches, dependencies, or shared state. Historical versions with unrelated revision prefixes avoid tier hashing. Existing version sequencing already scans post history, and this change adds no broader storage or entitlement mechanism.

Not checked: Live-provider imports, live-database round trips, the full repository suite, concurrent/crash recovery, or ordering of stale supplied catalogs. The backend build is blocked by the unrelated editor-bench errors listed above. The previously reported shared-media database persistence limit remains outside this access ticket.
