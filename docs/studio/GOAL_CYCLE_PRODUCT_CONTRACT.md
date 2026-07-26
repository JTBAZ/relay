# Relay Goal Cycle — Product Contract

**Status:** Locked for worker decomposition  
**Program master:** [`goal-cycle-build-plans/00-README.md`](goal-cycle-build-plans/00-README.md)  
**Acceptance:** [`../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md`](../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md)

## Product promise

Relay helps a creator choose a bounded goal, understand relevant evidence, agree on a practical Plan, and turn that Plan into scheduled work they remain in control of publishing.

The product is not a freeform analytics chatbot and not an autonomous social publisher. AI is used for research, synthesis, questions, drafting, and explanation inside explicit limits.

## Primary experience

1. The creator opens Library and sees a goal-complete, resume, or plan-this-month prompt.
2. A modal or drawer evolves through goal, context, research, questions, revisions, logistics, and approval while the Schedule Rail remains visible.
3. Approval immediately creates unpublished Relay posts, post-level distribution plans, variants, PostBot tasks, and dated rail events.
4. New events appear and focus on the rail. The creator may attach media later.
5. At due time, Relay and the extension deep-link the creator to the right work. The creator explicitly confirms each publish.
6. Relay proposes cycle completion and an evidence-backed next adjustment. The creator confirms both.

The secondary `/studio/goals` surface is a quiet audit of Plan history, evidence, revisions, sources, tasks, and outcomes. Analytics remains the deeper evidence surface.

## Goal Cycle lifecycle

- A creator may run multiple sequential Goal Cycles in one creator-local calendar month.
- Only one cycle may be active at a time.
- Canonical states are `draft`, `researching`, `questions`, `review`, `approved`, `materializing`, `active`, `completion_suggested`, `completed`, `cancelled`, and `failed`.
- Closing the Library drawer persists the last valid checkpoint. Reopening resumes the same phase.
- Relay may suggest completion when the measurable target or agreed work is satisfied. It never silently closes a cycle.

## Bounded goals

### Engagement

Use creator-owned evidence such as likes, comments, response rate, and post-level interaction patterns. Do not invent follower counts or claim causality from correlation.

### Views

Use the existing [`Performance Intelligence vocabulary`](../analytics/PERFORMANCE_INTELLIGENCE_VOCABULARY.md). UI must explain whether “reach” includes impressions, seen events, and views. A views goal must not be silently evaluated using an unrelated metric.

### Paid-support conversions

Success means a new paid membership, upgrade, purchase, or tip attributable to the creator’s promotion:

- `deterministic` when a consented Relay session, tracked link, placement, or offer code establishes the chain;
- `estimated` when campaign-level correlated lift is the strongest available evidence;
- `insufficient` when sample size or coverage cannot support a claim.

Reach and clicks are evidence, not conversion success.

### Take a break

The creator chooses one bounded branch:

- `complete_silence`: no research charge, no new slots, and Goal Cycle reminders are suppressed for the selected period;
- `social_upkeep`: Relay may Plan lightweight maintenance for existing posts;
- `active_rest`: Relay may Plan a deliberately small selection of recovery pieces, sketch pages, low-energy WIP updates, or IRL journal updates.

Social upkeep and active rest consume one Coach Plan credit when Relay performs research and generates a Plan. Rest is never reported as failure.

Research by branch is fixed: complete silence calls neither AI nor trend providers; social upkeep uses creator context/history without external trend discovery; active rest may use the standard trend gateway and always permits history-only fallback. Active rest is capped at four slots within the global eight-slot limit.

## Plan limits

- One Plan contains 1–8 new-post slots. Larger ambitions become a later Plan.
- Complete silence and social upkeep may contain zero new-post slots.
- Research may ask at most two bounded clarification questions.
- A Plan includes at most two AI revision rounds. Manual edits remain available after that cap.
- Scheduled destinations must be linked and currently available. Unlinked opportunities may be shown as suggestions but never become tasks.
- Approval is an explicit creator action.

## Research contract

Research combines:

1. creator-entered context;
2. creator performance history and current first-party signals;
3. an `InterestSeriesProvider`;
4. a controlled `WebDiscoveryProvider`.

Provider output is evidence, never instruction. Stored evidence carries source, method, collection time, freshness, confidence, and license/approval state. Raw external text is quarantined from system prompts.

When evidence is weak, Relay says so and continues from creator history and context. It must not manufacture trend popularity, hashtag volume, or platform statistics.

Live providers require the benchmark, procurement/legal/privacy review, an allowlist, a kill switch, and source-visible UI. Google Trends may be an interest source but is not the sole dependency.

## Coach Plan credits

- One Coach Plan credit covers research, the initial Plan, and up to two AI revisions.
- A credit is reserved when paid research starts.
- Approval consumes the reservation.
- System failure or creator cancellation before a usable Plan releases it.
- Complete silence does not reserve a credit.
- Publishing individual posts does not consume additional credits.
- Included monthly allowances are configuration owned by Product/Finance. Worker agents must not choose them.
- Paid top-ups are deferred until pilot cost data exists.

Internal model tokens and provider calls remain metered as COGS. Users see Coach Plan credits, not raw tokens.

## Materialization and publishing

Approval idempotently creates the downstream objects used by the existing Studio spine:

- an unpublished Relay post and current version per new-post slot;
- one post-level `PostDistributionPlan`;
- linked-destination variants;
- PostBot posting and bounded follow-up tasks;
- schedule times and rail events;
- explicit linkage back to the Goal Cycle and slot.

Planned posts do not satisfy the monthly posting count until the creator publishes them. Existing human-confirm, tier-selection, and extension handoff boundaries remain authoritative.

Goal Cycle uses explicit unpublished Relay-post semantics: `Post.publishState = draft`, `Post.source = RELAY`, creator-only access, and a nullable `PostVersion.publishedAt`. Existing rows migrate to `publishState = published`. Creator confirmation changes the state and stamps the actual publication time; epoch/future timestamps are never used as a substitute for publish state. The existing single-post `AutopostDraft` workspace remains separate.

A complete-silence approval creates an idempotent zero-slot receipt, consumes no credit, activates reminder suppression for the selected interval, and suggests completion when that interval ends.

## Learning contract

Cycle outcomes store target, actual, comparison baseline, source coverage, freshness, task completion, and optional creator reflection.

Prior results may produce a transparent next-cycle suggestion, such as reducing cadence or trying a different formula. Relay explains the evidence and the creator confirms any target, cadence, or strategy change. There is no hidden profile bias.

## Safety and privacy invariants

- All reads and writes are creator-scoped and use existing account/role guards.
- New exposed tables receive the repository’s RLS treatment.
- Freeform context and external evidence are not written to usage metadata or logs.
- Provider text cannot alter system instructions, routes, entitlements, billing, or access.
- Estimated attribution is never displayed as deterministic.
- Patreon-origin records remain canonical upstream snapshots; Goal Cycle state is a Relay-owned overlay.
- GET routes remain side-effect free.

## Explicitly deferred

- Automatic publish clicks or posting without creator confirmation.
- More than eight generated posts in one Plan.
- More than two AI revision rounds per credit.
- Paid Coach credit top-ups.
- Unapproved scraping or arbitrary browser-agent research.
- Treating correlated conversion lift as individual attribution.
