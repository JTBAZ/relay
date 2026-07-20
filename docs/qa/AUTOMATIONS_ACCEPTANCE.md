# Schedule Rail Automations — Acceptance Contract

These scenarios are pass/fail release gates for the Automations worker program. Test names and Delta Outs should cite AU IDs.

## Persona and fixture

Use an Autopost creator with:

- one linked Patreon campaign containing at least three published posts;
- newest post with image media, an older post already processed by the automation, and one image-less edge case;
- linked X plus at least one second destination;
- creator timezone covering a DST transition fixture;
- one saved `CreatorPreviewTemplate`;
- existing ordinary schedule series, legacy distribution rule, and social playbook rows to protect as regressions;
- extension-connected and extension-offline fixture states.

## AU-01 — Discover and gate Automations

The Schedule Rail header exposes an Automations control. It opens a portaled modal, returns focus on close, and displays the two V1 presets.

Fail if:

- the modal is rendered in the rail popover gutter or clipped;
- Autopost-ineligible creators see enabled create controls;
- the icon disappears instead of explaining the plan requirement;
- existing Add Event, playbook, or repeat flows are displaced.

## AU-02 — Create Preview & crosspost

An eligible creator configures cadence/timezone, destination(s), and a saved Previewizer template. Save creates one connector, one trigger-only series, and one owned distribution rule.

Fail if:

- a retry creates duplicate connector children;
- existing post-draft series semantics are changed;
- a `PostTemplate` is used instead of `CreatorPreviewTemplate`;
- an unlinked destination is accepted;
- the feature or plan gate is enforced only in the UI.

## AU-03 — Show the visible-month rhythm

The existing schedule-series horizon creates trigger occurrences and the Schedule Rail shows all planned occurrences in the requested visible month using `recurrence_occurrence`.

Fail if:

- a new rail source is introduced for future automation ticks;
- the ordinary series reconciler creates blank Relay posts for trigger-only occurrences;
- DST or month navigation shifts the intended local wall-clock;
- duplicate occurrences appear after reconcile retry.

## AU-04 — Resolve one eligible source idempotently

At a due occurrence, the coordinator selects the latest eligible published Patreon post that this automation has not processed and creates one linked distribution-rule run.

Fail if:

- another creator's post can be selected;
- unpublished or non-Patreon content is selected in V1;
- concurrent workers create duplicate runs;
- an automation-level mutable last-post pointer is the only dedup protection;
- a source post is marked processed before durable run creation.

## AU-05 — Skip safely when no new post exists

If no eligible new post exists, the occurrence becomes skipped, no draft/event/plan is created, and the creator receives one clustered informational notification.

Fail if:

- last week's post is silently reposted;
- the cadence is paused or deleted;
- repeated sweeps emit duplicate notifications;
- a ghost rail event or blank draft is created.

## AU-06 — Prepare and surface reviewable work

A due run materializes one resumable `AutopostDraft`, snapshots the validated saved template config, and creates one custom `CreatorScheduleEvent` with a safe Relay deep link. The placeholder is replaced by an enriched ready-for-review event.

Fail if:

- a plan/variant is created before preview media exists;
- a second execution ledger is introduced;
- the event cannot be recovered from the rail/modal after a missed toast;
- private media URLs or post bodies appear in reminder payloads/logs;
- retry creates a second draft/event.

## AU-07 — Reuse the sticky reminder channel

The existing manual-event due endpoint emits `schedule_reminder:manual:{event_id}` and the extension toast opens the same approval context as the rail event.

Fail if:

- an automation-specific reminder packet family is required;
- a toast auto-dismisses or marks work complete merely by opening;
- global/per-event reminder preferences are bypassed;
- existing manual or Postbot reminder behavior regresses.

## AU-08 — Preload and review the saved template

Opening approval loads Previewizer with the run's validated template snapshot applied to the source image while preserving source-specific crop behavior. The creator can adjust or cancel.

Fail if:

- template config is loaded from a different creator;
- later template edits mutate an already materialized run;
- stored selection/crop overrides the new source image;
- Previewizer auto-exports;
- ordinary Previewizer callers change behavior without an initial config.

## AU-09 — Create distribution only after preview export

After the creator exports a preview, Relay uploads it, creates/reuses the distribution plan with valid preview routing, and presents the existing destination approval/handoff controls.

Fail if:

- `createPostDistributionPlan` receives preview routing without `preview_media_id`;
- export itself sends to a platform;
- duplicate approval requests create duplicate active plans or attempts;
- the existing extension/Bluesky handoff path is bypassed;
- the run is marked completed before the contract-owned handoff success.

## AU-10 — Expire, cancel, pause, and resume truthfully

Prepared work expires after 72 hours if untouched; cancellation and archive retain history; pause/resume synchronizes connector children without destroying prepared drafts.

Fail if:

- expiry deletes source content or run history;
- stale events remain due in the extension;
- pausing only one child allows hidden discovery;
- archiving cascades through legacy or unrelated rows;
- repeated expiry sends multiple notifications.

## AU-11 — Delayed public release parity

Creating the preset produces an automation-owned `patreon_published` distribution rule. Existing discovery/materialization semantics remain authoritative and automation-owned runs converge on the same draft/event/review path.

Fail if:

- a second delayed-release worker is added;
- legacy distribution rules are force-migrated or changed;
- the wrapper and owned rule can drift after edit/pause/archive;
- one published post creates multiple runs;
- automated publishing is introduced.

## AU-12 — Integrated safety and regressions

Tenant isolation, duplicate delivery, DST/month boundaries, extension offline/revoked, missing image, deleted template, failed upload, and destination unlinking all follow the product contract. Ordinary schedule series, manual events, social playbooks, distribution rules, Previewizer, and cross-post flows retain existing behavior.

Fail if:

- any creator-scoped API leaks another creator's IDs/config/history;
- GET causes mutation;
- a feature-disabled worker continues new materialization;
- an offline extension causes false completion;
- existing tests are weakened or deleted to pass;
- any path publishes without explicit creator confirmation.

## Program pass

AU-01 through AU-12 pass with focused automated evidence and the manual/browser matrix in VS8. Any failure reopens the smallest owning work item in [`../studio/automation-build-plans/TRACEABILITY.md`](../studio/automation-build-plans/TRACEABILITY.md).
