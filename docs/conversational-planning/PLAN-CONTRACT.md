# CP-04 — Conversational plan contract (Frozen design)

**Review state:** Design frozen by parent architecture review, 2026-10-15, after CP-02 and CP-03 acceptance. CP-04a implementation and its review remain pending. It does not modify either legacy Automations preset or `applySocialPlaybook` v1.

## Scope and invariant

A plan is an opt-in, creator-owned **composition**: source references, requested finite actions, copy proposals, dependency edges, time intent, unresolved slots, revision history and pointers to existing records. It is not a second draft, schedule, handoff, publication, or reminder ledger. The server re-reads `AutopostDraft`, `CreatorScheduleEvent`, `PostDistributionPlan/Variant/Attempt`, media, and source post to render execution state. A snapshot may say *requested*, *reviewed*, or *approved for preparation*; it must never say an action was posted. Plan confirmation authorizes preparation only. Creator approval of a variant and creator confirmation of an external publication are later, distinct actions.

## Exact wire type proposal (`contract.ts`)

All IDs below are opaque strings. Strict validation rejects unknown keys, unknown enum members, duplicate step IDs, cycles, cross-creator references, invalid URLs, negative offsets, and dependent steps without their prerequisite. The interpreter can return proposed *intent* IDs; only deterministic compiler/server code creates this validated wire shape. Text from filenames and descriptions is data, never executable instructions.

```ts
import type { PreviewTemplateConfigV1 } from "../distribution/preview-template-config.js";

type Destination = "patreon" | "x" | "deviantart" | "bluesky";
type SocialAction = "reply_block" | "engagement_check"; // v1 subset of registry
type Capability =
  | "prepare_post_draft" | "prepare_preview"
  | "prepare_distribution" | "publish_handoff"
  | SocialAction;
type PlanReview = "proposed" | "approved_for_preparation" | "cancelled";
type SourceRef = {
  kind: "existing_post" | "staged_media";
  post_id: string | null;
  selected_media_ids: string[]; // nonempty, ordered, creator-owned
  creative_work_id: string | null;
  creative_series_member_id: string | null;
  source_revision: string; // server-computed stable fingerprint of selected metadata
};
type CopyValue =
  | { mode: "literal"; value: string; origin: "creator" | "compiler" }
  | { mode: "part_substitution"; prefix: string; part: string; suffix: string;
      part_source: "creator" | "creative_series_member" };
type TimeSpec =
  | { kind: "absolute"; at_utc: string; timezone: string; local: string }
  | { kind: "after_publication_calendar_days"; anchor_step_id: string;
      day_offset: 1 | 2; timezone: string; local_time: string };
type StepBase = { step_id: string; depends_on: string[]; enabled: boolean;
  title: CopyValue; note: string | null; time: TimeSpec | null };
type PlanStep =
  | (StepBase & { capability: "prepare_post_draft"; intended_destination: "patreon";
      source_media_ids: string[]; target_post_id: string | null })
  | (StepBase & { capability: "prepare_preview"; source_step_id: string;
      template_id: string; template_config_snapshot: PreviewTemplateConfigV1 })
  | (StepBase & { capability: "prepare_distribution"; source_step_id: string;
      preview_step_id: string | null; distribution_group_id: string;
      destination: Destination;
      copy_title: CopyValue })
  | (StepBase & { capability: "publish_handoff"; distribution_step_id: string;
      destination: Destination })
  | (StepBase & { capability: SocialAction; publication_step_id: string;
      destination: Destination; target_post_id: string | null });
type UnresolvedRequest = { request_id: string; requested_text_quote: string;
  intended_capability: Capability | null; intended_destination: Destination | null;
  blocking_slot_ids: string[] }; // never executable or materialized
type DistributionGroup = { group_id: string; source_step_id: string;
  preview_step_id: string | null; destination_step_ids: string[] };
type Clarification = { slot_id: string; field: string; question: string;
  affected_node_ids: string[]; blocking: true;
  reason: "ambiguous_source" | "missing_post" | "unknown_part" |
    "literal_or_template" | "missing_template" | "unlinked_destination" |
    "unknown_time" | "unknown_engagement_action" |
    "unknown_engagement_target" | "unsupported_action" | "visual_request" };
type PlanSnapshot = { schema_version: 1; plan_id: string; creator_id: string;
  revision: number; review: PlanReview; source: SourceRef;
  steps: PlanStep[]; distribution_groups: DistributionGroup[];
  unresolved_requests: UnresolvedRequest[];
  clarifications: Clarification[];
  requested_text_quote: string; created_at: string; updated_at: string };
type AuthorityKind = "autopost_draft" | "schedule_event" | "relay_post" |
  "preview_media" | "distribution_plan" | "distribution_variant" |
  "distribution_attempt";
type PointerSlot = "draft" | "attention_event" | "relay_post" |
  "preview_media" | "distribution_plan" | "variant" |
  "current_attempt" | "engagement_event";
type StepPointer = { node_id: string; kind: AuthorityKind; authority_id: string;
  slot: PointerSlot }; // node is step or group; no copied status/success flag
```

