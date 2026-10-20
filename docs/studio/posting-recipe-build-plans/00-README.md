# Posting Recipes — product and delivery plan

Status: the approved **Posting Rhythms** editor is integrated into the local Relay app as of **2026-10-19**. See [Integration status, capabilities and verification](INTEGRATION.md). This plan directory retains its historical Posting Recipes name. The remaining program includes capabilities beyond the implemented creator-reviewed Patreon → X/DeviantArt lane; it is not a claim that every milestone below has shipped.

Revision 8 places Recipes above the whole trigger-and-release flow. Destination tags with platform logos now lead each numbered row directly after “Also send it to…”. A right-side Details control opens timing, treatment and Description; collapsed rows retain destinations and timing. Reusable recipes remain primary. The demo offers two templates and its existing single saved-recipe slot. First release keeps narrow connectors and creator-reviewed publishing.

## Read order

1. [Product contract](PRODUCT-CONTRACT.md) — scope, behavior, timing, control, and lifecycle.
2. [Codebase map](CODEBASE-MAP.md) — existing authorities and the gaps that must be closed.
3. [Phased build plan](PHASED-BUILD-PLAN.md) — dependency order, bounded work items, release gates.
4. [Acceptance scenarios](ACCEPTANCE.md) — observable pass/fail expectations.
5. [Interactive HTML demo](demo/recipe-editor.html) and [demo notes](demo/README.md) — front-end exploration of the proposed R1 editor; fictional data only.

## Release boundaries

| Milestone | Outcome | External posting authority |
| --- | --- | --- |
| D0 — this handoff | Contract, plan, standalone editor demo | None |
| R1 — first product release | Connected Patreon intake, AND filters, repeatable routes, X/DeviantArt account fan-out, source/saved/Coach copy, one-shot and saved modes, final notifications | Creator reviews and finishes each external post |
| R2 — optional follow-up | Restricted background rendering and approved delivery through one capable API connector | Explicit per-route permission; unsupported routes stay manual |
| R3a / R3b — separate gates | Remote approval, then cancellation-window publishing | Authenticated payload-bound approval / explicit standing window permission |

R1 does **not** promise that the sample X/DeviantArt workflow runs unattended. Default preselects a recipe; Always on enrolls sources; neither grants publishing authority. Later modes are unavailable until their gates pass. Additional source connectors, arbitrary month recurrence and branching remain follow-up scope.

## Relationship to existing plans

- [Schedule Rail Automations](../automation-build-plans/00-README.md) remains authoritative for the two existing presets. Its deferred chaining and autonomous publishing do not become enabled by this proposal.
- [Goal Cycle](../goal-cycle-build-plans/00-README.md) keeps its current planning and execution ownership.
- The working tree also contains [Conversational Planning](../../conversational-planning/README.md). Recipes are reusable configuration, not a second natural-language interpreter or a replacement for its approved-plan pointers.
- This program does not change the [pilot Stage 1/Stage 2 charter](../../pilot-two-stage-charter.md).

## Execution hygiene

The implementation queue has **not** been claimed or refreshed. The `.docs/anthropic/BUILD_BRIEF.md` and `CURRENT_LEDGER_QUEUE.md` files named by AGENTS.md are absent from this checkout, and Airtable MCP tools were unavailable. The local integration follows the directly authorized UI task; it makes no ledger completion claim. Future ledger-driven work must use the Production Ledger and Session Lock under AGENTS.md. The IDs in this plan are local proposed work-item IDs, not Airtable record IDs.

The working tree has unrelated modified/untracked code, including conversational-plan and schedule-event work. Preserve it. Do not assume those changes have merged or shipped. D0 changed no runtime; the later local integration's schema, runtime and verification changes are recorded in [INTEGRATION.md](INTEGRATION.md).
