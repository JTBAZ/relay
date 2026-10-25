# Selected-piece performance in chat

Status: SPP-04 accepted, 2026-10-23, with the existing host zoom-layout limitation recorded below. Planned by Sol and implemented by Luna, with supervisor review, independent verification and documentation. The feature is mounted in the actual `/studio/lab2` host and existing Library editor components. The sample selection prototype is reference material only.

## Selection and submission

Derive selected post IDs from selected Library items in `Lab2ActivePostsLive`; loaded page IDs are not the selection. Freeze subject, selected IDs and context before the first await in Send. Default to one post. Offer explicit work scope only when the selected anchors identify one work; the server still loads and verifies full membership. Multiple media from one post remain one subject. A draft or file without a Library subject has no collected performance.

Keep each answer attached to the subject submitted for that turn. Changing current gallery selection must not relabel saved history. Cancel and ignore late responses on creator/session replacement or newer local revision. Prevent duplicate Send, retain the question on failure, and preserve composer focus.

## Host side effects

When a Library subject is selected, generic chat Send must use the pure Library adapter. The existing intake's `prepareMessage` can fetch style, regenerate/create a draft, stage events or change links before editor routing. Those operations cannot precede an ordinary performance question.

Keep draft preparation/correction available through a separate, clearly labeled explicit draft action using the submitted text and attachments. Preserve existing manual draft editing and scheduling. Restrict the mixed Library/draft target choice to that explicit action. File-only legacy intake stays outside this first slice. Use no phrase classifier, regular expression router or extra model call.

## Inline answer

Render the frozen subject and scope, reporting range, platform/member metric rows, captured totals versus period changes, unavailable values versus measured zero, source and observation dates, freshness and coverage, cited findings, deterministic fallback state and existing analytics links. Label CSV import-time evidence as import time. Saved reports retain their original cutoff and are not live reads. Keep plain-text legacy messages compatible.

Use existing Studio tokens and controls. Provide semantic metric tables or lists, keyboard-operable evidence disclosures, visible focus, wrapping titles and a polite answer announcement. Apply Humanizer to authored copy and the applicable Impeccable and Web Interface Guidelines checks. Do not redesign the host or mount the deferred full Conversation publishing flow.

## Verification

Test real product components with fixture API responses: one post, duplicate media, explicit work, rapid selection changes, duplicate submission, reload history, retained text/focus on failure, no-data, partial/stale and deterministic fallback. Prove generic Library Send makes zero draft/style/staging calls and the explicit draft action retains its intended behavior.

Verify the mounted fixture journey at 390, 768 and 1440 CSS pixels, including keyboard navigation, 200% zoom, reduced motion and long content. Run affected web tests and accepted backend regressions, root build, web lint and web build. Preserve unrelated dirty UI hunks and document pre-existing failures or unavailable rendering. Completion requires the mounted journey and exact pending-cart preservation; backend-only tests do not establish product integration.

## Implemented behavior and review

The existing `Lab2ActivePostsLive` adapter already supplies actual selected posts and media separately from loaded posts. Its code and the host chassis/CSS were preserved. `LibraryEditorPanel` freezes the submitted context and post/work reference, prevents duplicate turns, and ignores responses from earlier creator/session lifecycles. Prompt hydration finishes before writing browser storage for a newly selected creator. Reports restored from saved sessions render from their attached subject rather than the current gallery selection.

Generic Send with selected Library posts bypasses style lookup, draft creation/regeneration, staging updates and link changes. Unselected named Library edits remain available when loaded Library context exists and no draft/files are attached. The separate “Prepare attached draft” action retains draft preparation and correction. A failed upload or draft restoration does not disable a selected Library question; those conditions still block the affected draft action. File-only legacy intake, manual draft editing and scheduling retain their existing behavior.

`PiecePerformanceAnswerView` uses the existing Studio tokens and semantic metric lists. It distinguishes captured totals, proven period changes, unavailable values and measured zero. Dates use locale formatting with explicit UTC, and import-time CSV evidence is labeled as imported. Source/confidence disclosures, coverage notices, findings and local analytics links remain available in saved history. Evidence anchors include the report ID so repeated fact IDs across reports do not collide. A deliberate no-data result does not claim AI failed.