`template_config_snapshot` is exactly the server's parsed `PreviewTemplateConfigV1` (`parsePreviewTemplateConfig`), with server size limits; an arbitrary JSON object cannot be used as a layout. `requested_text_quote` is bounded and escaped for display. `copy_title` is the destination variant title, while `StepBase.title` is the rail/review label; changing one does not silently change the other. A `literal` title preserves the creator's exact string after ordinary length/safety validation, including a literal `X` when explicitly requested. A `part_substitution` joins bounded `prefix + part + suffix`; the creator can use any series name, not a hardcoded `Series`. Substitution is allowed only when the creator supplies the part or exactly one creator-owned `CreativeSeriesMember.partLabel` yields it. A plain phrase “Part X” without known part leaves `unknown_part`; never guess a sequence number from media pixels or a filename. The server stores the resolved part and source in the snapshot so later series edits do not silently retitle the draft.

`PlanSnapshot.steps` contains only fully specified, validated **executable requests**; a step may await the authoritative output of a declared dependency (for example, the real Relay post ID after draft review) but may not omit its source, destination, template, target policy or time. Missing fields live in `unresolved_requests` with exact blocking clarification slots. They have no `step_id`, authority pointer or materialization key, and no adapter can execute them. `intended_capability: null` represents an unsupported or unparsed phrase as inert quoted text, never a new free-form action key. `affected_node_ids` references existing step IDs or unresolved request IDs. If source identity itself is missing or ambiguous, return an unpersisted `ClarificationPreview` with no executable steps; do not manufacture a `SourceRef` or persist a runnable plan.

Pure shape validation checks enums, bounds, DAG, internal references, matching distribution group/variant destinations, `preview_step_id` requirements, copy/time shapes, and that every unresolved request has a blocking slot. Ownership, destination connection, current post state, template row/config freshness, source metadata fingerprint, URL identity, and entitlement require a separate **trusted server validation context** loaded under the authenticated creator. CP-04a must not claim a pure parser can prove creator ownership or publication. The context validator rejects a source/target/template/media row outside the creator and returns a stable scope error. UI/client data cannot supply that context.

`prepare_post_draft` does not imply Patreon publication. A selected existing source `Post.id` may be used for distribution if approved, and `target_post_id` remains null until a real Relay post is linked. A staged-media source needs a real Post before distribution. If the creator wants a new Relay post from attached Library art, the existing draft service cannot attach that art; show a visible source-reference/media repair requirement until a bounded safe copy adapter exists. A title-only draft cannot be labeled ready to publish. The compiler must not claim `source_media_ids` are reserved on the draft. The primary Patreon external destination, if requested, has its own `prepare_distribution`/`publish_handoff` path after a canonical Post exists. Its `preview_step_id` is null, whereas X/DeviantArt teaser distribution requires the saved-template preview step and creator-owned export. The Patreon variant may be prepared and handed off **before** Previewizer opens. This avoids calling a Relay draft publish an external Patreon post. Parent must freeze this choice before Luna codes.

## Dependency and clarification rules

