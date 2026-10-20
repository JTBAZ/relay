# Posting Rhythms — product contract

**Revision 8 · 2026-10-19 · proposed implementation contract.** Destination-first release rows and a top-level recipe chooser refine the Studio sheet flow. Reusable recipes, readable sequencing and recoverable editing remain primary. Retains compact calendar timing, source-aware descriptions and immutable saved drafts. Supersedes the two-stage-only proposal. This document does not enable production functionality or change legacy Automations behavior.

The user-facing product term is **Rhythm**. It covers the complete trigger, filters and releases. Existing recipe identifiers in code and this implementation proposal refer to that same model; this naming change does not require a storage migration.

## 1. Product model

Creators compose release routes from a small supported set of operations. Presets are editable examples, not execution types. Scope is limited by connector capabilities, media treatments and approval authority; the UI does not assume that every creator wants a preview followed by an original.

- **Trigger:** a publication from a specific connected creator account, optionally narrowed by filters.
- **Route:** a stable-ID row specifying timing, treatment of the source artwork, base description, optional Coach treatment, and one or more destination accounts. A route is configured once and expanded into independent destination actions.
- **Plan:** one execution of a frozen configuration, for selected existing artwork or the next matching publication. The target is explicit before confirmation.
- **Rhythm:** reusable versioned configuration. It can be selected manually, offered as a Default, or enabled Always on.
- **Enrollment:** immutable acceptance of one source publication into one plan/recipe revision. It correlates existing execution authorities; it is not a second posting-status ledger.
- **Publication receipt:** API evidence or a labeled creator attestation of an actual external publication. Handoff, export, form fill and legacy automation completion are not receipts.

## 2. Release scope

| Area | R1: flexible, review-first | Separately gated follow-up |
| --- | --- | --- |
| Editor | Whole-recipe chooser → source/filter strip → destination-first releases with Details → save/final choices | Node canvas, arbitrary graph programming |
| Sources | Specific connected Patreon creator account through existing ingest | Instagram and other source connectors |
| Filters | Contains image, literal text/marker, structured link match; all conditions AND | OR groups, regex, AI/trend classifiers |
| Media | Exactly one supported source image; Original or saved Previewizer template | Multiple images/video, transformations of an earlier rendered output, background rendering |
| Routes | 1–16 stable-ID rows; source-relative or earlier-route publication-relative timing | Cross-recipe chains, loops, multi-destination fan-in |
| Destinations | Connected/bound X and DeviantArt accounts with guided extension handoff | API image delivery and additional connectors |
| Copy | Original, exact saved or new per-route description; optional Coach adaptation with review | Unreviewed generative copy, live trend selection |
| Timing | 0–365-day delay, optional clock, or first/last day of reference month/following month | Arbitrary month intervals, recurrence expressions |
| Usage | Confirm plan once; save selectable recipe; scoped Default; Always on enrolment | Automatic publication based solely on those settings |
| Delivery | Explicit review and creator-finished publishing | Remote approve-and-send, automatic API publishing, cancellation window |
| Notification | In-app attention; opt-in creator email summaries, selected at the end | Email reply parsing, audience mail, arbitrary recipients |

`MAX_RECIPE_ROUTES = 16` is an initial operational budget shared by server, UI and simulator, not a two-step product model. Changing the budget must not require adding a new preset type. Exactly one image remains the first media scope; unsupported posts get a visible non-match/unsupported result rather than arbitrary media selection.

A source-relative route can select destinations independently of other routes. A route anchored to an earlier route may select only destination accounts also present on that predecessor. Each selected destination waits for its own predecessor receipt. All transformations start from the frozen original image in R1; a timing dependency does not imply an image-processing dependency.

## 3. Progressive editor

### Whole-recipe selection

**Recipes** belongs above the source trigger. Its inline chooser loads a saved recipe or editable template covering the complete trigger, filters and releases; **New recipe** starts a fresh flow. Naming and saving apply to the whole configuration, never an individual destination row. Loading does not publish or enroll. Preserve the previous working configuration through Undo. The standalone demo exposes two templates and the existing single locally saved recipe slot; a production library lists creator-owned recipe revisions.

