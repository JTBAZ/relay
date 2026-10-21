# CP-05/06 — Metadata interpreter and deterministic compiler plan (Frozen design)

**Review state:** CP-05/06 design approved by parent architecture review, 2026-10-15. CP-05 implementation waits for CP-04a acceptance; CP-06 follows accepted CP-05. This document owns no code. The frozen [PLAN-CONTRACT.md](PLAN-CONTRACT.md) remains the plan/action and persistence authority.

## Boundary and decomposition

CP-05 returns a **narrow interpretation of the latest creator request**, not a `PlanSnapshot`. CP-06 resolves that interpretation against creator-owned rows, the frozen finite capability menu and the current plan revision, then builds the validated snapshot. The model cannot provide plan IDs, step IDs, authority pointers, publication evidence, output media IDs, materialization keys or review state. The compiler generates dependencies, `DistributionGroup`, unresolved requests and exact clarification slots. This keeps the provider's strict JSON schema small and prevents a second model-authored execution graph.

Use a dedicated `src/conversational-planning/intent.ts` module now and a dedicated creator-scoped lifecycle route in CP-08 later. CP-05 does not modify `src/gallery-editor/routes.ts`, `compiled-intent.ts`, `provider.ts` or Library cart behavior. CP-06 owns `compiler.ts` only. Reusing the existing `EditorProvider.respond` interface is permissible through an adapter; importing its larger editor intent schema, read-tool catalog or session transcript is not. The new provider call offers **zero tools**. The server performs a bounded metadata read before interpretation; only text fields from its allowlist enter the request.

## Compact, untrusted model context

The server creates this context from the authenticated creator, never from client-supplied row objects. Hard cap: latest user request 4,000 UTF-8 characters, context JSON 12 KiB, total provider input JSON 16 KiB, at most 3 selected media, 4 candidate posts, 3 saved templates, 4 destination summaries, 8 current editable nodes and one compact prior clarification state. If selection or text exceeds a cap, return a focused narrowing clarification before a model call. Do not truncate an ID, quote or selected title so that it silently changes meaning. Human-readable titles, filenames and template names are each capped at 160 characters for model context; if an exact requested title is longer, keep the exact text only in server memory and use the verbatim request span in validation, or clarify if it cannot be represented safely. If a plan has more than 8 editable nodes, expose a narrow page or ask the creator to identify the target; never select an omitted node by title similarity.

```ts
type PlanningModelContext = {
  request_clock: { received_at_utc: string; local_date: string; timezone: string | null };
  plan_revision: number | null;
  selected: { media_ids: string[]; post_ids: string[]; work_id: string | null };
  media: Array<{ id: string; filename: string | null; mime: string | null;
    processing_status: string; primary_post_id: string | null; linked_post_ids: string[] }>;
  posts: Array<{ id: string; effective_title: string; publish_state: "draft" | "published";
    series_member_id: string | null; part_label: string | null; selected_media_ids: string[] }>;
  templates: Array<{ id: string; name: string }>;
  destinations: Array<{ id: "patreon" | "x" | "deviantart" | "bluesky";
    readiness: "available" | "needs_credential" | "needs_extension" }>;
  creator_timezone: string | null;
  editable_nodes: Array<{ handle: string; capability: string; destination: string | null;
    title: string; title_origin: "creator" | "compiler";
    local_date: string | null; local_time: string | null; timezone: string | null;
    time_origin: "creator" | "compiler" | null; template_name: string | null;
    enabled: boolean }>;
  allowed_request_kinds: Array<"primary_draft" | "teaser" | "followup">;
  allowed_social_actions: Array<"reply_block" | "engagement_check">;
  prior_clarification: { slot_ids: string[]; short_questions: string[] } | null;
};
```

`selected_media_ids` on a post is an intersection with selected media, not all post media. Editable handles are server-issued opaque aliases for existing step IDs in the current revision; the model cannot create one. The server keeps the handle→step mapping and current exact editable values outside the prompt. Do not send image bytes, `input_image`, thumbnails, base64, storage keys, signed URLs, full descriptions, tags unrelated to the request, all Library posts, complete templates/config, distribution attempts, patron data, full snapshots or prior transcripts. An optional prior clarification contains only stable slot IDs and short questions, not earlier arbitrary chat. The latest user message is the sole text request; a follow-up can fill prior slots but cannot silently expand prior scope. All context strings are labeled untrusted data. Quote and ID checks block invented references and unauthorized writes, but they do **not** prove the model understood the creator's meaning or ignored an injected instruction. CP-14/16 semantic cases measure that separately.