Dependencies are a DAG of stable step IDs assigned by server compilation, not array positions. Every `prepare_preview` depends on the post/source preparation or selected existing Post; each teaser `prepare_distribution` depends on preview export and a real Post; each `publish_handoff` depends on its same-destination distribution variant. A publication-relative social action depends on exactly one same-destination handoff and its qualifying publication evidence. A `DistributionGroup` joins destination variants sharing one canonical source Post; its ID is stable across edits and later preview export. Every distribution step belongs to exactly one group and appears once in `destination_step_ids`. A group has one `PostDistributionPlan`, and the plan has one `PostDistributionVariant` per destination under existing unique `(planId,destination)`. Patreon uses original source media and may create the group plan first. X/DeviantArt teaser steps remain unmaterialized until Previewizer export; then the adapter adds their variants to the **same active plan** using `reviseScheduledPostDistributionPlan`, which preserves posted/handed-off siblings and variant IDs. CP-11 must prove this service's Rail-linked and media-routing semantics support that extension without changing the already posted Patreon variant; otherwise return a bounded adapter gap for review. It must never call `createPostDistributionPlan` again and archive Patreon. The group has no all-or-nothing preview dependency: only teaser steps depend on export. Step IDs survive revisions when semantic identity (capability + destination + source target + ordinal from the creator's explicit request) remains; a replaced step gets a new ID. Moving a step in the UI does not change its identity. A disabled step blocks its dependents until the creator removes or reroutes them. No step may self-depend or point to a missing/disabled predecessor.

Clarifications block only their unresolved requests and dependent nodes. Missing source/identity or a visual-only request blocks the entire proposed plan and yields no persisted executable steps. Unknown part keeps title-dependent draft and teaser requests unresolved, but an independent literal reminder may remain reviewable. Missing template keeps preview and teaser requests unresolved, not a Patreon draft. Unlinked X may leave an X variant reviewable but blocks X handoff and X-anchored engagement, not DeviantArt. “Stoke engagement on the next two days” requires exact selected action **and** target destination for each day; the UI may offer `reply_block` and `engagement_check` as choices but cannot choose silently. There is no promised engagement outcome.

At revision `r`, a creator manual edit is stored as a field-level patch with `base_revision=r` and a stable step ID. Accepted edits become revision `r+1`. A later AI suggestion merges only fields untouched since its base revision, using the existing cart-patch conflict pattern; it never overwrites a manual title, destination, time, disabled step or template choice. A stale patch returns a field conflict and current snapshot. Once preparation created an authority record, changing prepared copy edits that authority through its current allowed service and records a new composition revision; never creates a second draft just to reflect a title edit. A handoff already started cannot be silently retitled or moved; require a new explicit variant/handoff revision. Completed publication and past due events are immutable history.

## Composition-only persistence proposal for CP-07

Use **one new `CreatorConversationalPlan` configuration row**, not `CreatorAutomation` (whose preset/rule fields are mandatory) and not `CreatorSocialPlaybookRun` (template-bound and due-at anchored). Proposed fields: `id`, `creatorId`, `schemaVersion`, `revision`, `review` (`proposed | approved_for_preparation | cancelled`), `sourceRef` JSON, `snapshot` JSON, `clientCreateKey`, `createdAt`, `updatedAt`; unique `(creatorId,clientCreateKey)`, index `(creatorId,updatedAt)`. `snapshot` includes all steps/clarifications and is bounded to **32 steps, 16 clarification slots, and 64 KiB serialized UTF-8**. Server validates it before every write/read upgrade. No `runStatus`, `stepStatus`, `publishedAt`, `reminderSentAt`, or attempt result goes here.

Use a minimal `CreatorConversationalPlanRevision` row per accepted composition mutation: `planId`, `creatorId`, `revision`, `clientMutationKey`, `requestHash`, immutable `snapshot`, `createdAt`; unique `(planId,revision)` and `(creatorId,clientMutationKey)`. This is configuration history and replay evidence, not an execution ledger. Reusing a key with a different request hash is a conflict. Create, revise, approve and cancel all use compare-and-swap against current `revision`; the revision row and plan update commit in one transaction. A retry with the same key/hash returns the recorded revision and current authoritative pointers. Different concurrent mutations against the same base revision: one wins; the other receives conflict, never a silent merge. Keep history bounded by API step/text limits, with retention policy reviewed before pruning.

Use `CreatorConversationalPlanPointer` as a **pointer-only** relation: `(planId,creatorId,nodeId,slot,authorityKind,authorityId,createdAt)`, unique `(planId,nodeId,slot)`, indexes `(creatorId,authorityKind,authorityId)` and `(planId,nodeId)`. `nodeId` is a step ID or distribution group ID. Slots are finite (`draft`, `attention_event`, `relay_post`, `preview_media`, `distribution_plan`, `variant`, `current_attempt`, `engagement_event`); `distribution_plan` is attached once to the **group**, while each destination step has its own `variant` and handoff pointer. No copied execution status. On an attempt retry after a genuine failure, `current_attempt` may be replaced only by a creator action; historical attempts remain on the variant. Reads check every pointer's creator ownership and relation to its expected parent.

