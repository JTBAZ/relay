# Posting Recipes — acceptance and evidence

**Revision 6 · proposed scenarios, not a passing production test report.** Demo verification is separate in [demo/README.md](demo/README.md).

| ID | Scenario | Required observable result | Phase |
| --- | --- | --- | --- |
| AC-01 | Choose source/target accounts | Only creator-bound capable accounts selectable; no Instagram source without adapter; extension alone is not account proof | P1 |
| AC-02 | Contains image + text `$relay` | Literal normalized AND match; non-image/no-marker samples fail with correct reason; no regex/variable interpretation | P1 |
| AC-03 | Link `https://example.com/art` vs `/artist` or `example.com.evil` | Exact host and segment-aware path prefix; invalid link blocks confirmation; no network fetch | P0/P1 |
| AC-04 | Dry-run recent/sample post | Pure shared matcher, match reason; no enrollment, uploads, drafts, attempts or mail | P1 |
| AC-05 | Historic import/old-post edit after activation | Original publication identity excludes it; matching new source accepted after sync | P2 |
| AC-06 | 150 publications and restart | Ordered pagination/cursor drains each once; no latest-only/one-awaiting source loss | P2 |
| AC-07 | Duplicate discovery and recipe revision change | One recipe/source enrollment; immutable revision/source/media/filter-match snapshot | P2 |
| AC-08 | One-shot next match under concurrent workers | Exactly one source consumes it; target and consumption shown; selected-artwork mode ignores next-match intake | P2 |
| AC-09 | Save vs Default vs Always on | Save creates selectable config; Default preselects only; Always on enables intake only; publishing still requires review | P2 |
| AC-10 | Three+ rows with different media/copy/source anchors | No fixed preview→original assumption; 1–16 validated routes; preview/preview/original or original-only works | P3 |
| AC-11 | Two recipes/routes plus legacy/conversational plans on same artwork | Scoped create/revise/package never archives/selects sibling plans; repeat request returns same scoped result | P3 |
| AC-12 | Source or preset changes/removal after enrollment | Frozen image/layout/copy retained; source deletion blocks; no latest-image or full-image fallback | P3 |
| AC-13 | Form filled or legacy automation completed | Descendants remain waiting; no receipt/due-date/success summary fabricated | P4 |
| AC-14 | X confirms Tuesday, DeviantArt Friday | Independent descendant dates using first accepted confirmation; URL required; attestation labeled | P4 |
| AC-15 | Pause/archive/skip/cancel/late receipt | Stop new side effects; keep evidence; skip only dependent destination paths; no descendants after archive | P2/P4 |
| AC-16 | Duplicate receipt, crash between receipt and dependent scheduling | One stable downstream action; anchor never moves; uncertain external outcome reconciled | P4 |
| AC-17 | Default timer across DST; explicit clock gap/fold, +0 clamp, +30 month end | Default is N×24 hours; optional clock uses defined calendar policy; no hidden 09:00 default; old clock configs preserved; days not months | P0/P4 |
| AC-18 | Cross-creator/account/action/media package request | Denied; exact frozen media and approved copy/account binding enforced | P3 |
| AC-19 | 72h review expiry then Prepare again; long dependent wait | TTL begins at materialization, not during 30-day wait; same action identity, cleared approval; posted siblings not repeated | P4 |
| AC-20 | Trigger incomplete / filters invalid / routes invalid | Later trays hidden or disabled with values retained; inline repair; final acknowledgement invalidated | P5 |
| AC-21 | Add/remove route, earlier-route anchors, account fan-out | Stable IDs; source-relative destination independence; dependent subset check; no dangling/cyclic/forward anchors or silent reanchor | P5 |
| AC-22 | Keyboard, 390px width, reduced motion | Every chip/disclosure/control accessible; focus retained; overflow contained; animations suppressed appropriately | P5 |
| AC-23 | Notification preference and final choices | Notification shown at end; confirm once distinct from save; Default/Always-on independent; unsupported remote/automatic/window modes unavailable | P5 |
| AC-24 | Source has video/multiple/no images | Filter result distinct from supported-media eligibility; visible reason; no arbitrary first image | P1 |
| AC-25 | Disconnect or mismatched destination identity | Affected handoff blocked/repaired; unrelated destinations continue; identity rechecked at execution | P1 |
| AC-26 | Generated cross-post re-enters monitored source; default/one-shot overlaps Always on | Lineage suppresses feedback loops; same logical recipe/source reuses enrollment; explicit independent repeat plans stay possible | P2 |
| AC-27 | Original/saved/custom base plus optional Coach | Saved/custom exact with Coach off; explicit Coach uses the chosen base; custom edits do not affect shared presets/sibling rows; edits seed once from real selected source and survive mode changes, no sample content leaks into live recipes; entitlement checked; Coach candidate generated once per destination then accepted; retry does not regenerate; creator delay unchanged | P3 |
| AC-28 | Save/confirm toast, open/close trays, editing material payload | No alert/popup wizard, no unnecessary modal; concise feedback; hidden trays removed from focus order; entered config preserved | P5 |
| AC-29 | Email opt-in, partial failure, recovery, log/failed transport, consent revoked | No premature completion, attention notice deduped, final route summary accurate; log Preview ≠ sent; current verified creator recipient/consent; independent retries | P6 |
| AC-30 | Conversational post controls | Also send it to…; To → When → Modifications; compact date/Options dropdowns; Description owns its rounded panel with original/edit/saved selector; And then creates prior-receipt dependency; no required step names | P5 |
| AC-31 | First/last day of current/following reference month | Correct local calendar date/hour, explicit clock override, leap year, December rollover; source/predecessor publication anchors; past-relative date holds only affected action, no silent rollover; duplicate receipts never recompute | P0/P4 |
| AC-32 | Source text missing vs actual uploaded source | Edit original disabled without real text; real text seeds once; mode/destination changes retain edits; loss/version change of source does not apply an old draft automatically | P3/P5 |
| AC-33 | Select/edit/create/cancel saved description | Multiple creator-owned versions; full field preview/editor; edit-as-new preserves original/siblings/pinned plans; unsaved edits block confirm; ownership/payload limits enforced; saving draft never enrolls/publishes | P2/P5 |