### Trigger first

Initial surface: **When I post to [connected account]** and **+ Filter** in a compact source strip. With a valid sole connected account, expose the first release immediately; otherwise reveal releases after a valid source selection. Reusable future-post recipes are the primary path. Show actual account identity with its platform logo, not merely a platform name. A source selector lists only linked accounts with `monitor_publications` and media retrieval capabilities; supported unconnected accounts use a separate connection path. Instagram must not appear as a working source before its adapter exists.

Filter controls open inline. Active filters remain visible as removable chips after the tray closes. R1 semantics:

- **Contains image:** publication has image media; enrollment separately validates the one-image limit.
- **Text contains:** Unicode-normalized, case-insensitive literal substring in normalized title/caption/body text. `$relay` is literal text, not a variable or regex. Matching does not strip it from outbound copy automatically.
- **Link:** parse creator-supplied HTTPS URL; match a normalized hostname and optional path prefix against structured outbound links. Host matching is exact, not substring (`example.com` must not match `example.com.evil`). Path prefix requires a segment boundary; query/fragment do not affect matching. No implicit network fetch or redirect following.
- **All conditions:** every enabled filter must pass. Empty enabled text/link values are invalid. No filter means all new posts, still subject to supported media eligibility; the review summary states this scope.

Recent-post/sample testing shows Match / No match and which filter failed. It never enrolls or publishes. Production matching and the dry-run matcher share a pure normalized contract. Discovery may lag publication; due times use publication time, not the time Relay syncs it.

### Routes next

A valid trigger exposes one **Also send it to…** heading followed immediately by connected destination account tags. Each numbered release starts with those tags, including platform logos and handles; they remain editable when details are collapsed. **Details** sits to the right and reveals timing, image/assistance (Teaser / Coach), then Description. One release exposes details at a time; all may be collapsed. Collapsed rows show timing and treatment below their destinations. Preview release labels, Editing badges and saved-description names never become route headings. Opening another release changes presentation only; it never invalidates a saved recipe. There is no route-name column or required per-step label. The creator names only a saved recipe. Summaries derive descriptions from the selected image and destinations; stable route IDs remain internal.