**Atomic materialization keys:** ordinary steps use `plan:{planId}:step:{stepId}`; the shared distribution plan uses `plan:{planId}:group:{groupId}`. Existing `AutopostDraft.workspace` JSON is not uniquely indexed and `CreatorScheduleEvent` has no correlation key. CP-07 should add nullable unique `conversationalStepKey` to authorities the first adapter actually creates (`AutopostDraft`, `CreatorScheduleEvent`) and nullable unique `conversationalGroupKey` to `PostDistributionPlan`; later add a retry-safe handoff mutation key on `PostDistributionAttempt`. These are correlation keys, not statuses. CP-09 must reserve/create the authoritative row and pointer in a recoverable transaction or re-query by unique key after a crash. `PostDistributionVariant` already has unique `(planId,destination)`. If a shared service cannot accept a transaction/correlation key, CP-09 must return that exact adapter gap for architect review rather than claim idempotency. The schema may choose a smaller equivalent unique mechanism if it proves concurrent confirm + restart safety. Never put execution status in the plan table to make retries appear successful.

Approval is idempotent by mutation key and revision. Preparation is idempotent by step key; a failed partial preparation returns existing pointers plus a scoped failure derived from current authorities. Once a step's authority exists, a retry never calls a create service that would archive it, including `createPostDistributionPlan`. An explicit retry of a failed external handoff is a **new** attempt on the same variant with a new creator mutation key, while ordinary HTTP retry returns the same attempt. CP-08 must not report success with mocked materialization as if CP-09 existed.

## Publication evidence contract for CP-12/13

Existing `PostDistributionAttempt` is the authoritative external attempt. `posted` alone is insufficient for new conversational publication anchors because the current completion endpoint defaults to `posted` and accepts no URL. Add a guarded creator-confirm endpoint and typed fields on that **same attempt**: `publicationEvidenceKind = creator_confirmed | platform_api`, `publicationEvidenceAt` (server receipt time), `assertedPublishedAt` (creator supplied instant or platform timestamp), `publicationEvidenceActorId` (authenticated creator actor or API service identity), and `publicationEvidenceVersion` for correction compare-and-swap. Reuse the attempt's existing `externalUrl` and `externalId` for the canonical platform identity; do not duplicate them in the plan or another ledger. These fields are publication provenance on the authority. They must be set atomically with `attempt.status=posted` and validated `externalUrl`/`externalId`; never inferred from `fill_succeeded`, extension tab URL, an old `posted` attempt, or a manual platform link alone. A later correction is an explicit authenticated mutation with version compare-and-swap and audit trail; it cannot rewrite an already completed reminder silently.

For X, DeviantArt and Patreon, the creator must use a reviewed “I published this” action, paste a platform-specific published-post URL that passes `parsePlatformPublishedUrl`, and state the actual publication date/time (defaulting the UI to now is allowed only when visibly editable and explicitly confirmed). X requires an X status URL, DeviantArt a deviation URL, Patreon a post URL. A URL is creator assertion, not independent platform verification. For Bluesky, successful API post response with URI/CID and server timestamp can supply `platform_api` evidence; if the API response was not durably correlated to the attempt, wait for creator confirmation. The extension link watcher may offer a prefilled candidate URL but cannot itself qualify an anchor. Empty, wrong-destination, malformed, or unowned attempt evidence stays unqualified. Legacy `posted` attempts remain visible as posted history but do not automatically anchor new conversation steps.

When evidence qualifies, resolve day+1/day+2 as **calendar days in the creator's frozen IANA timezone** from `assertedPublishedAt`, at the creator-selected `local_time` for each step; do not add 24-hour milliseconds. Timezone comes from the creator posting-goal timezone at plan approval and is stored in each `TimeSpec`; if missing, ask for one before approving publication-relative steps. Use the existing `zonedLocalDateTimeToUtc` helper. For DST: nonexistent spring local times advance to the first valid local time that day; repeated fall local times choose the earlier occurrence. If the helper does not implement these exact policies, CP-13 must add an explicit resolver/test rather than assume. A late receipt uses actual asserted publication day; if the resulting due time is already past, create one visible overdue event without retroactive toast spam (reminder worker sends only future/new due notifications according to its normal behavior). A corrected publication time reschedules only pending, unsent engagement events after creator review; done/dismissed events remain history. An unqualified, failed, abandoned or cancelled attempt creates no publication-relative event.