Selected `MediaAsset` ownership, its linked posts, `CreativeWorkMember`/series part label, and preview template ownership are verified by server queries in CP-06. The model sees only a bounded projection to identify language references; it does not confer authorization. If the request needs pixel-derived colors, visible text, composition or style, return `limitation` with no requests. Previewizer crop/export remains a later human action and is not AI image analysis.

## Narrow strict response schema

Use the repository's `objectSchema`/`matchesSchema` pattern: every property is required in strict JSON schema and absent optional values are represented as `null`; `additionalProperties:false` at every object. One root object has `base_revision: number|null`, `outcome: proposal | clarification | limitation | no_change`, `question: string|null`, and at most **6** `requests`. Each request is a flat record with the same required keys for strict-provider compatibility:

```ts
type RequestIntent = {
  command: "add" | "revise" | "remove";
  target_handle: string | null; // server-issued current editable-node handle
  changed_fields: Array<"title" | "time" | "destination" | "template" |
    "enabled" | "social_action" | "target">;
  kind: "primary_draft" | "teaser" | "followup";
  source_ref: { mode: "selection" | "post_id" | "media_id"; id: string | null };
  destination: "patreon" | "x" | "deviantart" | "bluesky" | null;
  title_mode: "literal" | "part_variable" | "none";
  title_text: string | null; // creator's requested expression, not a resolved title
  template_ref: { mode: "named" | "id" | "none"; value: string | null };
  enabled: boolean | null;
  delivery_intent: "draft_only" | "prepare_for_creator_handoff" | "none";
  social_action: "reply_block" | "engagement_check" | null;
  time_kind: "none" | "absolute_local" | "weekday" |
    "publication_calendar_day" | "unresolved_local";
  local_date: string | null; // YYYY-MM-DD only for absolute_local
  weekday: "monday" | "tuesday" | "wednesday" | "thursday" |
    "friday" | "saturday" | "sunday" | null;
  weekday_qualifier: "this" | "next" | null;
  timezone: string | null; // exact IANA value from trusted context
  day_offset: 1 | 2 | null;
  target_destination: "patreon" | "x" | "deviantart" | "bluesky" | null;
  local_time: string | null;
  time_text: string | null; // exact time phrase within request_quote
  request_quote: string; // exact substring of latest message
};
type InterpretedRequest = { base_revision: number | null;
  outcome: "proposal" | "clarification" | "limitation" | "no_change";
  question: string | null; requests: RequestIntent[] };
```

The schema is intent only. It excludes a free-form capability key, dependency edge, generated title, source publication assertion, arbitrary external URL and arbitrary action text. `add` requires a null handle and null base revision only for a new plan; `revise`/`remove` require a handle from the current context and matching `base_revision`; a plan addition after initial creation has a matching base revision but null handle. `remove` has empty `changed_fields`, and `revise` changes only enumerated fields. The model cannot send a raw step ID, and the compiler rejects handles absent from the server map. The model can use `null` for an unknown action/destination/part/template; it must not choose a default. A `followup` with null social action or target is a narrow clarification, not an executable `engagement_check`. The quote is mandatory for each request, nonempty, and must be an exact substring of the latest user message. Non-null `title_text` and `time_text` must also be verbatim substrings of that quote; the compiler derives prefix/suffix and time values without rewriting the expression. A generic phrase such as “stoke engagement” is not evidence for either social action. `title_mode=literal` means the creator explicitly asked to keep that exact title; `part_variable` means the model detected a placeholder expression, and CP-06 resolves the part only from explicit creator text or one verified series member. Preserve copy casing and punctuation from the quote; no invented CTA, hashtags, promotion copy or engagement outcome.

