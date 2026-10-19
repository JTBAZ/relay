import { randomUUID } from "node:crypto";
import { parsePreviewTemplateConfig, type PreviewTemplateConfigV1 } from "../distribution/preview-template-config.js";
import { matchesSchema } from "../gallery-editor/action-validation.js";
import { createCalendarResolver } from "./calendar-resolver.js";
import { mergePlanRevision, type RevisionFieldChange, type RevisionHandleMap, type RevisionMergeResult, type RevisionOperation } from "./revision-merge.js";
import {
  validatePlanShape, validatePlanWithContext,
  type Clarification, type CopyValue, type Destination, type PlanSnapshot, type PlanStep,
  type SourceRef, type TimeSpec, type TrustedPlanContext, type UnresolvedRequest
} from "./contract.js";
import { INTERPRETED_REQUEST_SCHEMA, type InterpretedRequest, type RequestIntent } from "./intent.js";

export type SourceMediaRow = { id: string; creatorId: string; processingStatus: "READY" | "PENDING" | "FAILED"; ingestOrigin: string; primaryPostId: string | null; postIds: string[]; autopostDraftId: string | null; filename: string | null; mimeType: string | null };
export type SourcePostRow = { id: string; creatorId: string; publishState: "draft" | "published"; effectiveTitle: string; mediaIds: string[]; creativeWorkId: string | null; seriesMemberId: string | null; verifiedPartLabel: string | null };
export type SourceTemplateRow = { id: string; creatorId: string; name: string; config: unknown; updatedAt: string };
export type TrustedLookup = {
  loadMedia(creatorId: string, ids: readonly string[]): Promise<SourceMediaRow[]>;
  loadPosts(creatorId: string, ids: readonly string[]): Promise<SourcePostRow[]>;
  loadSourceRelations(creatorId: string, mediaIds: readonly string[]): Promise<ReadonlyMap<string, { postIds: ReadonlySet<string>; creativeWorkIds: ReadonlySet<string>; creativeSeriesMemberIds: ReadonlySet<string> }>>;
  loadTemplates(creatorId: string, ids: readonly string[]): Promise<SourceTemplateRow[]>;
  listTemplatesByName(creatorId: string, name: string): Promise<SourceTemplateRow[]>;
  destinationReadiness(creatorId: string): Promise<ReadonlyMap<Destination, "available" | "needs_credential" | "needs_extension">>;
  hasAutopostEntitlement(creatorId: string): Promise<boolean>;
};

export type CalendarResolver = {
  resolve(input: { request: RequestIntent; requestClock: { receivedAtUtc: string; timezone: string | null }; previousConfirmedTime?: Extract<TimeSpec, { kind: "absolute" }> }): Promise<Extract<TimeSpec, { kind: "absolute" }> | null> | Extract<TimeSpec, { kind: "absolute" }> | null;
};
export type CompileResult =
  | { kind: "plan"; snapshot: PlanSnapshot }
  | { kind: "clarification_preview"; slots: Clarification[]; unresolved: UnresolvedRequest[]; source: SourceRef | null }
  | { kind: "limitation"; code: "contract_gap" | "invalid_interpretation" | "unsupported_request" | "source_scope" | "entitlement_required" | "validation_failed" };
export type CompileNewPlanArgs = {
  interpreted: InterpretedRequest; latestRequest: string; creatorId: string;
  selectedMediaIds: readonly string[]; selectedPostIds: readonly string[];
  requestClock: { receivedAtUtc: string; timezone: string | null };
  previousConfirmedTime?: Extract<TimeSpec, { kind: "absolute" }>;
  sourceRevision: string; lookup: TrustedLookup; calendarResolver?: CalendarResolver;
  idFactory?: (kind: "plan" | "step" | "group" | "request" | "slot") => string;
  now?: () => string;
};

export type ConfirmedTimeEvidence = {
  creatorId: string; planId: string; revision: number; stepId: string;
  time: Extract<TimeSpec, { kind: "absolute" }>;
};
export type CompilePlanRevisionArgs = {
  current: PlanSnapshot; authenticatedCreatorId: string; handleMap: RevisionHandleMap;
  expectedRevision: number; interpreted: InterpretedRequest; latestRequest: string;
  requestClock: { receivedAtUtc: string; timezone: string | null };
  frozenCreatorTimezone: string | null; sourceRevision: string; lookup: TrustedLookup;
  confirmedTimes?: ReadonlyMap<string, ConfirmedTimeEvidence>;
  calendarResolver?: CalendarResolver;
  idFactory?: (kind: "step" | "request" | "slot") => string; now?: () => string;
};
export type CompileRevisionResult =
  | { kind: "plan"; snapshot: PlanSnapshot }
  | { kind: "conflict"; code: string }
  | { kind: "clarification"; code: string; question: string }
  | { kind: "unchanged"; planId: string; revision: number }
  | { kind: "limitation"; code: "contract_gap" | "source_scope" | "entitlement_required" | "validation_failed" | "unsupported_revision" };

const idDefault = (_kind: string) => randomUUID();
const safeId = (value: string) => typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value;
const objectRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const nullableString = (value: unknown, max = 500) => value === null || (typeof value === "string" && value.length <= max);
const validMediaRow = (v: unknown): v is SourceMediaRow => objectRecord(v) && safeId(v.id as string) && typeof v.creatorId === "string" && ["READY", "PENDING", "FAILED"].includes(v.processingStatus as string) && typeof v.ingestOrigin === "string" && v.ingestOrigin.length <= 100 && nullableString(v.primaryPostId, 160) && Array.isArray(v.postIds) && v.postIds.every(x => typeof x === "string" && safeId(x)) && nullableString(v.autopostDraftId, 160) && nullableString(v.filename, 500) && nullableString(v.mimeType, 200);
const validPostRow = (v: unknown): v is SourcePostRow => objectRecord(v) && safeId(v.id as string) && typeof v.creatorId === "string" && (v.publishState === "draft" || v.publishState === "published") && typeof v.effectiveTitle === "string" && v.effectiveTitle.length <= 500 && Array.isArray(v.mediaIds) && v.mediaIds.every(x => typeof x === "string" && safeId(x)) && nullableString(v.creativeWorkId, 160) && nullableString(v.seriesMemberId, 160) && nullableString(v.verifiedPartLabel, 500);
const validTemplateRow = (v: unknown): v is SourceTemplateRow => objectRecord(v) && safeId(v.id as string) && typeof v.creatorId === "string" && typeof v.name === "string" && v.name.length <= 160 && typeof v.updatedAt === "string" && v.updatedAt.length <= 50;
const ownRows = <T extends { id: string; creatorId: string }>(rows: T[], creatorId: string, ids: readonly string[]) => {
  const wanted = new Set(ids);
  const found = rows.filter(row => row.creatorId === creatorId && wanted.has(row.id));
  return found.length === wanted.size && new Set(found.map(x => x.id)).size === wanted.size ? found : null;
};
const titleCopy = (intent: RequestIntent, post: SourcePostRow | null): CopyValue | null => {
  if (intent.title_mode === "literal" && intent.title_text) return { mode: "literal", value: intent.title_text, origin: "creator" };
  if (intent.title_mode !== "part_variable" || !intent.title_text) return null;
  const matches = [...intent.title_text.matchAll(/\bpart\s+(X\b|\{part\}|<part>)/gi)];
  if (matches.length !== 1 || !post?.verifiedPartLabel) return null;
  const match = matches[0], start = match.index ?? 0, token = match[0], placeholderIndex = token.toLowerCase().lastIndexOf(match[1].toLowerCase());
  return { mode: "part_substitution", prefix: intent.title_text.slice(0, start + placeholderIndex), part: post.verifiedPartLabel, suffix: intent.title_text.slice(start + placeholderIndex + match[1].length), part_source: "creative_series_member" };
};
function clarificationPreview(args: CompileNewPlanArgs, reason: Clarification["reason"], field: string, question: string, source: SourceRef | null, destination: Destination | null = null): CompileResult {
  const make = args.idFactory ?? idDefault, requestId = make("request"), slotId = make("slot");
  const unresolved: UnresolvedRequest = { request_id: requestId, requested_text_quote: args.latestRequest.slice(0, 2000), intended_capability: null, intended_destination: destination, blocking_slot_ids: [slotId] };
  return { kind: "clarification_preview", source, unresolved: [unresolved], slots: [{ slot_id: slotId, field, question, affected_node_ids: [requestId], blocking: true, reason }] };
}