## Required R1 evidence

1. Browser-reviewed journey: choose connected Patreon account → image/marker filters → at least three routes with source and earlier-route anchors, saved/Coach copy and different destinations → final choices → save Default without Always on → enable Always on separately → reviewed extension publishing.
2. Fault/restart/concurrency fixtures for intake, one-shot consumption, scoped plans, Coach candidate persistence, publication receipt scheduling and summary outbox.
3. Real X/DeviantArt editor evidence for correct account, image, copy, Publish and required-URL confirmation. Fixtures cannot certify third-party UI behavior.
4. Preserve existing Automations, Goal Cycle, media binding, rail/reminders and affected conversational planning contracts. Record actual commands/environments/revisions, pre-existing failures and limitations honestly.
5. Production email capability requires a proven sender and verified recipient eligibility. Disable unavailable email without preventing valid in-app/manual recipes; never treat successful log transport as inbox delivery.

## Separate follow-up gates

| Gate | Required proof |
| --- | --- |
| R2-A | API image/accepted-copy/account fidelity; permission and capability checks before sending |
| R2-B | No duplicate post after remote success/local timeout/restart; uncertain outcomes reconcile |
| R2-C | Background preview parity, explicit crop and no original substitution on render failure |
| R3a-A | Email GET/open/scanner causes no mutation or token consumption; authenticated final POST bound to action/payload |
| R3a-B | Expired/forwarded/replayed/changed-payload review cannot authorize another user/action; extension routes remain manual |
| R3b-A | Explicit window permission, recorded final payload and successful notice acceptance; unknown notification holds |
| R3b-B | Stop/send race, revocation, changed payload and prolonged outage cannot cause surprise/stale delivery |
