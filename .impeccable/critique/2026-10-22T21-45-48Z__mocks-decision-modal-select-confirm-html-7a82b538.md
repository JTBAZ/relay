---
target: Studio mock implementation readiness
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 5
target_identity: "file:C:\\Users\\jorda\\Documents\\Codex\\2026-10-11\\c\\work\\relay\\.impeccable\\mocks\\decision\\modal-select-confirm.html"
target_fingerprint: "sha256:57015a678762be734e151c7c69dc6e9511e856f9e002f2a1ed8ecf77c7d88f6b"
target_path: "C:\\Users\\jorda\\Documents\\Codex\\2026-10-11\\c\\work\\relay\\.impeccable\\mocks\\decision\\modal-select-confirm.html"
timestamp: 2026-10-22T21-45-48Z
slug: mocks-decision-modal-select-confirm-html-7a82b538
---
The Studio visual direction is ready to carry into implementation. Six interaction decisions remain before the whole experience has a complete design contract. Preserve the approved composer/gallery/rail composition, compact action rows, Lab 2 tree, event inspector and focused cross-poster. Previewize's agreed mock is complete.

Method: two independent assessments: design by /root/studio_whole_design_review, interaction/detector evidence by /root/studio_whole_interaction_review. Neither saw the other's findings. This synthesis addresses the user's implementation-readiness question rather than proposing a new visual direction.

| Priority | Area | Design to finish |
| --- | --- | --- |
| P1 | Main conversation | Define broad requests with no attached artwork, results-only searches, clarification, and how follow-ups retain or replace a pending selection. The current composer asks for selected artwork first. Walk through “Show everything I posted last December” into useful results, then a follow-up action. |
| P1 | Unit of work in review | Distinguish artwork sets, images and resulting posts. In the live sample, “Schedule one image each Monday on X” over Blue hour produced one post containing all four images. Decide whether to split images, keep a set together or clarify; confirm media count, post count and cadence in the existing concise summary. |
| P1 | Rhythms handoff | Define what Repeat with Rhythms carries from the chosen post, destination, caption and modifications. A Bluesky cross-post opened generic monthly Patreon-to-X defaults. Also complete forecast → source selection/preparation → concrete review → scheduling, including no matching source or a dependent release awaiting confirmation. Reuse the existing review where possible. |
| P1 | Execution, saving and recovery | Specify real progress separately from the arrival animation; saved/pending/failed state; refresh/resume; reconnect; partial completion and retry of unfinished actions. Distinguish local schedule/edit Undo from external publication reversal. Set timezone ownership. Prototype one partial failure with recovery. |
| P2 | Gallery and navigation scope | Decide which category/filter/sort and shell controls ship, how the rest of the library loads beyond 15 of 24, and whether organization uses chat plus existing collection controls or adds manual editing. Preserve chat selection while browsing. Do not expand the inspection-only relationship tree unless membership editing is explicitly included. |
| P1 for supported narrow devices | Native-size and responsive layout | Review readable type, icon/touch sizes and containment at real desktop/laptop sizes and browser zoom. Choose rail collapse/access and modal/drawer behavior for phones if supported. Current whole-canvas scaling does not establish a responsive production layout. |

Already designed sufficiently for bounded implementation: selected-work intake and selection correction; compact inspectable action review; confirmation/calendar handoff; expanded calendar; day inspection/edit/cancel with local Undo; scoped event-chat proposals; Lab 2 relationship and performance drilldown; focused cross-post media/caption/timing; independent per-image Previewize selection. Engineering work afterward includes real model/tool connections, Previewizer export, uploads, storage, workers and provider execution. Their absence from the mock is expected.

Recommended next sketch: a broad main-chat request with nothing selected, through clarification and results into the existing selection/action review. Then resolve action granularity and Rhythms handoff; lifecycle and responsive states must be settled before their affected implementation.

Evidence: Assessment A in studio-whole-design-review.md and B in studio-whole-interaction-review.md. Fresh limited browser checks covered selected-work tagging and confirmation, search/no-results, scheduled media inspection, edit/cancel, unsupported post-chat recovery, tree branches, focused cross-post and Rhythms return. All data was fictional/in-memory. Real services, durable saves, publishing, mobile, 200% zoom, screen-reader acceptance and full keyboard/motion coverage were not verified. These are design-readiness findings, not production acceptance.

A transient syntax failure on an initial load cleared after concurrent source changes; later loads initialized successfully. Neither assessment repaired source. Findings use versioned function/line evidence in the reports. The one detector run is version-specific (132 findings across seven rules); most token differences concern separate Posting Rhythms context, while small text and heading structure remain implementation checks. No palette or font replacement is recommended. All product/mock source was left unchanged by this review.

Assessment A's provisional heuristic result was 27/40, covering all ten heuristics; this score describes source-defined design coverage and limited desktop evidence. It is not a release/accessibility score. The action inventory above is the decision aid.

Next-choice question for the user: main-chat discovery (recommended), action-unit confirmation, or Rhythms handoff?