/** Compiles one trusted, interpreted add-only proposal. This function performs reads only. */
export async function compileNewPlan(args: CompileNewPlanArgs): Promise<CompileResult> {
  try { return await compileNewPlanFromTrustedInput(args); }
  catch { return { kind: "limitation", code: "source_scope" }; }
}

async function compileNewPlanFromTrustedInput(args: CompileNewPlanArgs): Promise<CompileResult> {
  const { interpreted: result } = args;
  if (!matchesSchema(result, INTERPRETED_REQUEST_SCHEMA)) return { kind: "limitation", code: "invalid_interpretation" };
  if (result.outcome === "limitation") return { kind: "limitation", code: "unsupported_request" };
  if (!args.creatorId || !safeId(args.sourceRevision) || !args.latestRequest.trim() || result.outcome !== "proposal" || result.base_revision !== null || result.requests.length < 1 || result.requests.length > 6) return { kind: "limitation", code: "invalid_interpretation" };
  if (args.selectedMediaIds.length > 3 || args.selectedPostIds.length > 4 || result.requests.filter(r => r.kind === "primary_draft").length > 1) return { kind: "limitation", code: "invalid_interpretation" };
  if (result.requests.some(r => r.command !== "add" || r.target_handle !== null || !r.request_quote || !args.latestRequest.includes(r.request_quote) || (r.title_text !== null && !r.request_quote.includes(r.title_text)) || (r.time_text !== null && !r.request_quote.includes(r.time_text)))) return { kind: "limitation", code: "invalid_interpretation" };
  if (result.requests.some(r => r.kind === "primary_draft" ? (r.destination !== "patreon" || r.delivery_intent === "none" || r.social_action !== null || r.day_offset !== null) : r.kind === "teaser" ? (r.delivery_intent !== "prepare_for_creator_handoff" || r.social_action !== null || r.day_offset !== null) : (r.time_kind !== "publication_calendar_day" || !r.day_offset))) return { kind: "limitation", code: "invalid_interpretation" };
  const postReferences = new Set([...args.selectedPostIds, ...result.requests.filter(r => r.source_ref.mode === "post_id" && r.source_ref.id).map(r => r.source_ref.id!)]);
  if (postReferences.size > 1) return clarificationPreview(args, "ambiguous_source", "source_post", "Choose one source post for this plan.", null);
  const teaserTemplateRefs = new Set(result.requests.filter(r => r.kind === "teaser").map(r => `${r.template_ref.mode}:${r.template_ref.value ?? ""}`));
  if (teaserTemplateRefs.size > 1) return clarificationPreview(args, "missing_template", "template", "Choose one saved template for the requested teaser variants.", null);
  const teaserDestinations = result.requests.filter(r => r.kind === "teaser" && r.destination).map(r => r.destination!);
  if (new Set(teaserDestinations).size !== teaserDestinations.length) return { kind: "limitation", code: "invalid_interpretation" };

  const referencedMedia = [...new Set(result.requests.filter(r => r.source_ref.mode === "media_id" && r.source_ref.id).map(r => r.source_ref.id!))];
  const mediaIds = [...new Set([...args.selectedMediaIds, ...referencedMedia])];
  if (mediaIds.length > 3) return { kind: "limitation", code: "invalid_interpretation" };
  const loadedMedia = mediaIds.length ? await args.lookup.loadMedia(args.creatorId, mediaIds) : [];
  if (!Array.isArray(loadedMedia) || !loadedMedia.every(validMediaRow)) return { kind: "limitation", code: "source_scope" };
  const mediaRows = mediaIds.length ? ownRows(loadedMedia, args.creatorId, mediaIds) : [];
  if (!mediaRows) return { kind: "limitation", code: "source_scope" };
  if (mediaRows.some(m => m.processingStatus !== "READY")) return clarificationPreview(args, "missing_post", "source_media", "The selected media is not ready yet. Choose ready media or try again after processing finishes.", null);

  const explicitPostIds = [...postReferences];
  const relationMap = mediaIds.length ? await args.lookup.loadSourceRelations(args.creatorId, mediaIds) : new Map();
  if (!relationMap || typeof relationMap.get !== "function" || mediaIds.some(id => !relationMap.has(id))) return { kind: "limitation", code: "source_scope" };
  for (const id of mediaIds) {
    const relation = relationMap.get(id);
    if (!relation || !(relation.postIds instanceof Set) || !(relation.creativeWorkIds instanceof Set) || !(relation.creativeSeriesMemberIds instanceof Set) || [...relation.postIds, ...relation.creativeWorkIds, ...relation.creativeSeriesMemberIds].some(x => !safeId(x))) return { kind: "limitation", code: "source_scope" };
  }
  const relatedPostIds = new Set<string>(explicitPostIds);
  for (const m of mediaRows) { if (m.primaryPostId) relatedPostIds.add(m.primaryPostId); for (const id of m.postIds) relatedPostIds.add(id); for (const id of relationMap.get(m.id)?.postIds ?? []) relatedPostIds.add(id); }
  const loadedPosts = relatedPostIds.size ? await args.lookup.loadPosts(args.creatorId, [...relatedPostIds]) : [];
  if (!Array.isArray(loadedPosts) || !loadedPosts.every(validPostRow)) return { kind: "limitation", code: "source_scope" };
  const postRows = relatedPostIds.size ? ownRows(loadedPosts, args.creatorId, [...relatedPostIds]) : [];
  if (!postRows) return { kind: "limitation", code: "source_scope" };
  const chosenPostId = result.requests.map(r => r.source_ref.mode === "post_id" ? r.source_ref.id : null).find(Boolean) ??
    (explicitPostIds.length === 1 ? explicitPostIds[0] : mediaRows.length ? [...relatedPostIds].filter(id => postRows.some(p => p.id === id)).length === 1 ? [...relatedPostIds].find(id => postRows.some(p => p.id === id))! : null : null);
  const candidates = postRows.filter(p => !mediaRows.length || mediaRows.some(m => p.mediaIds.includes(m.id) || relationMap.get(m.id)?.postIds.has(p.id)));
  if (!chosenPostId && candidates.length > 1) return clarificationPreview(args, "ambiguous_source", "source_post", "Which linked post should this plan use?", null);
  const post = chosenPostId ? postRows.find(p => p.id === chosenPostId) ?? null : candidates[0] ?? null;
  if (chosenPostId && (!post || (mediaRows.length && !mediaRows.some(m => pHas(m, post.id, relationMap))))) return { kind: "limitation", code: "source_scope" };
  if (!post && !mediaRows.length) return clarificationPreview(args, "missing_post", "source", "Select a post or ready Library media to plan from.", null);
  if (!post && mediaRows.some(m => m.postIds.length || m.primaryPostId)) return clarificationPreview(args, "ambiguous_source", "source_post", "The selected media has linked posts that could not be resolved. Choose one post.", null);
  const mediaIdsForSource = mediaRows.map(m => m.id);
  const workIds = new Set(mediaRows.flatMap(m => [...relationMap.get(m.id)!.creativeWorkIds]));
  const memberIds = new Set(mediaRows.flatMap(m => [...relationMap.get(m.id)!.creativeSeriesMemberIds]));
  if (workIds.size > 1 || memberIds.size > 1) return clarificationPreview(args, "ambiguous_source", "source_work", "The selected media belongs to multiple works or series members. Narrow the source selection.", null);
  const source: SourceRef = { kind: post ? "existing_post" : "staged_media", post_id: post?.id ?? null, selected_media_ids: mediaIdsForSource.length ? mediaIdsForSource : post!.mediaIds.filter(id => args.selectedMediaIds.includes(id)), creative_work_id: [...workIds][0] ?? post?.creativeWorkId ?? null, creative_series_member_id: [...memberIds][0] ?? post?.seriesMemberId ?? null, source_revision: args.sourceRevision };
  // Existing Library posts cannot become a new unattached draft, even when the creator selected no art.
  if (source.kind === "existing_post" && result.requests.some(r => r.kind === "primary_draft" && r.delivery_intent === "draft_only")) return clarificationPreview(args, "missing_post", "source", "A new draft cannot use an existing Library post as its source yet. Choose eligible staged art for a new draft, or request creator handoff from the existing post.", source, "patreon");
  if (!source.selected_media_ids.length) return clarificationPreview(args, "missing_post", "source_media", "Select at least one attached source image.", source);

  const templateIntent = result.requests.find(r => r.kind === "teaser" && r.template_ref.mode !== "none");
  let template: SourceTemplateRow | null = null, templateConfig: PreviewTemplateConfigV1 | null = null;
  let missingTemplate = false;
  if (templateIntent) {
    const rows = templateIntent.template_ref.mode === "id" ? await args.lookup.loadTemplates(args.creatorId, [templateIntent.template_ref.value!]) : await args.lookup.listTemplatesByName(args.creatorId, templateIntent.template_ref.value!);
    if (!Array.isArray(rows) || !rows.every(validTemplateRow)) return { kind: "limitation", code: "source_scope" };
    const owned = templateIntent.template_ref.mode === "id" ? ownRows(rows, args.creatorId, [templateIntent.template_ref.value!]) : ownRows(rows, args.creatorId, rows.map(x => x.id));
    if (!owned || (templateIntent.template_ref.mode === "id" && owned[0]?.id !== templateIntent.template_ref.value) || (templateIntent.template_ref.mode === "named" && owned.some(row => row.name !== templateIntent.template_ref.value))) missingTemplate = true;
    else if (owned.length !== 1) return clarificationPreview(args, "missing_template", "template", "Choose one saved template with that name.", source, templateIntent.destination);
    else {
      template = owned[0];
      try { templateConfig = parsePreviewTemplateConfig(template.config); } catch { return { kind: "limitation", code: "source_scope" }; }
    }
  } else if (result.requests.some(r => r.kind === "teaser")) missingTemplate = true;
  const readiness = await args.lookup.destinationReadiness(args.creatorId);
  const entitlement = await args.lookup.hasAutopostEntitlement(args.creatorId);
  if (!readiness || typeof readiness.get !== "function" || typeof entitlement !== "boolean") return { kind: "limitation", code: "source_scope" };
  if (result.requests.some(r => r.kind === "primary_draft") && !entitlement) return { kind: "limitation", code: "entitlement_required" };
  const teaserOnly = result.requests.every(r => r.kind === "teaser" || r.kind === "followup");
  if (teaserOnly) return { kind: "limitation", code: "contract_gap" };

  const make = args.idFactory ?? idDefault, now = (args.now ?? (() => new Date().toISOString()))();
  const planId = make("plan"), steps: PlanStep[] = [], unresolved: UnresolvedRequest[] = [], clarifications: Clarification[] = [], groups = [] as PlanSnapshot["distribution_groups"];
  const primary = result.requests.find(r => r.kind === "primary_draft");
  if (primary?.enabled === false && result.requests.some(r => r.kind === "teaser" || r.kind === "followup")) return clarificationPreview(args, "unsupported_action", "enabled", "The primary source is shared by the requested teasers and follow-ups. Choose whether those dependent actions should also be disabled.", source, "patreon");
  const sourceStepId = make("step");
  const primaryTitle = primary ? titleCopy(primary, post) : { mode: "literal", value: post?.effectiveTitle ?? "Source preparation", origin: "compiler" } as CopyValue;
  if (primary && !primaryTitle) return unresolvedResult(args, source, primary.title_mode === "part_variable" ? "unknown_part" : "literal_or_template", "title", primary.title_mode === "part_variable" ? "What verified part label should replace the title placeholder?" : "What exact Patreon title should this draft use?", "prepare_post_draft", "patreon");
  const primaryEnabled = primary?.enabled ?? true;
  steps.push({ step_id: sourceStepId, depends_on: [], enabled: primaryEnabled, title: primaryTitle!, note: null, time: null, capability: "prepare_post_draft", intended_destination: "patreon", source_media_ids: primary && source.kind === "staged_media" ? source.selected_media_ids : [], target_post_id: primary && primary.delivery_intent === "prepare_for_creator_handoff" && post ? post.id : null });

  const teaserIntents = result.requests.filter(r => r.kind === "teaser");
  const needPreview = teaserIntents.length > 0 && !!template && !!templateConfig;
  let previewId: string | null = null;
  if (needPreview) { previewId = make("step"); steps.push({ step_id: previewId, depends_on: [sourceStepId], enabled: true, title: { mode: "literal", value: "Prepare preview", origin: "compiler" }, note: null, time: null, capability: "prepare_preview", source_step_id: sourceStepId, template_id: template!.id, template_config_snapshot: templateConfig! }); }
  const groupId = make("group"), distIds: string[] = [], handoffs = new Map<Destination, string>();
  for (const intent of teaserIntents) {
    const dest = intent.destination;
    if (!dest) { unresolvedResultPush(args, source, intent, "unlinked_destination", "destination", "Which destination should receive this teaser?", "prepare_distribution", null, unresolved, clarifications); continue; }
    const copy = titleCopy(intent, post);
    if (!copy) { unresolvedResultPush(args, source, intent, intent.title_mode === "part_variable" ? "unknown_part" : "literal_or_template", "title", intent.title_mode === "part_variable" ? "What verified part label should replace the title placeholder?" : "What exact teaser title should this variant use?", "prepare_distribution", dest, unresolved, clarifications); continue; }
    if (missingTemplate || !previewId) { unresolvedResultPush(args, source, intent, "missing_template", "template", "Choose a saved Previewizer template before preparing this teaser.", "prepare_distribution", dest, unresolved, clarifications); continue; }
    const distId = make("step"), variantEnabled = intent.enabled ?? true, linked = readiness.get(dest) === "available";
    steps.push({ step_id: distId, depends_on: [sourceStepId, previewId], enabled: variantEnabled, title: copy, note: null, time: null, capability: "prepare_distribution", source_step_id: sourceStepId, preview_step_id: previewId, distribution_group_id: groupId, destination: dest, copy_title: copy });
    distIds.push(distId);
    const handoffId = make("step");
    steps.push({ step_id: handoffId, depends_on: [distId], enabled: linked && variantEnabled, title: copy, note: null, time: null, capability: "publish_handoff", distribution_step_id: distId, destination: dest });
    handoffs.set(dest, handoffId);
    if (!linked) addClarification(args, unresolved, clarifications, "unlinked_destination", "destination", `Connect ${dest} before enabling this handoff.`, handoffId, "publish_handoff", dest);
  }
  if (distIds.length) groups.push({ group_id: groupId, source_step_id: sourceStepId, preview_step_id: previewId, destination_step_ids: distIds });

  const primaryDistribution = primary?.delivery_intent === "prepare_for_creator_handoff" && post;
  if (primaryDistribution) {
    const distId = make("step"), handoffId = make("step"), copy = primaryTitle!;
    const patreonEnabled = primary!.enabled ?? true;
    steps.push({ step_id: distId, depends_on: [sourceStepId], enabled: patreonEnabled, title: copy, note: null, time: null, capability: "prepare_distribution", source_step_id: sourceStepId, preview_step_id: null, distribution_group_id: groupId, destination: "patreon", copy_title: copy });
    const patreonLinked = readiness.get("patreon") === "available";
    steps.push({ step_id: handoffId, depends_on: [distId], enabled: patreonLinked && patreonEnabled, title: copy, note: null, time: null, capability: "publish_handoff", distribution_step_id: distId, destination: "patreon" });
    distIds.unshift(distId);
    const ix = groups.findIndex(g => g.group_id === groupId);
    const group = { group_id: groupId, source_step_id: sourceStepId, preview_step_id: previewId, destination_step_ids: distIds };
    if (ix >= 0) groups[ix] = group; else groups.push({ ...group, preview_step_id: null });
    handoffs.set("patreon", handoffId);
    if (!patreonLinked) addClarification(args, unresolved, clarifications, "unlinked_destination", "destination", "Connect Patreon before enabling this handoff.", handoffId, "publish_handoff", "patreon");
  }

  for (const follow of result.requests.filter(r => r.kind === "followup")) {
    const destination = follow.target_destination ?? follow.destination;
    if (!destination || !follow.social_action) { unresolvedResultPush(args, source, follow, !follow.social_action ? "unknown_engagement_action" : "unknown_engagement_target", !follow.social_action ? "social_action" : "target_destination", !follow.social_action ? "Choose reply block or engagement check." : "Choose the destination this follow-up should target.", follow.social_action ?? null, destination, unresolved, clarifications); continue; }
    const anchor = handoffs.get(destination);
    const zone = args.requestClock.timezone;
    if (!anchor || !follow.day_offset || !follow.local_time || !zone || (follow.timezone !== null && follow.timezone !== zone)) { unresolvedResultPush(args, source, follow, follow.timezone && follow.timezone !== zone ? "unknown_time" : "unknown_engagement_target", follow.timezone && follow.timezone !== zone ? "timezone" : "followup_anchor", follow.timezone && follow.timezone !== zone ? "Use the creator's frozen timezone for this follow-up." : "Specify both publication-relative follow-ups after a same-destination handoff is available.", follow.social_action, destination, unresolved, clarifications); continue; }
    const anchorEnabled = steps.find(s => s.step_id === anchor)?.enabled ?? false;
    if (follow.enabled === true && !anchorEnabled) return clarificationPreview(args, "unsupported_action", "enabled", "This follow-up cannot be enabled while its handoff is disabled. Choose whether to enable the dependent handoff.", source, destination);
    const stepId = make("step"), enabled = anchorEnabled && (follow.enabled ?? true);
    steps.push({ step_id: stepId, depends_on: [anchor], enabled, title: { mode: "literal", value: follow.social_action === "reply_block" ? "Reply block" : "Engagement check", origin: "compiler" }, note: null, time: { kind: "after_publication_calendar_days", anchor_step_id: anchor, day_offset: follow.day_offset, timezone: zone, local_time: follow.local_time }, capability: follow.social_action, publication_step_id: anchor, destination, target_post_id: post?.id ?? null });
  }
  for (const intent of result.requests.filter(r => r.time_kind !== "none" && r.kind !== "followup")) {
    const resolved = await (args.calendarResolver ?? createCalendarResolver()).resolve({ request: intent, requestClock: args.requestClock, previousConfirmedTime: args.previousConfirmedTime });
    if (!resolved) return clarificationPreview(args, "unknown_time", "time", "Specify a valid local date, time, and creator timezone.", source, intent.destination);
    const step = intent.kind === "primary_draft"
      ? steps.find(s => s.capability === "prepare_post_draft")
      : steps.find(s => s.capability === "prepare_distribution" && (!intent.destination || s.destination === intent.destination));
    if (step) (step as PlanStep).time = resolved;
  }
  if (!steps.length) return clarificationPreview(args, "missing_post", "request", "This request needs a source post before it can be planned.", source);
  const priority = (step: PlanStep): number => step.capability === "prepare_post_draft" ? 0 : step.capability === "prepare_distribution" && step.destination === "patreon" ? 1 : step.capability === "publish_handoff" && step.destination === "patreon" ? 2 : step.capability === "prepare_preview" ? 3 : step.capability === "prepare_distribution" ? 4 : step.capability === "publish_handoff" ? 5 : 6;
  steps.sort((a, b) => priority(a) - priority(b));
  const snapshot: PlanSnapshot = { schema_version: 1, plan_id: planId, creator_id: args.creatorId, revision: 0, review: "proposed", source, steps, distribution_groups: groups, unresolved_requests: unresolved, clarifications, requested_text_quote: args.latestRequest.slice(0, 2000), created_at: now, updated_at: now };
  return validateFreshSnapshot(snapshot, args.creatorId, args.sourceRevision, args.lookup);
}

