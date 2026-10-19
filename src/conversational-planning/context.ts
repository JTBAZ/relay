import { createHash } from "node:crypto";
import { type Prisma, type PrismaClient } from "@prisma/client";
import { parsePreviewTemplateConfig } from "../distribution/preview-template-config.js";
import { projectPlanningContext, type PlanningModelContext } from "./intent.js";
import { createPlanningLookup, type PlanningLookup, type PlanningLookupReadDb } from "./lookup.js";
import { validatePlanShape, validatePlanWithContext, type Destination, type PlanSnapshot, type PlanStep, type TrustedPlanContext } from "./contract.js";
import type { ContextLoad, ContextLoader } from "./persistence.js";
import type { RevisionHandleBinding } from "./revision-merge.js";
import type { SourceMediaRow, SourcePostRow } from "./compiler.js";

const MAX_REQUEST_MEDIA = 3;
const MAX_REQUEST_POSTS = 4;
const MAX_CANDIDATE_POSTS = 128;
const MAX_TARGET_POSTS = 32;
const MAX_PLAN_TEMPLATES = 32;
const MAX_MODEL_TEMPLATES = 3;
const MAX_EDITABLE_NODES = 8;
const MAX_PLAN_STEPS = 32;
const MAX_CONTEXT_BYTES = 12 * 1024;
const DESTINATIONS: readonly Destination[] = ["patreon", "x", "deviantart", "bluesky"];
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const sorted = (values: Iterable<string>) => [...new Set(values)].sort(compare);
const validId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 160 && v.trim() === v;
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value) ?? "null";
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort(compare).map(key => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
};
const sha256 = (value: unknown) => createHash("sha256").update(canonical(value), "utf8").digest("hex");

type PlanningDb = Pick<PrismaClient,
  "mediaAsset" | "post" | "creatorPreviewTemplate" | "creatorPlanEntitlement" | "account" | "planSubscription" | "creatorPostingGoal" | "creatorBlueskyCredential" | "creatorProfile">;
export type PlanningContextReadDb = PlanningLookupReadDb;
type SourceState = {
  media: SourceMediaRow[];
  posts: SourcePostRow[];
  sourcePostIds: string[];
  targetPostIds: string[];
  sourceRelations: Map<string, { post_ids: ReadonlySet<string>; creative_work_ids: ReadonlySet<string>; creative_series_member_ids: ReadonlySet<string> }>;
  sourceRevision: string;
};
export type RequestContextInput = {
  authenticatedCreatorId: string;
  selectedMediaIds: readonly string[];
  selectedPostIds: readonly string[];
  snapshot?: PlanSnapshot | null;
  selectedTemplateIds?: readonly string[];
  targetHandleRefs?: readonly { handle: string }[];
  receivedAtUtc?: string;
};
export type EditDescriptor = Readonly<{
  handle: string;
  capability: string;
  destination: Destination | null;
  title: string;
  enabled: boolean;
}>;
export type PlanningEditDescriptorResult =
  | { kind: "ok"; descriptors: readonly EditDescriptor[] }
  | { kind: "conflict"; code: "foreign_plan" | "invalid_snapshot" };
export type RequestContextResult =
  | { kind: "ok"; modelContext: PlanningModelContext; sourceFingerprint: string; requestClock: { receivedAtUtc: string; timezone: string | null }; frozenCreatorTimezone: string | null; handleMap: ReadonlyMap<string, RevisionHandleBinding>; editDescriptors: readonly EditDescriptor[] }
  | { kind: "clarification"; code: "narrow_selection" | "ambiguous_source" | "narrow_edit_scope"; question: string }
  | { kind: "conflict"; code: "invalid_snapshot" | "foreign_plan" | "invalid_handle" | "stale_snapshot" }
  | { kind: "unavailable"; code: "source_scope" | "context_too_large" };