Absolute time intent has one source: an explicit `YYYY-MM-DD` and `HH:mm` in the creator's frozen IANA timezone, or a weekday resolved deterministically from `request_clock.local_date` and `received_at_utc` in that timezone. An unqualified “Friday” means the **upcoming** Friday at the supplied time or a previously confirmed time on the target step: today qualifies only if that local time is still in the future, otherwise use the following week. Explicit “this Friday” means Friday in the current ISO Monday–Sunday week; if that instant has passed, return a focused date clarification. Explicit “next Friday” means Friday in the following ISO week. These three meanings stay distinct. An absent creator timezone or missing local time with no previously confirmed time is `unresolved_local` and produces a time/timezone clarification; never invent one. A revision such as “move the X teaser to Friday” may preserve its current `local_time` if `time` is the only changed field and that time was already creator-confirmed; the compiler records that preservation. The resolved **concrete local date, time, timezone and UTC instant** must appear in plan review before confirmation. Once a date/time is specified, spring gaps and fall folds follow the frozen CP-04 DST policy. Publication-relative follow-ups use `publication_calendar_day` and a 1/2 offset, never an absolute date guessed from a planned handoff.

The compiler validates kind-specific field combinations. A `primary_draft` has Patreon as the intended destination and no social action/day offset. A v1 `teaser` needs an explicit destination, requested title expression, delivery intent and a creator-owned saved Previewizer template; missing template becomes a slot. A `followup` needs day offset, same-destination publication target and allowed social action before materialization. A `proposal` can contain partially specified intents, but CP-06 converts them to inert `UnresolvedRequest` nodes with blocking slots, never executable `PlanStep`s. A `clarification`/`limitation` response has zero executable requests. Server-written clarification text is preferred over trusting the model's `question` verbatim.

## CP-05 call, routing and accounting

The CP-05 test seam accepts a mock `PlanningProvider` (one `respond` method with strict schema and `AbortSignal`) and a compact context. Future production wiring may adapt `EditorProvider.respond` because `createResponsesProvider` already sends `text.format.type=json_schema`, `strict:true`, `store:false`, and accepts a supplied response schema. Its generic factory currently defaults the model to `gpt-6-astra`; the conversational adapter **must require a nonempty exact model ID, explicit model pricing and the durable budget before constructing or invoking it**. Do not inherit `LIBRARY_EDITOR_MODEL`, the Library route's `gpt-6-sol` compiled default or its optional escalation provider. A missing configuration fails closed with a stable unavailable result. The application production/default routing remains unchanged until CP-16 accepts a measured candidate. Coding with Luna does not imply a Luna runtime exists or is suitable. CP-05 makes no paid calls; mock provider only.

One interpretation call is normal. One repair call is permitted only for malformed JSON, strict schema mismatch, or deterministic interpretation-shape failure, using the same compact context and a short machine-owned error. Logical missing user information produces clarification immediately, never repair. Visual-only or unsupported requests produce limitation. Transport error, timeout, missing provider usage, budget failure or abort are terminal for the turn, with no retry or automatic larger-model escalation. At most **2 provider calls, 0 model tools, 0 escalations**, 30-second wall-clock deadline for both calls together, and configured output cap **3,000 tokens**. The strict schema caps output at 6 request intents, enough for the reference primary draft, X/DeviantArt teasers and two follow-ups. If a request needs more than 6 intents or the provider runs out of output budget, return a clear narrowing clarification or terminal `provider_incomplete`; never accept a truncated JSON object or silently treat an incomplete list as the whole request. A structurally valid but semantically omitted action is not detectable by shape checks alone and remains an evaluation risk. The caller can cancel with `AbortSignal`; no late provider result may mutate a plan.

Return a stable envelope even on failure: `outcome`, sanitized `question/code`, `requests`, `attempts`, `repairs`, `escalations=0`, `usage={inputTokens,outputTokens,costUsd|null,calls,known}`, `elapsedMs`, and `terminalReason`. Count every attempted call, including a malformed first response and repair response. Aggregate usage from every response. If a sent call lacks trustworthy usage or fails after dispatch, `costUsd=null`, `known=false`; preserve the durable budget reservation as unknown under `FileProviderBudget` and report the attempt separately. Never fill unknown actual cost with zero or exclude the failed call from cost per correctly completed task. Provider errors expose no credentials, raw response body or internal URLs. CP-14/16 evaluation uses first-pass accuracy separately from repaired UX; a repair does not erase the first-pass failure.

## CP-06 deterministic compilation

CP-06 accepts `InterpretedRequest`, the latest user text, authenticated creator ID, selected IDs, the authoritative creator-owned metadata lookup, and optional current plan snapshot/revision. It does not call a model, posting service, Previewizer or database write. It returns `{snapshot | clarification_preview | limitation, diagnostics}`. First validate root and quote containment; then resolve source media→exact Post or staged-media path, template ID and validated `PreviewTemplateConfigV1`, part label provenance, destination readiness, title mode and explicit engagement action/target. Unknown, unowned, ambiguous or visually dependent fields never become executable steps. The creator-selected existing Post may anchor a distribution group; a new draft cannot claim attached Library media or an external Patreon publication. Only server code assigns stable step/group IDs and dependency edges under the frozen CP-04 contract.