/** Applies an accepted sparse CP-06c patch to one proposed snapshot and revalidates fresh authority. */
export async function compilePlanRevision(args: CompilePlanRevisionArgs): Promise<CompileRevisionResult> {
  try { return await compilePlanRevisionFromTrustedInput(args); }
  catch { return { kind: "limitation", code: "source_scope" }; }
}

async function compilePlanRevisionFromTrustedInput(args: CompilePlanRevisionArgs): Promise<CompileRevisionResult> {
  if (!args.current || args.current.creator_id !== args.authenticatedCreatorId) return { kind: "conflict", code: "creator_or_plan_scope_mismatch" };
  const merged = mergePlanRevision(args.current, args.handleMap, args.interpreted, args.latestRequest, args.expectedRevision);
  if (merged.kind === "conflict" || merged.kind === "clarification" || merged.kind === "unchanged") return merged;
  if (args.current.creator_id !== args.authenticatedCreatorId || merged.planId !== args.current.plan_id || merged.baseRevision !== args.current.revision) return { kind: "conflict", code: "creator_or_plan_scope_mismatch" };
  if (args.current.review !== "proposed") return { kind: "limitation", code: "unsupported_revision" };
  if (!safeId(args.sourceRevision)) return { kind: "limitation", code: "source_scope" };
  const candidate = structuredClone(args.current);
  const make = args.idFactory ?? idDefault;
  const resolver = args.calendarResolver ?? createCalendarResolver();
  for (const operation of merged.operations) {
    if (operation.kind === "remove") {
      const index = candidate.steps.findIndex(step => step.step_id === operation.stepId);
      if (index < 0) return { kind: "conflict", code: "missing_step" };
      candidate.steps.splice(index, 1);
      continue;
    }
    if (operation.kind === "add") {
      const added = await appendRevisionStep(candidate, operation, args, make, resolver);
      if (added.kind !== "ok") return added.result;
      continue;
    }
    const step = candidate.steps.find(value => value.step_id === operation.stepId);
    if (!step) return { kind: "conflict", code: "missing_step" };
    for (const change of operation.changes) {
      if (!sameValue(revisionCurrentValue(change.field, step), change.expected)) return { kind: "conflict", code: "expected_value_changed" };
      const applied = await applyRevisionField(candidate, step, change, args, resolver);
      if (applied.kind !== "ok") return applied.result;
    }
  }
  candidate.revision = args.current.revision + 1;
  candidate.updated_at = (args.now ?? (() => new Date().toISOString()))();
  const shape = validatePlanShape(candidate);
  if (!shape.ok) return { kind: "limitation", code: "validation_failed" };
  const trusted = await loadFreshTrustedContext(candidate, args.authenticatedCreatorId, args.sourceRevision, args.lookup);
  if (trusted.kind === "error") return { kind: "limitation", code: trusted.code };
  const validated = validatePlanWithContext(candidate, trusted.context);
  return validated.ok ? { kind: "plan", snapshot: validated.value } : { kind: "limitation", code: "validation_failed" };
}