Cancellation before approval removes the proposal from future preparation. After approval it stops unmaterialized dependent steps and dismisses only plan-owned pending attention events; it does not delete drafts, posts, variants, attempts, or previously posted results. A creator may separately discard or edit those through their existing services. Cancellation after publication does not erase evidence or completed reminders. Moving an absolute teaser date before handoff revises `scheduledFor`/event due time using existing authority checks; after handoff, require explicit creator action and do not silently move a published post or publication-relative follow-up. If a source post is deleted or ownership changes, dependent steps become blocked and retain history; no automatic substitution.

## Fully specified reference preview

Suppose selected media `m1` resolves to creator-owned post `p1`, `CreativeSeriesMember.partLabel` is exactly `4`, saved template `t1` is owned/valid, and the creator explicitly chooses X `reply_block` on day+1 and X `engagement_check` on day+2 at 10:00 `Europe/London`. The immutable title proposal is `{mode:"part_substitution",prefix:"Series Part ",part:"4",suffix:"",part_source:"creative_series_member"}` for the Patreon draft and the same with `suffix:" Teaser"` for both teaser variants. A reviewer sees “Series Part 4”, “Series Part 4 Teaser” twice, the selected source, saved template, X/DeviantArt destinations, and two waiting follow-ups. The Patreon, X and DeviantArt variant requests share one distribution group. Its plan can begin with the original-media Patreon variant, then gain X/DeviantArt teaser variants after Previewizer export without replacing Patreon history. Before export only the teaser steps wait; before qualified X publication evidence both X follow-ups wait. Confirming the plan creates prepared work only. Each destination is approved and handed off separately; a failed DeviantArt attempt does not prevent X follow-ups after qualified X publication.

If the actual request merely says “stoke engagement on the next two days,” the example above is **not** silently compiled as `reply_block`/`engagement_check` or assigned destinations. It renders four narrow selection slots (action and destination for each day), plus a local time/timezone slot if absent. If “Series Part X” is an exact literal title, preserve it; if `X` is a variable with no verified part value, request the part. No visual details are inferred from selected art.

## Next bounded Luna ticket after freeze

**CP-04a, typed pure contract only:** implement `src/conversational-planning/contract.ts` and `tests/conversational-planning/contract.test.ts` from the accepted types above. Owner files only. Export finite capability/destination/action constants, discriminated shape validators, DAG and group/variant cardinality checks, title mode validation, time validation, clarification scope rules, and hard prohibition on status/evidence fields in plan snapshots. Import and validate the server's `PreviewTemplateConfigV1`. Separate a `validatePlanShape` pure function from a `validatePlanWithContext` interface whose caller must load creator-owned source/template/media/post/connection/entitlement state; CP-04a may define/mock that context and prove an unowned row is rejected, but does not query a database. Tests cover the exact reference shape, unknown capability/destination, cycle, invalid dependency, missing required field encoded as `UnresolvedRequest` (never an executable step), cross-destination engagement target, literal `X`, unresolved part, missing template, visual-only limitation, duplicate step ID, shared plan group with one variant per destination, and a valid Patreon-first group whose X/DeviantArt teaser steps require preview export before their variants materialize. Pure mocked tests; no API, migration, paid call, or external write. Delta Out shows precise test command/result and any contract discrepancy. **CP-04b**, if needed, is separate pointer/storage schema review in CP-07 after CP-06; Luna must not invent a different run family or persistence authority in CP-04a. Parent accepts CP-04a before CP-05/06.

## Frozen parent decisions (2026-10-15)

1. The v1 social action subset is `reply_block` and `engagement_check`; the other five playbook keys remain deferred.
2. Patreon has a separate distribution/handoff destination after a real Relay post. The requested content draft and actual Patreon publication remain distinct.
3. One composition plan, immutable composition revisions, pointer-only relation and nullable unique correlation keys on authorities; no new execution-status ledger. One distribution group starts with Patreon when ready and gains X/DeviantArt variants after preview export without archiving the active plan.
4. New follow-up anchors require provenance-qualified publication evidence on `PostDistributionAttempt`; old bare `posted` rows do not qualify.
5. Relative timing uses calendar days in a frozen creator timezone, with the DST and correction behavior above.

CP-04a may now implement the pure typed contract above. Persistence, adapters and migrations remain gated by their later tickets and architecture reviews.