class ContextFailure extends Error {
  constructor(readonly code: "source_scope" | "narrow_selection" | "ambiguous_source" | "context_too_large") { super(code); }
}
function adaptLookupFailure(error: unknown): ContextFailure {
  if (error instanceof ContextFailure) return error;
  const message = error instanceof Error ? error.message : "";
  return new ContextFailure(/too many|exceeds safe bounds|exceeds bound/i.test(message) ? "narrow_selection" : "source_scope");
}

const postFingerprintSelect = {
  id: true, creatorId: true, publishState: true,
  versions: { orderBy: { versionSeq: "desc" as const }, take: 1, select: { versionSeq: true, upstreamRevision: true, title: true, mediaIds: true } },
  presentation: { select: { creatorId: true, titleMode: true, relayTitle: true } },
  creativeWorkMember: { select: { creatorId: true, creativeWorkId: true, creativeWork: { select: {
    id: true, creatorId: true, title: true, titleMode: true,
    seriesMember: { select: { id: true, creatorId: true, partLabel: true, creativeSeries: { select: { id: true, creatorId: true, title: true } } } }
  } } } }
} satisfies Prisma.PostSelect;

export type PlanningContextSource = Readonly<{
  lookup: PlanningLookup["lookup"];
  loadContext: ContextLoader;
  buildRequestContext(input: RequestContextInput): Promise<RequestContextResult>;
}>;