The scoped Ponytail and Web Interface Guidelines review covers these three component changes, their focused tests, the unchanged selection/chassis adapter and the existing web API contract. The review caught stale lifecycle acceptance, prompt-storage hydration, draft admission and evidence-labeling defects during implementation. The first mounted browser pass also caught a newly appended report staying outside the visible conversation viewport and error focus running before the disabled composer was enabled. Luna corrected both, and the supervisor verified them in the rebuilt product. Newly appended reports scroll their heading into view once, with reduced-motion handling. Focus returns after the enabled composer commits, guarded by creator and operation generation. Inline errors appear beside the pinned composer; existing dialog/non-inline placement is preserved.

The original shared-output web build compiled but failed while collecting `/_document`, and its development server subsequently timed out. A separate source copy, with existing dependencies linked and no runtime environment files copied, completed the full production build and all 69 static pages. Verification uses a separate loopback server from that copy; the original development process and its build output are left alone. Existing unrelated lint, Tailwind utility and Browserslist warnings remain outside this ticket.

## Acceptance verification

After the final corrections, the supervisor independently ran five connected UI suites: all 39 tests passed (18 panel, 11 intake, four answer view, four chassis and two existing selection-adapter tests). These use real components with fixture API responses. The unchanged chassis suite still emits its existing mock-ref warning and connection-refused noise for the unavailable local API. No test failure remains. Web TypeScript and lint pass, and the final isolated production build passes compilation, lint, type checking and all page generation. The four integration source files were hash-checked against the verification copy. Scoped detector checks returned no findings; a whitespace check with CRLF handling passed. SPP-03 records the independently passed 208 backend checks, root build and two disposable Postgres-engine integration cases; no backend source changed during SPP-04.

The supervisor ran Chrome against the built `/studio/lab2` page in an isolated context with fail-closed request interception. Only local page assets and synthetic API responses were allowed. The journey selected the first fixture post through its real checkbox, submitted through the composer, prevented a duplicate keyboard Send, displayed recorded values and import-time evidence, opened source details and followed a finding citation by keyboard, changed selection without rebinding the saved report, and restored that report after reload. It then showed a second-subject deterministic fallback and a no-data report. A failed fourth request retained its question, showed its error beside the composer and returned focus to the enabled field. All three successful turns preserved the pending cart exactly and did not reopen cart review. New report headings were visible without manual scrolling. The log records zero blocked unexpected requests and zero page errors; no draft/style/staging mutation was made.

Captures were inspected at 390, 768 and 1440 CSS pixels, with reduced motion, a long subject title, keyboard evidence disclosures and links, and a 200% equivalent layout (720 × 500 CSS pixels at device scale factor two). Evidence anchors are unique across saved reports, and the document has no horizontal overflow in the checked layouts. Local artifacts are in `.impeccable/review/spp-performance/`: `partial-390.png`, `partial-768.png`, `partial-1440.png`, `evidence-keyboard-390.png`, `evidence-link-390.png`, `fallback-1440.png`, `no-data-1440.png`, `zoom-200.png`, and `journey-log.json`. The temporary fixture runner and verification server are outside the repository; the server was stopped after inspection.

## Remaining verification limits

At the short 720 × 500 zoom-equivalent viewport, the incumbent fixed bulk-action toolbar can overlap the composer. This is in the unchanged `BulkActionBar`/host layout, which uses a fixed bottom toolbar above the scrolling editor. It is recorded separately from SPP-04's corrected report scrolling and focus timing. No claim of a clean zoom-layout pass is made, and the toolbar was not redesigned as part of this ticket.

The browser used synthetic analytics and a fixture API, so it does not establish live model routing quality, real-account metric coverage or production latency. Native Postgres concurrency/load and deployment remain unverified as described in SPP-03. No paid model call, live-account write, runtime flag change, commit or deployment was made. The feature remains off by default behind `RELAY_GALLERY_EDITOR_PERFORMANCE_ENABLED=1` and the existing editor allowlist/store/AI gates. No blocking defect remains in the task's changed code.