type RevisionApplyResult = { kind: "ok" } | { kind: "return"; result: CompileRevisionResult };
function sameValue(a: unknown, b: unknown): boolean {
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : objectRecord(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function revisionCurrentValue(field: RevisionFieldChange["field"], step: PlanStep): unknown {
  if (field === "title") return step.capability === "prepare_distribution" ? step.copy_title : step.title;
  if (field === "time") return step.time;
  if (field === "template") return step.capability === "prepare_preview" ? step.template_id : null;
  if (field === "enabled") return step.enabled;
  return null;
}
async function confirmedTimeForTarget(args: CompilePlanRevisionArgs, step: PlanStep): Promise<Extract<TimeSpec, { kind: "absolute" }> | null> {
  if (step.time?.kind !== "absolute") return null;
  const evidence = args.confirmedTimes?.get(step.step_id);
  if (!evidence || Object.keys(evidence).sort().join(",") !== "creatorId,planId,revision,stepId,time" || evidence.creatorId !== args.authenticatedCreatorId || evidence.planId !== args.current.plan_id || evidence.revision !== args.current.revision || evidence.stepId !== step.step_id || !sameValue(evidence.time, step.time)) return null;
  return evidence.time;
}
async function applyRevisionField(candidate: PlanSnapshot, step: PlanStep, change: RevisionFieldChange, args: CompilePlanRevisionArgs, resolver: CalendarResolver): Promise<RevisionApplyResult> {
  const { field, intent } = change;
  if (field === "enabled") {
    const desired = intent.enabled;
    if (desired === null) return { kind: "return", result: { kind: "clarification", code: "missing_evidence", question: "Choose whether this step should be enabled." } };
    const activeChildren = candidate.steps.filter(child => child.enabled && child.depends_on.includes(step.step_id));
    if (!desired && activeChildren.length) return { kind: "return", result: { kind: "clarification", code: "dependent_repair_required", question: "Disabling this step affects enabled dependent actions. Choose which dependent actions should also be disabled." } };
    if (desired && step.depends_on.some(id => !candidate.steps.find(parent => parent.step_id === id)?.enabled)) return { kind: "return", result: { kind: "clarification", code: "dependent_repair_required", question: "This step depends on a disabled action. Choose whether to enable its prerequisites." } };
    if (step.capability === "publish_handoff" && desired) {
      const freshReadiness = await args.lookup.destinationReadiness(args.authenticatedCreatorId);
      if (freshReadiness.get(step.destination) !== "available") return { kind: "return", result: { kind: "clarification", code: "unlinked_destination", question: "Connect " + step.destination + " before enabling this handoff." } };
    }
    step.enabled = desired;
    return { kind: "ok" };
  }
  if (field === "title") {
    const post = candidate.source.post_id ? await loadOwnedPost(args.lookup, args.authenticatedCreatorId, candidate.source.post_id) : null;
    const copy = titleCopy(intent, post);
    if (!copy) return { kind: "return", result: { kind: "clarification", code: "unknown_part", question: "Provide a literal title or a part placeholder supported by the verified source metadata." } };
    step.title = copy;
    if (step.capability === "prepare_distribution") step.copy_title = copy;
    return { kind: "ok" };
  }
  if (field === "time") {
    if (step.capability !== "prepare_distribution" && step.capability !== "prepare_post_draft") return { kind: "return", result: { kind: "clarification", code: "unsupported_edit", question: "Only primary draft and teaser delivery dates can be changed in this compiler revision." } };
    if (!args.requestClock?.receivedAtUtc || !args.frozenCreatorTimezone || args.requestClock.timezone !== args.frozenCreatorTimezone) return { kind: "return", result: { kind: "clarification", code: "unknown_time", question: "A valid request clock and the creator's frozen timezone are required to change this date." } };
    const previous = await confirmedTimeForTarget(args, step);
    if (intent.local_time === null && !previous) return { kind: "return", result: { kind: "clarification", code: "unknown_time", question: "Confirm this step's existing local time before moving it to another date." } };
    const resolved = await resolver.resolve({ request: intent, requestClock: { receivedAtUtc: args.requestClock.receivedAtUtc, timezone: args.frozenCreatorTimezone }, previousConfirmedTime: previous ?? undefined });
    if (!resolved) return { kind: "return", result: { kind: "clarification", code: "unknown_time", question: "Specify a valid date and time in the creator's frozen timezone." } };
    step.time = resolved;
    return { kind: "ok" };
  }
  if (field === "template") {
    if (step.capability !== "prepare_preview" || intent.template_ref.mode !== "id" || !intent.template_ref.value) return { kind: "return", result: { kind: "clarification", code: "missing_evidence", question: "Choose one owned saved template by ID." } };
    if (candidate.steps.some(child => child.capability === "prepare_distribution" && child.preview_step_id === step.step_id)) return { kind: "return", result: { kind: "clarification", code: "dependent_repair_required", question: "Changing this preview template affects existing teaser variants. Specify how those variants should be repaired." } };
    const template = await loadOwnedTemplate(args.lookup, args.authenticatedCreatorId, intent.template_ref.value);
    if (!template) return { kind: "return", result: { kind: "clarification", code: "missing_template", question: "Choose a saved template owned by this creator." } };
    try {
      step.template_id = template.id;
      step.template_config_snapshot = parsePreviewTemplateConfig(template.config);
    } catch { return { kind: "return", result: { kind: "clarification", code: "missing_template", question: "Choose a valid saved Previewizer template." } }; }
    return { kind: "ok" };
  }
  return { kind: "return", result: { kind: "clarification", code: "dependent_repair_required", question: "This field change needs an explicit dependent repair plan." } };
}

async function appendRevisionStep(snapshot: PlanSnapshot, operation: Extract<RevisionOperation, { kind: "add" }>, args: CompilePlanRevisionArgs, make: NonNullable<CompilePlanRevisionArgs["idFactory"]>, resolver: CalendarResolver): Promise<{ kind: "ok" } | { kind: "error"; result: CompileRevisionResult }> {
  const intent = operation.intent;
  if (intent.kind === "primary_draft") return { kind: "error", result: { kind: "limitation", code: "contract_gap" } };
  if (intent.source_ref.mode === "post_id" && (snapshot.source.kind !== "existing_post" || intent.source_ref.id !== snapshot.source.post_id) || intent.source_ref.mode === "media_id" && !snapshot.source.selected_media_ids.includes(intent.source_ref.id ?? "")) return { kind: "error", result: { kind: "limitation", code: "source_scope" } };
  if (intent.kind === "followup") {
    const destination = intent.target_destination ?? intent.destination;
    if (intent.time_kind !== "publication_calendar_day" || !destination || !intent.social_action || !intent.day_offset || !intent.local_time || !args.frozenCreatorTimezone || (intent.timezone !== null && intent.timezone !== args.frozenCreatorTimezone)) return { kind: "error", result: { kind: "clarification", code: "missing_evidence", question: "Choose an action, destination, publication day, local time, and use the creator's frozen timezone." } };
    const anchors = snapshot.steps.filter((step): step is Extract<PlanStep, { capability: "publish_handoff" }> => step.capability === "publish_handoff" && step.destination === destination);
    if (anchors.length !== 1) return { kind: "error", result: { kind: "clarification", code: "ambiguous_target", question: "A follow-up needs one existing same-destination handoff." } };
    const anchor = anchors[0]!;
    if (!anchor.enabled && intent.enabled !== false) return { kind: "error", result: { kind: "clarification", code: "dependent_repair_required", question: "Enable the existing handoff before adding an enabled follow-up." } };
    const step: PlanStep = {
      step_id: make("step"), depends_on: [anchor.step_id], enabled: anchor.enabled && (intent.enabled ?? true),
      title: { mode: "literal", value: intent.social_action === "reply_block" ? "Reply block" : "Engagement check", origin: "compiler" },
      note: null, time: { kind: "after_publication_calendar_days", anchor_step_id: anchor.step_id, day_offset: intent.day_offset, timezone: args.frozenCreatorTimezone, local_time: intent.local_time },
      capability: intent.social_action, publication_step_id: anchor.step_id, destination, target_post_id: snapshot.source.post_id
    };
    snapshot.steps.push(step);
    return { kind: "ok" };
  }
  if (!intent.destination || (intent.destination !== "x" && intent.destination !== "deviantart")) return { kind: "error", result: { kind: "clarification", code: "missing_evidence", question: "Choose X or DeviantArt for the new teaser variant." } };
  if (intent.delivery_intent !== "prepare_for_creator_handoff") return { kind: "error", result: { kind: "clarification", code: "unsupported_edit", question: "A new teaser variant must explicitly request creator handoff preparation." } };
  const sourcePost = snapshot.source.post_id ? await loadOwnedPost(args.lookup, args.authenticatedCreatorId, snapshot.source.post_id) : null;
  const copy = titleCopy(intent, sourcePost);
  if (!copy) return { kind: "error", result: { kind: "clarification", code: "missing_evidence", question: "Provide a literal teaser title or a verified part placeholder." } };
  if (intent.template_ref.mode !== "id" || !intent.template_ref.value) return { kind: "error", result: { kind: "clarification", code: "missing_evidence", question: "Choose the saved template used by the existing preview." } };
  const template = await loadOwnedTemplate(args.lookup, args.authenticatedCreatorId, intent.template_ref.value);
  if (!template) return { kind: "error", result: { kind: "clarification", code: "missing_template", question: "Choose an owned saved template used by the existing preview." } };
  const eligibleGroups = snapshot.distribution_groups.filter(group => !!group.preview_step_id && snapshot.steps.some(step => step.capability === "prepare_preview" && step.step_id === group.preview_step_id && step.source_step_id === group.source_step_id && step.template_id === template.id));
  if (eligibleGroups.length !== 1) return { kind: "error", result: { kind: "clarification", code: "ambiguous_target", question: "The new teaser needs one existing source group and preview using that saved template." } };
  const group = eligibleGroups[0]!;
  if (snapshot.steps.some(step => step.capability === "prepare_distribution" && step.distribution_group_id === group.group_id && step.destination === intent.destination)) return { kind: "error", result: { kind: "conflict", code: "duplicate_delivery" } };
  const sourceStep = snapshot.steps.find(step => step.step_id === group.source_step_id && step.capability === "prepare_post_draft");
  const preview = snapshot.steps.find(step => step.step_id === group.preview_step_id && step.capability === "prepare_preview");
  if (!sourceStep || !preview || !sourceStep.enabled || !preview.enabled) return { kind: "error", result: { kind: "clarification", code: "dependent_repair_required", question: "Enable the existing source and preview before adding this teaser." } };
  let absoluteTime: Extract<TimeSpec, { kind: "absolute" }> | null = null;
  if (intent.time_kind !== "none") {
    absoluteTime = await resolver.resolve({ request: intent, requestClock: { receivedAtUtc: args.requestClock.receivedAtUtc, timezone: args.frozenCreatorTimezone } });
    if (!absoluteTime) return { kind: "error", result: { kind: "clarification", code: "unknown_time", question: "Specify a valid date and time in the creator's frozen timezone." } };
  }
  const readiness = await args.lookup.destinationReadiness(args.authenticatedCreatorId);
  if (!readiness || typeof readiness.get !== "function") return { kind: "error", result: { kind: "limitation", code: "source_scope" } };
  const variantEnabled = intent.enabled ?? true;
  if (readiness.get(intent.destination) !== "available") return { kind: "error", result: { kind: "clarification", code: "unlinked_destination", question: "Connect " + intent.destination + " before adding this teaser variant." } };
  const distributionId = make("step"), handoffId = make("step");
  const distribution: PlanStep = {
    step_id: distributionId, depends_on: [sourceStep.step_id, preview.step_id], enabled: variantEnabled, title: copy, note: null, time: absoluteTime,
    capability: "prepare_distribution", source_step_id: sourceStep.step_id, preview_step_id: preview.step_id, distribution_group_id: group.group_id,
    destination: intent.destination, copy_title: copy
  };
  const handoff: PlanStep = {
    step_id: handoffId, depends_on: [distributionId], enabled: variantEnabled && readiness.get(intent.destination) === "available",
    title: copy, note: null, time: null, capability: "publish_handoff", distribution_step_id: distributionId, destination: intent.destination
  };
  snapshot.steps.push(distribution, handoff);
  group.destination_step_ids.push(distributionId);
  return { kind: "ok" };
}

async function loadOwnedPost(lookup: TrustedLookup, creatorId: string, id: string): Promise<SourcePostRow | null> {
  const rows = await lookup.loadPosts(creatorId, [id]);
  if (!Array.isArray(rows) || !rows.every(validPostRow)) return null;
  return ownRows(rows, creatorId, [id])?.[0] ?? null;
}
async function loadOwnedTemplate(lookup: TrustedLookup, creatorId: string, id: string): Promise<SourceTemplateRow | null> {
  const rows = await lookup.loadTemplates(creatorId, [id]);
  if (!Array.isArray(rows) || !rows.every(validTemplateRow)) return null;
  return ownRows(rows, creatorId, [id])?.[0] ?? null;
}

type FreshContextResult = { kind: "context"; context: TrustedPlanContext } | { kind: "error"; code: "source_scope" | "entitlement_required" };
async function loadFreshTrustedContext(snapshot: PlanSnapshot, creatorId: string, sourceRevision: string, lookup: TrustedLookup): Promise<FreshContextResult> {
  if (snapshot.creator_id !== creatorId || !safeId(sourceRevision)) return { kind: "error", code: "source_scope" };
  const mediaIds = [...new Set(snapshot.source.selected_media_ids)];
  const loadedMedia = await lookup.loadMedia(creatorId, mediaIds);
  if (!Array.isArray(loadedMedia) || !loadedMedia.every(validMediaRow)) return { kind: "error", code: "source_scope" };
  const mediaRows = ownRows(loadedMedia, creatorId, mediaIds);
  if (!mediaRows || mediaRows.some(row => row.processingStatus !== "READY")) return { kind: "error", code: "source_scope" };
  const relations = await lookup.loadSourceRelations(creatorId, mediaIds);
  if (!relations || typeof relations.get !== "function") return { kind: "error", code: "source_scope" };
  const sourceMediaRelations = new Map<string, { post_ids: ReadonlySet<string>; creative_work_ids: ReadonlySet<string>; creative_series_member_ids: ReadonlySet<string> }>();
  const relatedPostIds = new Set<string>();
  for (const mediaRow of mediaRows) {
    const relation = relations.get(mediaRow.id);
    if (!relation || !(relation.postIds instanceof Set) || !(relation.creativeWorkIds instanceof Set) || !(relation.creativeSeriesMemberIds instanceof Set) || [...relation.postIds, ...relation.creativeWorkIds, ...relation.creativeSeriesMemberIds].some(id => !safeId(id))) return { kind: "error", code: "source_scope" };
    for (const id of [...relation.postIds, ...mediaRow.postIds, ...(mediaRow.primaryPostId ? [mediaRow.primaryPostId] : [])]) relatedPostIds.add(id);
    sourceMediaRelations.set(mediaRow.id, { post_ids: relation.postIds, creative_work_ids: relation.creativeWorkIds, creative_series_member_ids: relation.creativeSeriesMemberIds });
  }
  const requiredPostIds = new Set<string>(relatedPostIds);
  if (snapshot.source.post_id) requiredPostIds.add(snapshot.source.post_id);
  const targetPostIds = new Set<string>();
  for (const step of snapshot.steps) {
    if ((step.capability === "prepare_post_draft" || step.capability === "reply_block" || step.capability === "engagement_check") && step.target_post_id) {
      targetPostIds.add(step.target_post_id); requiredPostIds.add(step.target_post_id);
    }
  }
  const loadedPosts = requiredPostIds.size ? await lookup.loadPosts(creatorId, [...requiredPostIds]) : [];
  if (!Array.isArray(loadedPosts) || !loadedPosts.every(validPostRow)) return { kind: "error", code: "source_scope" };
  const postRows = requiredPostIds.size ? ownRows(loadedPosts, creatorId, [...requiredPostIds]) : [];
  if (!postRows) return { kind: "error", code: "source_scope" };

  const templateIds = [...new Set(snapshot.steps.filter((step): step is Extract<PlanStep, { capability: "prepare_preview" }> => step.capability === "prepare_preview").map(step => step.template_id))];
  const loadedTemplates = templateIds.length ? await lookup.loadTemplates(creatorId, templateIds) : [];
  if (!Array.isArray(loadedTemplates) || !loadedTemplates.every(validTemplateRow)) return { kind: "error", code: "source_scope" };
  const templates = templateIds.length ? ownRows(loadedTemplates, creatorId, templateIds) : [];
  if (!templates) return { kind: "error", code: "source_scope" };
  const currentTemplateConfigs = new Map<string, PreviewTemplateConfigV1>();
  for (const templateRow of templates) {
    try { currentTemplateConfigs.set(templateRow.id, parsePreviewTemplateConfig(templateRow.config)); }
    catch { return { kind: "error", code: "source_scope" }; }
  }

  const readiness = await lookup.destinationReadiness(creatorId);
  if (!readiness || typeof readiness.get !== "function" || [...readiness].some(([destination, status]) => !["patreon", "x", "deviantart", "bluesky"].includes(destination) || !["available", "needs_credential", "needs_extension"].includes(status))) return { kind: "error", code: "source_scope" };
  const hasAutopostEntitlement = await lookup.hasAutopostEntitlement(creatorId);
  if (typeof hasAutopostEntitlement !== "boolean") return { kind: "error", code: "source_scope" };
  if (!hasAutopostEntitlement) return { kind: "error", code: "entitlement_required" };

  const ownedCreativeWorkIds = new Set([...sourceMediaRelations.values()].flatMap(value => [...value.creative_work_ids]));
  const ownedCreativeSeriesMemberIds = new Set([...sourceMediaRelations.values()].flatMap(value => [...value.creative_series_member_ids]));
  for (const row of postRows) {
    if (row.creativeWorkId) ownedCreativeWorkIds.add(row.creativeWorkId);
    if (row.seriesMemberId) ownedCreativeSeriesMemberIds.add(row.seriesMemberId);
  }
  const verifiedSeriesMemberPartLabels = new Map<string, string>();
  for (const row of postRows) if (row.seriesMemberId && row.verifiedPartLabel) verifiedSeriesMemberPartLabels.set(row.seriesMemberId, row.verifiedPartLabel);
  const context: TrustedPlanContext = {
    authenticatedCreatorId: creatorId, ownedMediaIds: new Set(mediaRows.map(row => row.id)), sourceMediaRelations,
    ownedPostIds: new Set(postRows.map(row => row.id)), ownedTemplateIds: new Set(templates.map(row => row.id)),
    ownedCreativeWorkIds, ownedCreativeSeriesMemberIds, verifiedSeriesMemberPartLabels, currentTemplateConfigs,
    connectedDestinations: new Set([...readiness].filter(([, status]) => status === "available").map(([destination]) => destination)),
    hasAutopostEntitlement, currentSourceRevision: sourceRevision, ownedTargetPostIds: new Set([...targetPostIds, ...(snapshot.source.post_id ? [snapshot.source.post_id] : [])])
  };
  return { kind: "context", context };
}

async function validateFreshSnapshot(snapshot: PlanSnapshot, creatorId: string, sourceRevision: string, lookup: TrustedLookup): Promise<CompileResult> {
  const shape = validatePlanShape(snapshot);
  if (!shape.ok) return { kind: "limitation", code: "validation_failed" };
  const trusted = await loadFreshTrustedContext(snapshot, creatorId, sourceRevision, lookup);
  if (trusted.kind === "error") return { kind: "limitation", code: trusted.code };
  const validated = validatePlanWithContext(snapshot, trusted.context);
  return validated.ok ? { kind: "plan", snapshot: validated.value } : { kind: "limitation", code: "validation_failed" };
}

function pHas(media: SourceMediaRow, postId: string, relations: ReadonlyMap<string, { postIds: ReadonlySet<string> }>) { return media.primaryPostId === postId || media.postIds.includes(postId) || relations.get(media.id)?.postIds.has(postId); }
function addClarification(args: CompileNewPlanArgs, unresolved: UnresolvedRequest[], clarifications: Clarification[], reason: Clarification["reason"], field: string, question: string, affected: string, capability: UnresolvedRequest["intended_capability"], destination: Destination | null) {
  const make = args.idFactory ?? idDefault, requestId = make("request"), slotId = make("slot");
  unresolved.push({ request_id: requestId, requested_text_quote: args.latestRequest.slice(0, 2000), intended_capability: capability, intended_destination: destination, blocking_slot_ids: [slotId] });
  clarifications.push({ slot_id: slotId, field, question, affected_node_ids: [requestId, affected], blocking: true, reason });
}
function unresolvedResultPush(args: CompileNewPlanArgs, _source: SourceRef, intent: RequestIntent, reason: Clarification["reason"], field: string, question: string, capability: UnresolvedRequest["intended_capability"], destination: Destination | null, unresolved: UnresolvedRequest[], clarifications: Clarification[]) {
  const make = args.idFactory ?? idDefault, requestId = make("request"), slotId = make("slot");
  unresolved.push({ request_id: requestId, requested_text_quote: intent.request_quote.slice(0, 2000), intended_capability: capability, intended_destination: destination, blocking_slot_ids: [slotId] });
  clarifications.push({ slot_id: slotId, field, question, affected_node_ids: [requestId], blocking: true, reason });
}
function unresolvedResult(args: CompileNewPlanArgs, source: SourceRef, reason: Clarification["reason"], field: string, question: string, capability: UnresolvedRequest["intended_capability"], destination: Destination | null): CompileResult {
  const make = args.idFactory ?? idDefault, requestId = make("request"), slotId = make("slot");
  return { kind: "clarification_preview", source, unresolved: [{ request_id: requestId, requested_text_quote: args.latestRequest.slice(0, 2000), intended_capability: capability, intended_destination: destination, blocking_slot_ids: [slotId] }], slots: [{ slot_id: slotId, field, question, affected_node_ids: [requestId], blocking: true, reason }] };
}