- Choose connected destination account chips first, then **After [1] day**, then optional modification buttons. Disabled/unconnected accounts are not selectable. New rows preserve the original image and description until a modifier is selected.
- **Teaser** is a checkbox applying Previewizer treatment; a separate disclosure shows the selected preview type and opens direct choices without changing enabled state. Turning it off restores the original image, preserving the selected style for later reuse.
- **Description** is a divided, full-width region within the active release, visually distinct from compact timing controls. Its selector has **Keep original**, **Edit original**, **Use snippet**. The selected mode opens the relevant context directly within this panel.
- Keep original previews actual source copy when available. With no uploaded source, it simply states that copy will be taken from the future post. **Edit original is disabled until actual source text exists**; uploaded/scheduled status alone is insufficient. Per-run review may edit after ingest. Changing to a context without source text returns selection to Keep original while retaining the old edit as an unapplied draft.
- Edit original initializes once from the actual source, then preserves creator edits across mode/destination changes. It is a literal per-route replacement, not an automatic diff/merge for future posts. Upcoming/reusable recipes can instead use saved text or Coach; illustrative sample captions never enter production snapshots. A source-version change requires explicit reseeding/review, never a silent overwrite.
- Use saved description lists creator-owned prior drafts, previews destination fields, and offers **Edit draft** / **New draft**. Edits open full name/title/body/X text/tags controls. Saving an edit creates a new immutable draft version/identity and selects it for this route; the old draft, sibling rows and accepted recipe revisions remain unchanged. Creating a draft does not publish or enroll anything. Cancel restores the prior selection. Unfinished edits require save/cancel before confirmation.
- Saved-draft selection snapshots exact version/values into the recipe revision and enrollment. Later library edits never replace an accepted action's text. Multiple reusable drafts are supported; the demo has a 32-draft local budget and stores them independently of saving a recipe. Production requires creator/tenant ownership checks, additive persistence and bounded server validation.
- **Coach** is an independent checkbox with an Engagement disclosure opening Help me with and optional notes; engagement remains the supported first-release goal. It can accompany Teaser and an edited/saved description. It works on the chosen base description and always requires review. With Coach off, saved and custom text remain exact.
- Toggle states indicate applied behavior; disclosure state indicates which tray is open. Closing a tray never removes a selected modification. The selected style appears on its disclosure; review authority remains in the persistent bar; description selection stays visible in its own section.
- A compact posting-date dropdown offers **After a delay**, **First/last day of this month**, and **First/last day of next month**. Day count appears only in delay mode. “This/next month” is relative to the source or predecessor publication in the recipe timezone, never the editor/discovery date. This is a one-off release rule per source, not monthly recurrence.
- **Time** is a small anchored dropdown beside the timer, containing clock time/timezone and, for later rows, the reference selector. It does not reserve a full-width section. It closes on outside click/Escape, supports keyboard use and never changes timing merely by opening. An empty clock means elapsed time in delay mode or the reference's local hour/minute in calendar-boundary mode. **Clear time** removes the explicit clock. Selected clock/reference remain visible when closed.
- Later rows may count from **My original post** or a preceding **Post N goes live**. Stable IDs prevent cycles; the first row has no redundant reference choice. Only an actual per-destination publication receipt advances the chain.
- Removing a predecessor requires first changing/removing its dependents. Removing a predecessor destination requires resolving dependent destinations. Never silently reanchor or drop work.
- **And then…** creates an unnamed row initially anchored to the preceding post, copying its eligible destinations. The reference dropdown can make it source-relative/independent. Every route still transforms the original artwork. Destinations occupy the row header; timing and treatment use two desktop columns and stack on mobile. Only style/Coach details use contextual inline panels; timing stays compact. Collapsed releases retain the sequence context. Opening, inserting and removing releases uses restrained positional motion without repeating page-load animation.

### Final choices last

A persistent bottom bar exposes **Save recipe**, review authority and a Test shortcut. Save recipe first validates the configuration, then opens final choices with timezone, review authority, notification preference and recipe name/Default/Always on. Saving commits configuration only. A secondary **Confirm plan** path remains available for one-time preparation. Notifications appear only here, after route composition.

| Final choice | Contract |
| --- | --- |
| Confirm plan | Explicitly target selected artwork or the next matching publication. Next-match is consumed once, transactionally; concurrent discoveries cannot consume it twice. Confirmation authorizes preparation under R1, not publication |
| Save recipe | Save reusable configuration; does not start jobs by itself |
| Default | Preselect this recipe in its source/account publishing context; never enables discovery or publication. One default per defined context; changing it replaces that selection explicitly |
| Always on | Enroll future matching posts while active. Separate from Default and separate from publishing permission |
| Notifications | In-app attention remains available; opt-in creator summary email. This choice does not grant delivery authority |
| Review mode | R1: Review each post. Remote review, Automatic and Cancellation window are unavailable until capability/authority gates pass |

The final Save recipe action commits the inline name, Default and Always on fields; opening final choices alone does not save. It is distinct from confirmation. When both one-shot and Always-on use the same logical recipe/source, reuse the existing enrollment rather than accidentally posting twice. Explicitly repeating a release requires a separately named confirmed plan identity; no broad global source dedupe across intentional independent recipes.

Editing a configured trigger or route invalidates the final review acknowledgement; preserve entered values, show the error near its field, and require renewed confirmation. Do not erase downstream work just because its tray is temporarily irrelevant. Saved recipe revisions do not mutate already accepted runs.

## 4. Visual / interaction contract

Use GitHub Primer as interaction direction, while retaining Relay's dark neutrals and purposeful green primary action: compact forms, quiet borders, clear selected states, consistent spacing and contextual disclosure. Rounded surfaces (13–14px), controls (9px) and pill-like account selections; no sharp rectangular panels. Sans-serif hierarchy; no hero headline or explanatory wall of copy in the editor.