/** Builds the production trusted context and prompt projection from fresh creator-owned rows. */
export function createPlanningContextSource(prisma: PlanningContextReadDb, options: { now?: () => Date } = {}): PlanningContextSource {
  const db: PlanningDb = prisma;
  const trustedLookup = createPlanningLookup(prisma);

  const loadSourceState = async (creatorId: string, requestedMediaIds: readonly string[], requestedPostIds: readonly string[], targetIds: readonly string[] = []): Promise<SourceState> => {
    if (!validId(creatorId)) throw new ContextFailure("source_scope");
    const mediaIds = sorted(requestedMediaIds);
    const explicitPosts = sorted(requestedPostIds);
    const targets = sorted(targetIds);
    if (mediaIds.length > MAX_REQUEST_MEDIA || explicitPosts.length > MAX_REQUEST_POSTS || targets.length > MAX_TARGET_POSTS || [...mediaIds, ...explicitPosts, ...targets].some(id => !validId(id))) throw new ContextFailure("narrow_selection");
    let media: SourceMediaRow[];
    let sourceRelations = new Map<string, { post_ids: ReadonlySet<string>; creative_work_ids: ReadonlySet<string>; creative_series_member_ids: ReadonlySet<string> }>();
    try {
      media = await trustedLookup.lookup.loadMedia(creatorId, mediaIds);
      if (media.length !== mediaIds.length || media.some(row => row.creatorId !== creatorId)) throw new ContextFailure("source_scope");
      if (mediaIds.length) {
        const relations = await trustedLookup.lookup.loadSourceRelations(creatorId, mediaIds);
        for (const mediaId of mediaIds) {
          const relation = relations.get(mediaId);
          if (!relation) throw new ContextFailure("source_scope");
          sourceRelations.set(mediaId, { post_ids: relation.postIds, creative_work_ids: relation.creativeWorkIds, creative_series_member_ids: relation.creativeSeriesMemberIds });
        }
      }
    } catch (error) { throw adaptLookupFailure(error); }
    const sourcePostIds = sorted([...explicitPosts, ...[...sourceRelations.values()].flatMap(r => [...r.post_ids])]);
    if (sourcePostIds.length > MAX_CANDIDATE_POSTS) throw new ContextFailure("narrow_selection");
    const targetPostIds = targets.filter(id => !sourcePostIds.includes(id));
    const postReadIds = [...sourcePostIds, ...targetPostIds];
    const posts: SourcePostRow[] = [];
    try {
      for (let i = 0; i < postReadIds.length; i += 32) {
        const chunk = postReadIds.slice(i, i + 32);
        const rows = await trustedLookup.lookup.loadPosts(creatorId, chunk);
        if (rows.length !== chunk.length || rows.some(row => row.creatorId !== creatorId)) throw new ContextFailure("source_scope");
        posts.push(...rows);
      }
    } catch (error) { throw adaptLookupFailure(error); }
    const sourcePosts = posts.filter(post => sourcePostIds.includes(post.id));
    const postRows = postReadIds.length ? await db.post.findMany({ where: { creatorId, id: { in: postReadIds } }, select: postFingerprintSelect }) : [];
    if (postRows.length !== postReadIds.length || postRows.some(row => row.creatorId !== creatorId)) throw new ContextFailure("source_scope");
    const actualPostMediaIds = sorted(posts.flatMap(post => post.mediaIds));
    const fingerprintMediaIds = sorted([...mediaIds, ...actualPostMediaIds]);
    if (fingerprintMediaIds.length > 32) throw new ContextFailure("narrow_selection");
    const mediaRows = fingerprintMediaIds.length
      ? await db.mediaAsset.findMany({ where: { creatorId, id: { in: fingerprintMediaIds } }, select: {
        id: true, creatorId: true, processingStatus: true, ingestOrigin: true, currentVersionSeq: true,
        currentUpstreamRevision: true, currentMimeType: true, currentRole: true, primaryPostId: true, postIds: true
      } })
      : [];
    if (mediaRows.length !== fingerprintMediaIds.length || mediaRows.some(row => row.creatorId !== creatorId)) throw new ContextFailure("source_scope");
    const relationFingerprint = [...sourceRelations.entries()].sort(([a], [b]) => compare(a, b)).map(([mediaId, relation]) => ({
      mediaId, postIds: sorted(relation.post_ids), creativeWorkIds: sorted(relation.creative_work_ids), seriesMemberIds: sorted(relation.creative_series_member_ids)
    }));
    const mediaById = new Map(mediaRows.map(row => [row.id, row]));
    const fingerprint = {
      v: 1,
      media: fingerprintMediaIds.map(id => {
        const row = mediaById.get(id);
        return row ? { id, processingStatus: row.processingStatus, ingestOrigin: row.ingestOrigin, versionSeq: row.currentVersionSeq, upstreamRevision: row.currentUpstreamRevision, mimeType: row.currentMimeType, role: row.currentRole, primaryPostId: row.primaryPostId, postIds: sorted(row.postIds) } : { id, missingCreatorOwnedMedia: true };
      }),
      posts: postRows.slice().sort((a, b) => compare(a.id, b.id)).map(row => {
        const version = row.versions[0];
        const member = row.creativeWorkMember?.creatorId === creatorId && row.creativeWorkMember.creativeWork.creatorId === creatorId ? row.creativeWorkMember : null;
        const work = member?.creativeWork;
        const series = work?.seriesMember?.creatorId === creatorId && work.seriesMember.creativeSeries.creatorId === creatorId ? work.seriesMember : null;
        const ownedMedia = new Set(posts.find(post => post.id === row.id)?.mediaIds ?? []);
        return { id: row.id, publishState: row.publishState, version: version ? { seq: version.versionSeq, upstreamRevision: version.upstreamRevision, title: version.title, mediaIds: sorted(version.mediaIds.filter(id => ownedMedia.has(id))) } : null,
          effectiveTitle: sourcePosts.find(post => post.id === row.id)?.effectiveTitle ?? row.id,
          presentation: row.presentation?.creatorId === creatorId ? { titleMode: row.presentation.titleMode, relayTitle: row.presentation.relayTitle } : null,
          work: work ? { id: work.id, title: work.title, titleMode: work.titleMode, seriesMember: series ? { id: series.id, partLabel: series.partLabel, seriesId: series.creativeSeries.id, seriesTitle: series.creativeSeries.title } : null } : null };
      }),
      relations: relationFingerprint
    };
    return { media, posts, sourcePostIds, targetPostIds, sourceRelations, sourceRevision: `src1_${sha256(fingerprint)}` };
  };

  const makeTrustedContext = async (creatorId: string, snapshot: PlanSnapshot, state: SourceState): Promise<TrustedPlanContext> => {
    const templateIds = sorted(snapshot.steps.filter((step): step is Extract<PlanStep, { capability: "prepare_preview" }> => step.capability === "prepare_preview").map(step => step.template_id));
    if (templateIds.length > MAX_PLAN_TEMPLATES) throw new ContextFailure("narrow_selection");
    const templates = templateIds.length ? await trustedLookup.lookup.loadTemplates(creatorId, templateIds) : [];
    if (templates.length !== templateIds.length || templates.some(template => template.creatorId !== creatorId)) throw new ContextFailure("source_scope");
    const currentTemplateConfigs = new Map<string, ReturnType<typeof parsePreviewTemplateConfig>>();
    for (const row of templates) {
      try { currentTemplateConfigs.set(row.id, parsePreviewTemplateConfig(row.config)); }
      catch { throw new ContextFailure("source_scope"); }
    }
    const readiness = await trustedLookup.lookup.destinationReadiness(creatorId);
    const hasAutopostEntitlement = await trustedLookup.lookup.hasAutopostEntitlement(creatorId);
    if (!readiness || typeof readiness.get !== "function" || typeof hasAutopostEntitlement !== "boolean") throw new ContextFailure("source_scope");
    const ownedCreativeWorkIds = new Set([...state.sourceRelations.values()].flatMap(row => [...row.creative_work_ids]));
    const ownedCreativeSeriesMemberIds = new Set([...state.sourceRelations.values()].flatMap(row => [...row.creative_series_member_ids]));
    const verifiedSeriesMemberPartLabels = new Map<string, string>();
    for (const post of state.posts) {
      if (post.creativeWorkId) ownedCreativeWorkIds.add(post.creativeWorkId);
      if (post.seriesMemberId) ownedCreativeSeriesMemberIds.add(post.seriesMemberId);
      if (post.seriesMemberId && post.verifiedPartLabel) verifiedSeriesMemberPartLabels.set(post.seriesMemberId, post.verifiedPartLabel);
    }
    return {
      authenticatedCreatorId: creatorId,
      ownedMediaIds: new Set(state.media.map(row => row.id)),
      sourceMediaRelations: state.sourceRelations,
      ownedPostIds: new Set(state.posts.map(row => row.id)),
      ownedTemplateIds: new Set(templates.map(row => row.id)),
      ownedCreativeWorkIds, ownedCreativeSeriesMemberIds, verifiedSeriesMemberPartLabels, currentTemplateConfigs,
      connectedDestinations: new Set(DESTINATIONS.filter(destination => readiness.get(destination) === "available")),
      hasAutopostEntitlement,
      currentSourceRevision: state.sourceRevision,
      ownedTargetPostIds: new Set([...state.targetPostIds, ...(snapshot.source.post_id ? [snapshot.source.post_id] : [])])
    };
  };

  const loadContext: ContextLoader = async (creatorId, candidateSnapshot) => {
    const shape = validatePlanShape(candidateSnapshot);
    if (!shape.ok || shape.value.creator_id !== creatorId) throw new ContextFailure("source_scope");
    const snapshot = shape.value;
    if (snapshot.source.selected_media_ids.length > MAX_REQUEST_MEDIA) throw new ContextFailure("narrow_selection");
    const targetIds = sorted(snapshot.steps.flatMap(step => (step.capability === "prepare_post_draft" || step.capability === "reply_block" || step.capability === "engagement_check") && step.target_post_id ? [step.target_post_id] : []));
    const mediaIds = snapshot.source.selected_media_ids;
    const explicitPosts = sorted(snapshot.source.post_id ? [snapshot.source.post_id] : []);
    const state = await loadSourceState(creatorId, mediaIds, explicitPosts, targetIds);
    if (state.media.some(row => row.processingStatus !== "READY")) throw new ContextFailure("source_scope");
    const trusted = await makeTrustedContext(creatorId, snapshot, state);
    return { context: trusted, sourceFingerprint: state.sourceRevision } satisfies ContextLoad;
  };

  const buildRequestContext = async (input: RequestContextInput): Promise<RequestContextResult> => {
    if (input.snapshot && input.snapshot.creator_id !== input.authenticatedCreatorId) return { kind: "conflict", code: "foreign_plan" };
    let snapshot: PlanSnapshot | null = null;
    if (input.snapshot) {
      const checked = validatePlanShape(input.snapshot);
      if (!checked.ok) return { kind: "conflict", code: "invalid_snapshot" };
      snapshot = checked.value;
    }
    const requestedMedia = sorted([...(snapshot?.source.selected_media_ids ?? []), ...input.selectedMediaIds]);
    const requestedPosts = sorted([...(snapshot?.source.post_id ? [snapshot.source.post_id] : []), ...input.selectedPostIds]);
    if (!snapshot && input.selectedPostIds.length > 1) return { kind: "clarification", code: "ambiguous_source", question: "Choose one source post for this plan." };
    if (input.selectedTemplateIds && (input.selectedTemplateIds.length > MAX_MODEL_TEMPLATES || new Set(input.selectedTemplateIds).size !== input.selectedTemplateIds.length || input.selectedTemplateIds.some(id => !validId(id)))) return { kind: "clarification", code: "narrow_selection", question: "Choose at most three saved templates." };
    const explicitTemplateIds = input.selectedTemplateIds?.length ? [...input.selectedTemplateIds] : undefined;
    const targetIds = snapshot ? sorted(snapshot.steps.flatMap(step => (step.capability === "prepare_post_draft" || step.capability === "reply_block" || step.capability === "engagement_check") && step.target_post_id ? [step.target_post_id] : [])) : [];
    const receivedAtUtc = input.receivedAtUtc ?? (options.now ?? (() => new Date()))().toISOString();
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(receivedAtUtc) || !Number.isFinite(Date.parse(receivedAtUtc)) || new Date(receivedAtUtc).toISOString().slice(0, 19) !== receivedAtUtc.slice(0, 19)) return { kind: "unavailable", code: "source_scope" };
    try {
      if (snapshot) {
        const fresh = await loadContext(input.authenticatedCreatorId, snapshot);
        if (fresh.sourceFingerprint !== snapshot.source.source_revision || !validatePlanWithContext(snapshot, fresh.context).ok) return { kind: "conflict", code: "stale_snapshot" };
      }
      const state = await loadSourceState(input.authenticatedCreatorId, requestedMedia, requestedPosts, targetIds);
      if (state.posts.some(post => !post)) return { kind: "unavailable", code: "source_scope" };
      if (state.media.some(row => row.processingStatus !== "READY")) return { kind: "unavailable", code: "source_scope" };
      if (requestedMedia.length && requestedPosts.some(postId => ![...state.sourceRelations.values()].some(relation => relation.post_ids.has(postId)))) return { kind: "unavailable", code: "source_scope" };
      const relatedPosts = state.posts.filter(post => state.sourcePostIds.includes(post.id));
      const workIds = sorted([...state.sourceRelations.values()].flatMap(r => [...r.creative_work_ids]));
      const seriesIds = sorted([...state.sourceRelations.values()].flatMap(r => [...r.creative_series_member_ids]));
      if (workIds.length > 1 || seriesIds.length > 1) return { kind: "clarification", code: "ambiguous_source", question: "Choose one source work or series member before continuing." };
      const candidatePostIds = sorted([...state.sourcePostIds]);
      if (!requestedPosts.length && requestedMedia.length && candidatePostIds.length > 1) return { kind: "clarification", code: "ambiguous_source", question: "Choose one linked post for the selected media." };
      if (candidatePostIds.length > MAX_REQUEST_POSTS) return { kind: "clarification", code: "narrow_selection", question: "Narrow the source to at most four linked posts." };
      const creatorTimezone = await trustedLookup.loadCreatorTimezone(input.authenticatedCreatorId);
      const requestClock = { receivedAtUtc: new Date(receivedAtUtc).toISOString(), timezone: creatorTimezone };
      const localDate = creatorTimezone ? new Intl.DateTimeFormat("en-CA", { timeZone: creatorTimezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(receivedAtUtc)) : requestClock.receivedAtUtc.slice(0, 10);
      const handleResult = snapshot ? buildHandles(snapshot, input.authenticatedCreatorId) : { handleMap: new Map<string, RevisionHandleBinding>(), handleForStep: new Map<string, string>(), descriptors: [] as Array<EditDescriptor & { modelNode: PlanningModelContext["editable_nodes"][number] }> };
      if ("error" in handleResult) return { kind: "conflict", code: "invalid_snapshot" };
      const allSteps = snapshot?.steps ?? [];
      if (input.targetHandleRefs && (input.targetHandleRefs.length > MAX_EDITABLE_NODES || new Set(input.targetHandleRefs.map(row => row.handle)).size !== input.targetHandleRefs.length)) return { kind: "clarification", code: "narrow_edit_scope", question: "Choose at most eight distinct plan items to edit." };
      let selectedHandles: Set<string> | null = null;
      if (input.targetHandleRefs?.length) {
        selectedHandles = new Set();
        for (const ref of input.targetHandleRefs) {
          if (!ref || typeof ref.handle !== "string" || !handleResult.handleMap.has(ref.handle)) return { kind: "conflict", code: "invalid_handle" };
          selectedHandles.add(ref.handle);
        }
      } else if (allSteps.length > MAX_EDITABLE_NODES) {
        return { kind: "clarification", code: "narrow_edit_scope", question: "Choose up to eight plan items to edit." };
      }
      const descriptors = handleResult.descriptors.filter(row => !selectedHandles || selectedHandles.has(row.handle));
      const relevantStepIds = new Set(descriptors.flatMap(descriptor => {
        const binding = handleResult.handleMap.get(descriptor.handle);
        return binding ? [binding.stepId] : [];
      }));
      const stepById = new Map(allSteps.map(step => [step.step_id, step]));
      const dependencyQueue = [...relevantStepIds];
      while (dependencyQueue.length) {
        const step = stepById.get(dependencyQueue.pop()!);
        if (!step) continue;
        const sourceStepId = "source_step_id" in step ? step.source_step_id : null;
        for (const relatedId of [...step.depends_on, ...(sourceStepId ? [sourceStepId] : [])]) {
          if (!relevantStepIds.has(relatedId)) { relevantStepIds.add(relatedId); dependencyQueue.push(relatedId); }
        }
      }
      const nodeTemplateIds = sorted(allSteps.filter((step): step is Extract<PlanStep, { capability: "prepare_preview" }> => step.capability === "prepare_preview")
        .filter(step => relevantStepIds.has(step.step_id) || relevantStepIds.has(step.source_step_id)).map(step => step.template_id));
      const chosenTemplateIds = [...new Set([...(explicitTemplateIds ?? []), ...nodeTemplateIds])];
      if (chosenTemplateIds.length > MAX_MODEL_TEMPLATES) return { kind: "clarification", code: "narrow_edit_scope", question: "Choose items and up to three saved templates." };
      let templateSummaries: Array<{ id: string; name: string }>;
      const templateNames = new Map<string, string>();
      const exactTemplateIds = explicitTemplateIds ?? (snapshot ? nodeTemplateIds : undefined);
      const catalogRows = exactTemplateIds === undefined
        ? await db.creatorPreviewTemplate.findMany({ where: { creatorId: input.authenticatedCreatorId }, take: MAX_MODEL_TEMPLATES + 1, orderBy: { id: "asc" }, select: { id: true, creatorId: true, name: true, config: true } })
        : await db.creatorPreviewTemplate.findMany({ where: { creatorId: input.authenticatedCreatorId, id: { in: chosenTemplateIds } }, take: MAX_MODEL_TEMPLATES + 1, orderBy: { id: "asc" }, select: { id: true, creatorId: true, name: true, config: true } });
      if (catalogRows.length > MAX_MODEL_TEMPLATES) return { kind: "clarification", code: "narrow_selection", question: "Choose up to three saved templates for this request." };
      if (catalogRows.some(row => row.creatorId !== input.authenticatedCreatorId)) return { kind: "unavailable", code: "source_scope" };
      const expectedTemplateIds = exactTemplateIds === undefined ? catalogRows.map(row => row.id) : chosenTemplateIds;
      if (exactTemplateIds !== undefined && catalogRows.length !== expectedTemplateIds.length) return { kind: "unavailable", code: "source_scope" };
      const catalogIds = new Set(catalogRows.map(row => row.id));
      if (nodeTemplateIds.some(id => !catalogIds.has(id))) return { kind: "conflict", code: "stale_snapshot" };
      for (const row of catalogRows) {
          try { parsePreviewTemplateConfig(row.config); } catch { return { kind: "unavailable", code: "source_scope" }; }
          templateNames.set(row.id, row.name);
      }
      const catalogById = new Map(catalogRows.map(row => [row.id, row]));
      const summaryOrder = exactTemplateIds === undefined ? catalogRows.map(row => row.id) : expectedTemplateIds;
      templateSummaries = summaryOrder.flatMap(id => {
        const row = catalogById.get(id);
        return row ? [{ id: row.id, name: row.name }] : [];
      });
      const destinations = await trustedLookup.lookup.destinationReadiness(input.authenticatedCreatorId);
      const contextRaw = {
        request_clock: { received_at_utc: requestClock.receivedAtUtc, local_date: localDate, timezone: requestClock.timezone },
        plan_revision: snapshot?.revision ?? null,
        selected: { media_ids: requestedMedia, post_ids: requestedPosts, work_id: workIds[0] ?? snapshot?.source.creative_work_id ?? null },
        media: state.media.map(row => ({ id: row.id, filename: row.filename, mime: row.mimeType, processing_status: row.processingStatus, primary_post_id: row.primaryPostId, linked_post_ids: sorted([...row.postIds, ...(row.primaryPostId ? [row.primaryPostId] : [])].filter(id => state.sourcePostIds.includes(id))) })),
        posts: relatedPosts.map(row => ({ id: row.id, effective_title: row.effectiveTitle, publish_state: row.publishState, series_member_id: row.seriesMemberId, part_label: row.verifiedPartLabel, selected_media_ids: row.mediaIds.filter(id => requestedMedia.includes(id)) })),
        templates: templateSummaries,
        destinations: DESTINATIONS.map(id => ({ id, readiness: destinations.get(id) ?? "needs_extension" })),
        creator_timezone: creatorTimezone,
        editable_nodes: descriptors.map(descriptor => {
          const preview = allSteps.find((step): step is Extract<PlanStep, { capability: "prepare_preview" }> => step.capability === "prepare_preview" && handleResult.handleForStep.get(step.step_id) === descriptor.handle);
          return { ...descriptor.modelNode, template_name: preview ? templateNames.get(preview.template_id) ?? null : null };
        }),
        allowed_request_kinds: ["primary_draft", "teaser", "followup"],
        allowed_social_actions: ["reply_block", "engagement_check"],
        prior_clarification: snapshot?.clarifications.length ? { slot_ids: snapshot.clarifications.slice(0, 16).map(row => row.slot_id), short_questions: snapshot.clarifications.slice(0, 16).map(row => row.question.slice(0, 200)) } : null
      };
      const modelContext = projectPlanningContext(contextRaw);
      if (!modelContext || new TextEncoder().encode(JSON.stringify(modelContext)).byteLength > MAX_CONTEXT_BYTES) return { kind: "clarification", code: "narrow_selection", question: "Narrow the source or edit scope to fit the bounded planning context." };
      return { kind: "ok", modelContext, sourceFingerprint: state.sourceRevision, requestClock, frozenCreatorTimezone: creatorTimezone, handleMap: handleResult.handleMap, editDescriptors: descriptors.map(({ modelNode: _modelNode, ...descriptor }) => descriptor) };
    } catch (error) {
      if (error instanceof ContextFailure) return error.code === "ambiguous_source" || error.code === "narrow_selection" ? { kind: "clarification", code: error.code, question: error.code === "ambiguous_source" ? "Choose one source before continuing." : "Narrow the source selection and try again." } : { kind: "unavailable", code: error.code === "context_too_large" ? "context_too_large" : "source_scope" };
      return { kind: "unavailable", code: "source_scope" };
    }
  };

  return { lookup: trustedLookup.lookup, loadContext, buildRequestContext };
}