For the complete reference request, compile primary Patreon content draft, distinct Patreon handoff after a real Relay Post, one group plan that can begin with full-media Patreon, saved-template Previewizer request, X and DeviantArt teaser requests with literal or proven part substitution, and two X-targeted publication-relative social requests only if their exact actions/days were supplied. Otherwise return narrow action/target slots. The compiler must never materialize a teaser variant before preview export or schedule a follow-up from planned due time, composer fill or bare `posted` attempt. Those are later adapter gates; CP-06 encodes the dependencies only.

For revisions, require `base_revision`, re-read the current snapshot, resolve each model `target_handle` through the server's handle map for that revision, and use a field-level patch/expected-value comparison like `cart-patch.ts`. The compiler may revise or remove only fields/nodes directly supported by the latest request quote and listed in `changed_fields`; null fields outside that list mean **leave unchanged**, not clear. A newly added request has no target handle. Preserve manual title, destination, time, enabled step and template edits unless the creator explicitly changes them. Stale or conflicting revisions return a conflict without a new snapshot. Preserve stable IDs for semantically same requests; replacing a target/destination creates a new step ID and reroutes or blocks dependents. Revalidate DAG, finite menu and 32-step/16-slot/64-KiB limits before returning. CP-07 later persists the snapshot and compare-and-swap history.

## Bounded implementation tickets and acceptance

**CP-05 (Luna high; dispatch only after accepted CP-04a):** own `src/conversational-planning/intent.ts` and `tests/conversational-planning/intent.test.ts`. Define compact context projection including server-issued current-node handles/revision/request clock, strict narrow response schema/type, mockable provider interface, timeout/abort and repair policy, image/oversize rejection, terminal usage envelope and exact model/pricing factory preconditions. `src/gallery-editor/provider.ts`, `compiled-intent.ts`, `routes.ts` and their tests are read-only. If an exact-provider adapter requires a shared type change, return the smallest seam for parent review; do not silently edit them. Mock tests: valid add/revise/remove shapes and absolute/qualified/unresolved time shapes; malformed response gets one repair; missing-user-info gets none; no images/base64 from a malformed adapter; oversized context fails before provider call; 6-request/3,000-token limit returns explicit incomplete/narrowing result; transport/timeout/usage/budget failures are terminal and accounting survives; no default model/escalation. Prompt-injection, “stoke engagement,” and visual examples in these mocks test declared output handling and deterministic guards only, **not** model semantic reliability. No paid call.

**CP-06 (Luna high; dispatch after CP-04a and CP-05 acceptance):** own `src/conversational-planning/compiler.ts` and `tests/conversational-planning/compiler.test.ts`. Consume CP-05 intent and CP-04 contract; implement creator-owned lookup **interface** with mocked rows, deterministic source/post/template/part resolution, step/group DAG construction, inert unresolved nodes and field-level revision merge. No Prisma migration, API route, Previewizer or posting edits. Tests: reference Patreon-first group with X/DeviantArt teaser dependencies and both X follow-ups; literal versus placeholder title; unknown part/action/target; unattached staging media versus attached art; ambiguous post/work; missing/unowned template/media/post; unlinked destination; explicit local date/time, unqualified upcoming weekday (including today cutoff), this/next ISO-week distinction, and missing time/timezone; server-handle add/revise/remove, stale revision and manual edit preservation; unknown/malicious handle; null means unchanged outside `changed_fields`; duplicate request; missing preview never executable as teaser distribution; 32/16/64-KiB boundaries. These tests validate compiler behavior for supplied intent, not whether a model correctly interpreted a malicious filename or vague prose. No paid call.

CP-05 tests establish the **interface and deterministic guardrails** with mocks. They do not measure language understanding. CP-06 tests establish valid compilation of supplied intent; they do not prove the model interpreted a creator correctly. CP-14 freezes a metadata-only semantic corpus and dry-run harness; CP-16 later measures an exact candidate and baseline under explicit availability/pricing/budget gates, counting failed first-pass outputs, latency and actual cost per correct task. No flagship fallback may conceal a candidate failure.