Primary guidance: [Primer progressive disclosure](https://primer.style/product/ui-patterns/progressive-disclosure/), [forms](https://primer.style/product/ui-patterns/forms/), and [notification messaging](https://primer.style/product/ui-patterns/notification-messaging/). Keep the user's context and pair disclosure icons with meaningful labels. These are references, not a dependency or a requirement to import Primer components into Relay.

Use short fade/translate entrances (roughly 160–220ms), restrained hover transitions, and no forced scroll jumps during editing. Honor `prefers-reduced-motion`. Primary editing uses inline trays; no browser alerts, prompts, or modal wizard. Toasts acknowledge save/confirm; inline errors persist. Modals are reserved for exceptional destructive actions or a later focused review flow.

Keyboard users can operate every disclosure, chip, input and final choice; maintain focus after row edits and removal, use `aria-expanded`/`aria-controls`, and hide inactive sections from the accessibility tree. Narrow layouts stack form fields and simulator actions into labeled cards, without horizontal panning. Controls target 40px with readable 14px functional text and 13px supporting text. Test and handoff actions move keyboard focus to the revealed context. Working drafts recover separately from saved recipes; valid removal, reset and example loading offer Undo. Essential controls must not rely on hover, color alone or drag gestures.

## 5. Capability and execution boundaries

The current `listConnectedPlatforms` is platform-level readiness: X/DeviantArt can say `needs_extension` without a bound account identity. Extend it with creator-owned account IDs and explicit capabilities: monitor publications, retrieve image media, guided handoff, publish image via API, and retrieve/attest publication evidence. A live extension is not proof of a connected destination account. Establish and revalidate destination account binding; show manual verification honestly where provider verification is unavailable.

UI enablement comes from capabilities, not hard-coded platform lists in the recipe model. R1's initial adapters remain narrow. Recheck owner, account connection, media availability and route permissions on every claim/handoff; a disconnect blocks affected actions without destroying history or stopping unrelated destinations.

Reuse `CreatorDistributionRuleRun` for route/destination actions and existing drafts, templates, media binding, distribution plans/variants/attempts and rail events. Add immutable configuration/revision/enrollment and account/route correlation. Do not create another mutable posting ledger, scheduler, natural-language compiler or generic workflow engine. Existing one-rule `CreatorAutomation` connectors remain unchanged for legacy presets.

Every scoped plan and package must address the exact route action, never “latest active plan for this artwork.” Existing `createPostDistributionPlan` can archive another active plan; plan isolation is a prerequisite. Existing Full routing resolves current canonical media; recipe actions require frozen image/version selection rather than a silent latest-media fallback.

## 6. Discovery, identity and route progression

Activation or a next-match plan establishes an eligibility boundary. Monitor creator-owned, active, originally published sources after that boundary. Historic imports and edits to old posts do not become new publications. Record match reason and source account/provider publication identity. Ordered pagination and durable cursors must drain >100 sources and resume after outages without missing or duplicating them.

Recipe/source enrollment is unique across recipe revisions; a one-shot plan has its own consumption key. Snapshot source version/image, recipe revision, routes, base description/values, explicit Coach enabled flag, validated template, destination account IDs and timezone. Later edits affect future enrollments. Source removal blocks release; never substitute another image. Track output lineage and suppress recipe-generated re-entry/feedback loops unless a future explicit contract authorizes it.

Default timing is an elapsed duration: anchor instant + N × 24 hours, with N from 0–365. Thus a one-day timer is 24 hours even across DST. Only an explicit clock in delay mode switches to local calendar days: add N local dates to the reference, apply local HH:mm, and clamp at/after the anchor instant. In that explicit mode, DST gaps move forward by the gap and folds select the earlier occurrence. Persist the mode, UTC due time and frozen inputs; do not infer the mode from a hidden 09:00 default. Existing saved clock-based configurations retain their meaning and show their chosen time. Extend existing tested calendar helpers where necessary.

The other bounded timing kind is `month_boundary`: edge first/last, month offset 0/1, reference publication and optional explicit HH:mm. Compute the reference's local year/month, then the requested first/last date with leap-year and year-rollover handling. Without an explicit clock, inherit the reference's local hour/minute. Apply the same documented gap/fold policy. If the resulting instant is before the reference, mark that action Needs attention with no due time or handoff; never backdate, clamp to today or silently roll to another month. Independent sibling actions continue; dependent actions still wait for a valid receipt. A late discovery/worker does not reinterpret the chosen month. A date now overdue but valid relative to its reference enters overdue review under normal R1 authority.

Normalize timing as an explicit union (elapsed days, local days with clock, or month boundary), with a separately validated anchor. Pin normalized spec, reference, timezone and computed UTC instant at resolution. Existing clock-based recipes preserve their interpretation. Current `calendar-resolver.ts` has local-date/weekday resolution and private zone conversion helpers; it does not implement these month-relative recipe rules. Extract/adapt a tested helper rather than claiming existing support.

An earlier-route anchor resolves separately per destination account. A missing receipt leaves the action waiting with no guessed due date. X published Tuesday and DeviantArt Friday produce independent downstream due dates. Repeated receipts never reset the clock. In R1 manual confirmations use the first accepted confirmation time, conservatively labeled as such; a destination-valid post URL is required. Do not accept guessed/backdated publication times.

R1 transformations start from the immutable original. Previewizer templates omit crop/selection, so due preview actions still require creator crop/review/export. Share an exported artifact only among identical source/template/crop route snapshots. Original actions bypass preview export. Never fall back to the original when a preview is missing or fails.

## 7. Copy and approval

- **Source:** derive normalized destination fields from the frozen source copy. Show transformations and length/format conflicts at review; never silently truncate.
- **Saved / custom base:** versioned creator-owned saved drafts or uploaded-source edits with title/body/X text/tags. Snapshot values at enrollment. Custom edits must not mutate shared presets or sibling rows. With Coach disabled, this text is exact and bypasses the LLM.
- **Optional Coach treatment:** apply after resolving original/saved/custom base text, only when explicitly enabled. Use existing `PostingAssistantContext` goals, initially engagement optimization plus optional notes, with current entitlement checks. Leave the base text immutable. Generate per destination once, persist the candidate, and require creator acceptance. Accepted copy bypasses regeneration on retry. Model failure leaves a visible repair/review action, not silently approved source copy.

Store base-description selection separately from Coach enablement; legacy exclusive Coach mode maps to original base plus Coach enabled. Do not let an older exclusive enum silently discard selected stock/custom text.

Coach does not imply live external trends, guarantee engagement, or allow changing media/timing/authority implicitly. A recommendation may be offered, but creator-defined delays remain unchanged unless explicitly edited. R1 generative output cannot use unattended delivery.

Review displays exact image, destination account, title/text/tags and routing. Payload edits clear approval for affected actions. Fingerprints cover recipe/run/route/action, media version/hash, accepted copy, destination/account and due time. Extension handoff still requires the creator's final Publish action on that site; edits made there are not represented as an exact Relay-payload audit.

| Evidence | Action state | Unlock dependent routes? |
| --- | --- | --- |
| Awaiting anchor receipt | Waiting for publication | No |
| Due preview without export | Needs preview | No |
| Prepared / Coach candidate unaccepted | Ready for review | No |
| Editor opened, filled or legacy automation completed | Awaiting confirmation | No |
| Valid URL plus first creator confirmation | Published — creator confirmed | Yes, matching destination only |
| Future correlated API publication receipt | Published — API confirmed | Yes, matching destination only |
| Timeout or uncertain outcome | Needs attention | No; reconcile first |

Legacy `completeAutomationRunFromHandoff` semantics stay unchanged. Recipes consume strict canonical publication evidence. Creator attestation is never mislabeled independent API verification.

## 8. Lifecycle, failure and notification

Reusable recipe state: draft/active/paused/archived, independent Default flag and Always-on enrollment mode. One-shot plans: armed/consumed/cancelled, with completion derived from their canonical actions. Do not equate Always on with automatic publishing.

- Pause stops new enrollments and preparation/handoffs for accepted work; confirmations for already-performed publications still record. Resume makes overdue accepted actions reviewable; sources first published during the paused window remain excluded.
- Archive cancels unstarted actions but retains evidence. A late receipt can be recorded without creating descendants. No external post is deleted.
- Skip/cancel propagates only along dependent actions on the same destination; independent source-relative routes remain eligible.
- Reviewable artifacts expire after the existing 72 hours, starting at materialization, not while a dependent route waits 30 days. Prepare again uses the same frozen identity, clears approval, and does not replay posted siblings.
- Bounded worker batches retain backlog; do not inherit legacy latest-only/one-pending behavior that drops sources. Retry definite failures; reconcile uncertain external success before repeating a post.

Notification preferences are selected at the end and resolved against current consent before sending. Email only a verified creator account address, with provider verification where supported; an unverified/unavailable address disables email, not the recipe. No arbitrary recipient list or paid media attachments/private URLs.

One summary per enrollment/route after all selected destinations are terminal, showing actual results and dependent due dates. Recoverable blocks can emit one attention notice per episode, then a later final summary. Aggregation never delays a successful destination's descendant. Durable outbox/dedupe and independent mail retries reuse `createEmailSender`; log transport is Preview, provider acceptance is not inbox delivery. Consent revocation suppresses unsent notices. No email retry can repeat publishing.

## 9. Follow-up delivery modes

### Remote review

Email opens a compact mobile review page; GET does not approve, cancel, consume an action token, or publish. Final authenticated, short-lived, replay-protected POST is bound to the exact action/payload/account. Distinguish **Approve and send** from **Confirm I published it**. A changed payload, expired session/token, or already-resolved action cannot reuse old approval. Prefer session sign-in on the review page; do not grant account access merely from possessing a forwarded email link.

Approve-and-send requires a capable API connector. An email click cannot finish an unattended extension-only editor. R1 emails can link to the existing manual review/handoff journey; remote delivery is not included in R1.

### Automatic / cancellation window

Automatic is explicit standing permission per route/destination/revision and supported payload type. First prove approved image/copy/account fidelity, idempotent external delivery and reconciliation, immediate revocation checks and kill switches. Current Bluesky publishing is text-only and must be upgraded before art delivery qualifies.

Cancellation window means “publish this frozen payload unless stopped within N.” It requires separate opt-in permission, a prepared final payload, a recorded notification-provider acceptance and a full future window. Failed/uncertain notification holds the action for review; provider acceptance is not claimed to prove the user read it. Stale deadlines after a prolonged outage hold for review rather than causing surprise publication. Stop and send claims are serialized with a last-moment permission/cancellation check; once a remote send is in flight, show that stopping it is no longer guaranteed.

Payload changes, Coach regeneration, render failure, missing ownership/auth or revoked permission invalidate the window. No notification-open tracking is treated as consent. R2 must separately specify notice latency allowance, window bounds, worker lateness budget and race acceptance before activation. No unattended final click on X/DeviantArt through the extension.

Background previews require an allowlisted renderer and explicit crop policy/source-approved crop. Existing saved layouts alone do not authorize guessed crops or censor regions. Keep these delivery modes unavailable until their release gates pass.

## 10. Success and non-goals

R1 proves a creator can define filtered new-post intake, add at least three routes with different treatments/copy/delays, fan a route out to connected destinations, save it as selectable/Default/Always on independently, and complete review-first releases with truthful receipt-based progression and opted-in summaries. [Acceptance](ACCEPTANCE.md) and live connector evidence are mandatory before release.

Measure match precision, setup completion, review time per release, confirmed outcomes, waits/blocks, duplication and summary accuracy. Presets configured and toasts shown are not completion metrics.

Non-goals: arbitrary code/graphs, social inbox, conversion optimization, live trend feeds, new billing plans, fan entitlement changes, historical library reposts, and automatic discovery of new connector permissions.