function stepDestination(step: PlanStep): Destination | null {
  return step.capability === "prepare_distribution" || step.capability === "publish_handoff" || step.capability === "reply_block" || step.capability === "engagement_check" ? step.destination : step.capability === "prepare_post_draft" ? "patreon" : null;
}
function stepTitle(step: PlanStep): { text: string; origin: "creator" | "compiler" } {
  const copy = step.capability === "prepare_distribution" ? step.copy_title : step.title;
  return copy.mode === "literal" ? { text: copy.value, origin: copy.origin } : { text: `${copy.prefix}${copy.part}${copy.suffix}`, origin: copy.part_source === "creator" ? "creator" : "compiler" };
}
function buildHandles(snapshot: PlanSnapshot, creatorId: string): { handleMap: Map<string, RevisionHandleBinding>; handleForStep: Map<string, string>; descriptors: Array<EditDescriptor & { modelNode: PlanningModelContext["editable_nodes"][number] }> } | { error: true } {
  if (snapshot.creator_id !== creatorId || snapshot.steps.length > MAX_PLAN_STEPS) return { error: true };
  const handleMap = new Map<string, RevisionHandleBinding>();
  const handleForStep = new Map<string, string>();
  const descriptors: Array<EditDescriptor & { modelNode: PlanningModelContext["editable_nodes"][number] }> = [];
  for (const step of snapshot.steps) {
    const binding = [creatorId, snapshot.plan_id, snapshot.revision, step.step_id] as const;
    const handle = `node_${sha256({ v: 1, binding }).slice(0, 24)}`;
    if (handleMap.has(handle)) return { error: true };
    handleMap.set(handle, { creatorId, planId: snapshot.plan_id, revision: snapshot.revision, stepId: step.step_id });
    handleForStep.set(step.step_id, handle);
    const title = stepTitle(step);
    const time = step.time;
    const modelNode: PlanningModelContext["editable_nodes"][number] = {
      handle, capability: step.capability, destination: stepDestination(step), title: title.text,
      title_origin: title.origin,
      local_date: time?.kind === "absolute" ? time.local.slice(0, 10) : null,
      local_time: time?.kind === "absolute" ? time.local.slice(11, 16) : time?.kind === "after_publication_calendar_days" ? time.local_time : null,
      timezone: time?.timezone ?? null,
      time_origin: null,
      template_name: null,
      enabled: step.enabled
    };
    descriptors.push({ handle, capability: step.capability, destination: stepDestination(step), title: title.text, enabled: step.enabled, modelNode });
  }
  return { handleMap, handleForStep, descriptors };
}

/** Derive read descriptors from a repository-validated snapshot without loading or projecting model context. */
export function derivePlanningEditDescriptors(snapshot: PlanSnapshot, authenticatedCreatorId: string): PlanningEditDescriptorResult {
  if (!snapshot || snapshot.creator_id !== authenticatedCreatorId) return { kind: "conflict", code: "foreign_plan" };
  if (!Array.isArray(snapshot.steps) || snapshot.steps.length > MAX_PLAN_STEPS) return { kind: "conflict", code: "invalid_snapshot" };
  try {
    const result = buildHandles(snapshot, authenticatedCreatorId);
    if ("error" in result) return { kind: "conflict", code: "invalid_snapshot" };
    return { kind: "ok", descriptors: result.descriptors.map(({ modelNode: _modelNode, ...descriptor }) => descriptor) };
  } catch {
    return { kind: "conflict", code: "invalid_snapshot" };
  }
}
