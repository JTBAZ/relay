import { compileNewPlan, compilePlanRevision, type CalendarResolver, type CompileResult, type CompileRevisionResult, type TrustedLookup } from "./compiler.js";
import { createCalendarResolver } from "./calendar-resolver.js";
import { derivePlanningEditDescriptors, type PlanningContextSource, type EditDescriptor } from "./context.js";
import { interpretRequest, MAX_REQUEST_CHARS, type PlanningProvider, type InterpretationResult } from "./intent.js";
import { validatePlanShape, validatePlanWithContext, type CopyValue, type PlanSnapshot, type PlanStep, type StepPointer, type TimeSpec } from "./contract.js";
import type { ConversationalPlanRepository, Mutation, PageCursor, ManualFieldPatch, RepoError, ReadResult, WriteResult, ListResult } from "./persistence.js";

export type PlanningPrincipal = Readonly<{ accountId: string; creatorId: string }>;
export type CreateBody = Readonly<{ clientMutationKey: string; latestRequest: string; selectedPostIds: readonly string[]; selectedMediaIds: readonly string[]; selectedTemplateIds?: readonly string[] }>;
export type ReviseBody =
  | (CreateBody & Readonly<{ mode: "ai"; baseRevision: number; targetHandleRefs?: readonly Readonly<{ handle: string }>[] }>)
  | Readonly<{ mode: "manual"; clientMutationKey: string; baseRevision: number; patch: readonly ManualFieldPatch[] }>;
export type ReviewBody = Readonly<{ clientMutationKey: string; baseRevision: number }>;
export type ResumePreparationBody = Readonly<{ approvedRevision: number }>;
export type PreparationResult = { kind: "authorities_linked" } | { kind: "blocked"; code: "authority_gap" | "preparation_unavailable" };
export interface PlanPreparationAdapter { prepare(input: { creatorId: string; planId: string; approvedRevision: number }): Promise<PreparationResult> }

export type ServiceError = { kind: "error"; code: "invalid_request" | "too_large" | "not_found" | "creator_not_provisioned" | "idempotency_conflict" | "revision_conflict" | "pointer_conflict" | "stale_source" | "authority_gap" | "invalid_snapshot" | "provider_unavailable" | "provider_budget_exhausted" | "provider_budget_unavailable" | "provider_timeout" | "provider_failure" | "provider_usage_unavailable" | "preparation_unavailable" | "unavailable"; current?: PlanSnapshot };
export type StoredPlan = { kind: "stored"; current: PlanSnapshot; recordedRevision: number; pointers: readonly StepPointer[] };
export type LimitationCode = "contract_gap" | "invalid_interpretation" | "unsupported_request" | "source_scope" | "entitlement_required" | "validation_failed" | "unsupported_revision";
export type TurnResult = StoredPlan | { kind: "clarification"; question: string; preview?: Extract<CompileResult, { kind: "clarification_preview" }> } | { kind: "limitation"; code: LimitationCode } | { kind: "unchanged"; planId: string | null; revision: number | null } | ServiceError;
export type PlanReadResult = { kind: "ok"; current: PlanSnapshot; pointers: ReadonlyArray<import("./contract.js").StepPointer>; editHandles: readonly EditDescriptor[] } | ServiceError;
export type PlanListResult = { kind: "ok"; items: readonly PlanSnapshot[]; nextCursor: PageCursor | null } | ServiceError;
export type PlanWriteResult = StoredPlan | ServiceError;
export type ConfirmResult = StoredPlan | { kind: "preparation_unavailable" } | ServiceError;
export type ReadinessIssue = "plan_cancelled" | "blocking_clarifications" | "unresolved_requests" | "source_media_missing";
export type Readiness = { status: "ready" | "blocked" | "approved" | "cancelled"; issues: readonly ReadinessIssue[]; pointerCount: number };
export type PlanPreviewResult = { kind: "ok"; planId: string; revision: number; review: PlanSnapshot["review"]; readiness: Readiness } | ServiceError;

export interface ConversationalPlanningService {
  create(p: PlanningPrincipal, body: CreateBody, signal: AbortSignal): Promise<TurnResult>;
  revise(p: PlanningPrincipal, planId: string, body: ReviseBody, signal: AbortSignal): Promise<TurnResult>;
  get(p: PlanningPrincipal, planId: string): Promise<PlanReadResult>;
  list(p: PlanningPrincipal, page: { limit: number; cursor?: PageCursor }): Promise<PlanListResult>;
  preview(p: PlanningPrincipal, planId: string): Promise<PlanPreviewResult>;
  approve(p: PlanningPrincipal, planId: string, body: ReviewBody): Promise<PlanWriteResult>;
  cancel(p: PlanningPrincipal, planId: string, body: ReviewBody): Promise<PlanWriteResult>;
  confirm(p: PlanningPrincipal, planId: string, body: ReviewBody): Promise<ConfirmResult>;
  resumePreparation(p: PlanningPrincipal, planId: string, body: ResumePreparationBody): Promise<ConfirmResult>;
}
export type ServiceDependencies = Readonly<{ repository: ConversationalPlanRepository; context: PlanningContextSource; provider?: PlanningProvider; preparation?: PlanPreparationAdapter; calendarResolver?: CalendarResolver; now?: () => Date }>;

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const validId = (v: unknown, max = 160): v is string => typeof v === "string" && v.length > 0 && v.length <= max && v.trim() === v;
const validRevision = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const distinctIds = (v: unknown, maxCount: number): v is readonly string[] => Array.isArray(v) && v.length <= maxCount && v.every(x => validId(x)) && new Set(v).size === v.length;
const isSafePrincipal = (p: PlanningPrincipal) => !!p && validId(p.accountId) && validId(p.creatorId);
const repoError = (error: RepoError): ServiceError => error.kind === "not_found" ? { kind: "error", code: "not_found" }
  : error.kind === "creator_not_provisioned" ? { kind: "error", code: "creator_not_provisioned" }
  : error.kind === "idempotency_conflict" ? { kind: "error", code: "idempotency_conflict" }
  : error.kind === "revision_conflict" ? { kind: "error", code: "revision_conflict", ...(error.current ? { current: error.current } : {}) }
  : error.kind === "pointer_conflict" ? { kind: "error", code: "pointer_conflict", ...(error.current ? { current: error.current } : {}) }
  : error.kind === "stale_source" ? { kind: "error", code: "stale_source" }
  : error.kind === "authority_gap" ? { kind: "error", code: "authority_gap" }
  : error.kind === "invalid_snapshot" ? { kind: "error", code: "invalid_snapshot" } : { kind: "error", code: "unavailable" };
const stored = (result: WriteResult): StoredPlan | ServiceError => result.kind === "ok"
  ? { kind: "stored", current: result.current, recordedRevision: result.recordedRevision, pointers: result.pointers }
  : repoError(result);
const requestOk = (body: CreateBody): boolean => object(body) && exact(body, ["clientMutationKey", "latestRequest", "selectedPostIds", "selectedMediaIds"].concat(Object.hasOwn(body, "selectedTemplateIds") ? ["selectedTemplateIds"] : []))
  && validId(body.clientMutationKey) && typeof body.latestRequest === "string" && body.latestRequest.trim().length > 0 && body.latestRequest.length <= MAX_REQUEST_CHARS
  && distinctIds(body.selectedMediaIds, 3) && distinctIds(body.selectedPostIds, 4)
  && (body.selectedTemplateIds === undefined || distinctIds(body.selectedTemplateIds, 3));
const templateIds = (body: CreateBody) => body.selectedTemplateIds?.length ? [...body.selectedTemplateIds] : undefined;
const validManualPatch = (patch: unknown): patch is readonly ManualFieldPatch[] => {
  if (!Array.isArray(patch) || patch.length < 1 || patch.length > 128) return false;
  const seen = new Set<string>();
  for (const item of patch) {
    if (!object(item) || !validId(item.step_id)) return false;
    const key = `${item.step_id}\0${String(item.field)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (item.field === "title") {
      if (!exact(item, ["step_id", "field", "value"]) || !validManualCopy(item.value)) return false;
    } else if (item.field === "note") {
      if (!exact(item, ["step_id", "field", "value"]) || !(item.value === null || (typeof item.value === "string" && item.value.length <= 2000))) return false;
    } else if (item.field === "enabled") {
      if (!exact(item, ["step_id", "field", "value"]) || typeof item.value !== "boolean") return false;
    } else if (item.field === "time") {
      if (!exact(item, ["step_id", "field", "value"]) || !(item.value === null || validTime(item.value))) return false;
    } else return false;
  }
  return true;
};
function validManualCopy(v: unknown): v is CopyValue {
  return object(v) && v.mode === "literal" && exact(v, ["mode", "value", "origin"]) && typeof v.value === "string" && v.value.length > 0 && v.value.length <= 500 && v.origin === "creator";
}
function validTime(v: unknown): v is TimeSpec {
  if (!object(v)) return false;
  if (v.kind === "absolute") return exact(v, ["kind", "at_utc", "timezone", "local"]) && typeof v.at_utc === "string" && Number.isFinite(Date.parse(v.at_utc)) && new Date(v.at_utc).toISOString() === v.at_utc && typeof v.timezone === "string" && v.timezone.length <= 100 && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(v.local));
  return v.kind === "after_publication_calendar_days" && exact(v, ["kind", "anchor_step_id", "day_offset", "timezone", "local_time"]) && validId(v.anchor_step_id) && (v.day_offset === 1 || v.day_offset === 2) && typeof v.timezone === "string" && v.timezone.length <= 100 && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v.local_time));
}
function applyManual(current: PlanSnapshot, patches: readonly ManualFieldPatch[], now: string): PlanSnapshot | null {
  const steps = current.steps.map(step => ({ ...step })) as PlanStep[];
  for (const patch of patches) {
    const index = steps.findIndex(step => step.step_id === patch.step_id);
    if (index < 0) return null;
    const step = steps[index]!;
    if (patch.field === "title") {
      const value = structuredClone(patch.value);
      if (step.capability === "prepare_distribution") steps[index] = { ...step, title: value, copy_title: value };
      else steps[index] = { ...step, title: value } as PlanStep;
    } else if (patch.field === "note") steps[index] = { ...step, note: patch.value } as PlanStep;
    else if (patch.field === "enabled") steps[index] = { ...step, enabled: patch.value } as PlanStep;
    else steps[index] = { ...step, time: patch.value === null ? null : structuredClone(patch.value) } as PlanStep;
  }
  const next: PlanSnapshot = { ...current, steps, revision: current.revision + 1, updated_at: now };
  return validatePlanShape(next).ok ? next : null;
}
export function createConversationalPlanningService(deps: ServiceDependencies): ConversationalPlanningService {
  const now = deps.now ?? (() => new Date());
  const calendarResolver = deps.calendarResolver ?? createCalendarResolver();
  const validPrincipal = (p: PlanningPrincipal) => isSafePrincipal(p);
  const makeMutation = <C extends Mutation["command"]>(creatorId: string, key: string, command: C): Mutation & { command: C } => ({ creatorId, clientMutationKey: key, command });
  const requestContext = (p: PlanningPrincipal, ids: { media: readonly string[]; posts: readonly string[]; templates?: readonly string[]; snapshot?: PlanSnapshot; targetHandleRefs?: readonly { handle: string }[] }) => deps.context.buildRequestContext({ authenticatedCreatorId: p.creatorId, selectedMediaIds: ids.media, selectedPostIds: ids.posts, ...(ids.snapshot ? { snapshot: ids.snapshot } : {}), ...(ids.templates ? { selectedTemplateIds: ids.templates } : {}), ...(ids.targetHandleRefs ? { targetHandleRefs: ids.targetHandleRefs } : {}), receivedAtUtc: now().toISOString() });
  const replay = async (mutation: Mutation) => {
    const result = await deps.repository.lookupReplay(mutation);
    if (result.kind === "replay") return { result: { kind: "stored", current: result.current, recordedRevision: result.recordedRevision, pointers: result.pointers } as StoredPlan };
    if (result.kind !== "new") return { result: repoError(result) };
    return { result: null };
  };
  const mapInterpretation = (i: InterpretationResult, current?: PlanSnapshot): TurnResult | null => i.outcome === "clarification" ? { kind: "clarification", question: i.question ?? "Please clarify the planning details." }
    : i.outcome === "limitation" ? { kind: "limitation", code: "unsupported_request" }
    : i.outcome === "no_change" ? { kind: "unchanged", planId: current?.plan_id ?? null, revision: current?.revision ?? null }
    : i.outcome === "unavailable" ? { kind: "error", code: "provider_unavailable" }
    : i.outcome === "error" ? { kind: "error", code: i.terminalReason === "budget_failure" ? "provider_budget_exhausted" : i.terminalReason === "budget_unavailable" ? "provider_budget_unavailable" : i.terminalReason === "timeout" || i.terminalReason === "aborted" ? "provider_timeout" : i.terminalReason === "usage_unavailable" ? "provider_usage_unavailable" : "provider_failure" } : null;
  const compileFailure = (result: CompileResult | CompileRevisionResult): TurnResult | null => {
    if (result.kind === "plan") return null;
    if (result.kind === "clarification_preview") return { kind: "clarification", question: result.slots[0]?.question ?? "Please clarify the planning details.", preview: result };
    if (result.kind === "clarification") return { kind: "clarification", question: result.question };
    if (result.kind === "unchanged") return { kind: "unchanged", planId: result.planId, revision: result.revision };
    if (result.kind === "conflict") return { kind: "error", code: result.code === "stale_revision" ? "revision_conflict" : "invalid_request" };
    return { kind: "limitation", code: result.code };
  };

  return {
    async create(p, body, signal) {
      if (!validPrincipal(p)) return { kind: "error", code: "invalid_request" };
      if (!requestOk(body)) return { kind: "error", code: typeof body?.latestRequest === "string" && body.latestRequest.length > MAX_REQUEST_CHARS ? "too_large" : "invalid_request" };
      const command = { operation: "create" as const, latestRequest: body.latestRequest, selectedPostIds: [...body.selectedPostIds], selectedMediaIds: [...body.selectedMediaIds], ...(templateIds(body) ? { selectedTemplateIds: templateIds(body) } : {}) };
      const mutation = makeMutation(p.creatorId, body.clientMutationKey, command);
      const replayed = await replay(mutation); if (replayed.result) return replayed.result;
      if (!deps.provider) return { kind: "error", code: "provider_unavailable" };
      const context = await requestContext(p, { media: body.selectedMediaIds, posts: body.selectedPostIds, templates: body.selectedTemplateIds });
      if (context.kind === "clarification") return { kind: "clarification", question: context.question };
      if (context.kind === "unavailable") return { kind: "error", code: context.code === "context_too_large" ? "too_large" : "unavailable" };
      if (context.kind === "conflict") return { kind: "error", code: context.code === "foreign_plan" ? "not_found" : context.code === "stale_snapshot" ? "stale_source" : context.code === "invalid_handle" ? "invalid_request" : "invalid_snapshot" };
      const interpreted = await interpretRequest({ latestRequest: body.latestRequest, rawContext: context.modelContext, provider: deps.provider, signal });
      const mapped = mapInterpretation(interpreted); if (mapped) return mapped;
      if (interpreted.outcome !== "proposal") return { kind: "error", code: "unavailable" };
      const compiled = await compileNewPlan({ interpreted: { base_revision: null, outcome: "proposal", question: null, requests: interpreted.requests }, latestRequest: body.latestRequest, creatorId: p.creatorId, selectedMediaIds: body.selectedMediaIds, selectedPostIds: body.selectedPostIds, requestClock: context.requestClock, sourceRevision: context.sourceFingerprint, lookup: deps.context.lookup as TrustedLookup, calendarResolver });
      const failure = compileFailure(compiled); if (failure) return failure;
      if (compiled.kind !== "plan") return { kind: "error", code: "unavailable" };
      const saved = await deps.repository.create({ ...mutation, snapshot: compiled.snapshot });
      return stored(saved);
    },
    async revise(p, planId, body, signal) {
      if (!validPrincipal(p) || !validId(planId)) return { kind: "error", code: "invalid_request" };
      if (!object(body) || (body.mode !== "ai" && body.mode !== "manual")) return { kind: "error", code: "invalid_request" };
      if (body.mode === "ai") {
        const required = ["mode", "clientMutationKey", "baseRevision", "latestRequest", "selectedPostIds", "selectedMediaIds"];
        const keys = [...required, ...(Object.hasOwn(body, "selectedTemplateIds") ? ["selectedTemplateIds"] : []), ...(Object.hasOwn(body, "targetHandleRefs") ? ["targetHandleRefs"] : [])];
        if (!exact(body, keys) || !validId(body.clientMutationKey) || !validRevision(body.baseRevision) || !requestOk({ clientMutationKey: body.clientMutationKey as string, latestRequest: body.latestRequest as string, selectedPostIds: body.selectedPostIds as string[], selectedMediaIds: body.selectedMediaIds as string[], ...(Object.hasOwn(body, "selectedTemplateIds") ? { selectedTemplateIds: body.selectedTemplateIds as string[] } : {}) }) || (body.targetHandleRefs !== undefined && (!Array.isArray(body.targetHandleRefs) || body.targetHandleRefs.length > 8 || body.targetHandleRefs.some(ref => !object(ref) || !exact(ref, ["handle"]) || !validId(ref.handle, 100)) || new Set(body.targetHandleRefs.map(ref => (ref as {handle:string}).handle)).size !== body.targetHandleRefs.length))) return { kind: "error", code: "invalid_request" };
        const input = body as unknown as Extract<ReviseBody, { mode: "ai" }>;
        const command = { operation: "revise_ai" as const, planId, baseRevision: input.baseRevision, latestRequest: input.latestRequest, selectedPostIds: [...input.selectedPostIds], selectedMediaIds: [...input.selectedMediaIds], ...(templateIds(input) ? { selectedTemplateIds: templateIds(input) } : {}), ...(input.targetHandleRefs?.length ? { targetHandleRefs: [...input.targetHandleRefs] } : {}) };
        const mutation = makeMutation(p.creatorId, input.clientMutationKey, command);
        const replayed = await replay(mutation); if (replayed.result) return replayed.result;
        const currentResult = await deps.repository.get(p.creatorId, planId);
        if (currentResult.kind !== "ok") return repoError(currentResult);
        const current = currentResult.current;
        if (current.revision !== input.baseRevision) return { kind: "error", code: "revision_conflict", current };
        if (current.review !== "proposed") return { kind: "error", code: "revision_conflict", current };
        if (!deps.provider) return { kind: "error", code: "provider_unavailable" };
        const context = await requestContext(p, { media: input.selectedMediaIds, posts: input.selectedPostIds, templates: input.selectedTemplateIds, snapshot: current, targetHandleRefs: input.targetHandleRefs });
        if (context.kind === "clarification") return { kind: "clarification", question: context.question };
        if (context.kind === "unavailable") return { kind: "error", code: context.code === "context_too_large" ? "too_large" : "unavailable" };
        if (context.kind === "conflict") return { kind: "error", code: context.code === "foreign_plan" ? "not_found" : context.code === "stale_snapshot" ? "stale_source" : context.code === "invalid_handle" ? "invalid_request" : "invalid_snapshot" };
        const interpreted = await interpretRequest({ latestRequest: input.latestRequest, rawContext: context.modelContext, provider: deps.provider, signal });
        const mapped = mapInterpretation(interpreted, current); if (mapped) return mapped;
        if (interpreted.outcome !== "proposal") return { kind: "error", code: "unavailable" };
        const compiled = await compilePlanRevision({ current, authenticatedCreatorId: p.creatorId, handleMap: context.handleMap, expectedRevision: input.baseRevision, interpreted: { base_revision: interpreted.base_revision, outcome: "proposal", question: null, requests: interpreted.requests }, latestRequest: input.latestRequest, requestClock: context.requestClock, frozenCreatorTimezone: context.frozenCreatorTimezone, sourceRevision: context.sourceFingerprint, lookup: deps.context.lookup as TrustedLookup, calendarResolver });
        const failure = compileFailure(compiled); if (failure) return failure;
        if (compiled.kind !== "plan") return { kind: "error", code: "unavailable" };
        return stored(await deps.repository.revise({ ...mutation, candidate: compiled.snapshot }));
      }
      const exactKeys = ["mode", "clientMutationKey", "baseRevision", "patch"];
      if (!exact(body, exactKeys) || !validId(body.clientMutationKey) || !validRevision(body.baseRevision) || !validManualPatch(body.patch)) return { kind: "error", code: "invalid_request" };
      const input = body as unknown as Extract<ReviseBody, { mode: "manual" }>;
      const mutation = makeMutation(p.creatorId, input.clientMutationKey, { operation: "revise_manual", planId, baseRevision: input.baseRevision, patch: input.patch });
      const replayed = await replay(mutation); if (replayed.result) return replayed.result;
      const currentResult = await deps.repository.get(p.creatorId, planId);
      if (currentResult.kind !== "ok") return repoError(currentResult);
      const current = currentResult.current;
      if (current.revision !== input.baseRevision || current.review !== "proposed") return { kind: "error", code: "revision_conflict", current };
      const candidate = applyManual(current, input.patch, now().toISOString());
      if (!candidate) return { kind: "error", code: "invalid_snapshot" };
      const ctx = await deps.context.loadContext(p.creatorId, candidate);
      if (ctx.context.authenticatedCreatorId !== p.creatorId || ctx.sourceFingerprint !== candidate.source.source_revision) return { kind: "error", code: "stale_source" };
      if (!validatePlanWithContext(candidate, ctx.context).ok) return { kind: "error", code: "invalid_snapshot" };
      return stored(await deps.repository.revise({ ...mutation, candidate }));
    },
    async get(p, planId) {
      if (!validPrincipal(p) || !validId(planId)) return { kind: "error", code: "invalid_request" };
      const result = await deps.repository.get(p.creatorId, planId);
      if (result.kind !== "ok") return repoError(result);
      const descriptors = derivePlanningEditDescriptors(result.current, p.creatorId);
      if (descriptors.kind !== "ok") return { kind: "error", code: descriptors.code === "foreign_plan" ? "not_found" : "invalid_snapshot" };
      return { kind: "ok", current: result.current, pointers: result.pointers, editHandles: descriptors.descriptors };
    },
    async list(p, page) {
      if (!validPrincipal(p) || !object(page) || !exact(page, Object.hasOwn(page, "cursor") ? ["limit", "cursor"] : ["limit"]) || !Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100 || (page.cursor !== undefined && (!object(page.cursor) || !exact(page.cursor, ["updatedAt", "id"]) || typeof page.cursor.updatedAt !== "string" || !Number.isFinite(Date.parse(page.cursor.updatedAt)) || !validId(page.cursor.id)))) return { kind: "error", code: "invalid_request" };
      const result = await deps.repository.listCurrent(p.creatorId, page as { limit: number; cursor?: PageCursor });
      return result.kind === "ok" ? { kind: "ok", items: result.items, nextCursor: result.nextCursor } : repoError(result);
    },
    async preview(p, planId) {
      const read = await this.get(p, planId);
      if (read.kind !== "ok") return read;
      const issues: ReadinessIssue[] = [];
      if (read.current.review === "cancelled") issues.push("plan_cancelled");
      if (read.current.clarifications.length) issues.push("blocking_clarifications");
      if (read.current.unresolved_requests.length) issues.push("unresolved_requests");
      if (read.current.steps.some(s => s.enabled && s.capability === "prepare_post_draft" && !s.source_media_ids.length && s.target_post_id === null)) issues.push("source_media_missing");
      const status = read.current.review === "cancelled" ? "cancelled" : read.current.review === "approved_for_preparation" ? "approved" : issues.length ? "blocked" : "ready";
      return { kind: "ok", planId: read.current.plan_id, revision: read.current.revision, review: read.current.review, readiness: { status, issues, pointerCount: read.pointers.length } };
    },
    async approve(p, planId, body) { return reviewWrite(p, planId, body, "approve"); },
    async cancel(p, planId, body) { return reviewWrite(p, planId, body, "cancel"); },
    async confirm(p, planId, body) {
      if (!deps.preparation) return { kind: "preparation_unavailable" };
      const approved = await reviewWrite(p, planId, body, "approve");
      if (approved.kind !== "stored") return approved;
      if (approved.current.review !== "approved_for_preparation" || approved.current.revision !== approved.recordedRevision) return { kind: "error", code: "revision_conflict", current: approved.current };
      const outcome = await deps.preparation.prepare({ creatorId: p.creatorId, planId, approvedRevision: approved.current.revision });
      if (outcome.kind !== "authorities_linked") return { kind: "error", code: outcome.code === "authority_gap" ? "authority_gap" : "preparation_unavailable" };
      const latest = await deps.repository.get(p.creatorId, planId);
      if (latest.kind !== "ok") return repoError(latest);
      if (latest.current.revision !== approved.recordedRevision || latest.current.review !== "approved_for_preparation") return { kind: "error", code: "revision_conflict", current: latest.current };
      return { ...approved, current: latest.current, pointers: latest.pointers };
    },
    async resumePreparation(p, planId, body) {
      if (!validPrincipal(p) || !validId(planId) || !object(body) || !exact(body, ["approvedRevision"]) || !validRevision(body.approvedRevision)) return { kind: "error", code: "invalid_request" };
      if (!deps.preparation) return { kind: "preparation_unavailable" };
      const current = await deps.repository.get(p.creatorId, planId);
      if (current.kind !== "ok") return repoError(current);
      if (current.current.review !== "approved_for_preparation" || current.current.revision !== body.approvedRevision) return { kind: "error", code: "revision_conflict", current: current.current };
      const context = await deps.context.loadContext(p.creatorId, current.current);
      if (context.context.authenticatedCreatorId !== p.creatorId || context.sourceFingerprint !== current.current.source.source_revision || !validatePlanWithContext(current.current, context.context).ok) return { kind: "error", code: "stale_source" };
      const outcome = await deps.preparation.prepare({ creatorId: p.creatorId, planId, approvedRevision: body.approvedRevision });
      if (outcome.kind !== "authorities_linked") return { kind: "error", code: outcome.code === "authority_gap" ? "authority_gap" : "preparation_unavailable" };
      const after = await deps.repository.get(p.creatorId, planId);
      if (after.kind !== "ok") return repoError(after);
      if (after.current.review !== "approved_for_preparation" || after.current.revision !== body.approvedRevision) return { kind: "error", code: "revision_conflict", current: after.current };
      const fresh = await deps.context.loadContext(p.creatorId, after.current);
      if (fresh.context.authenticatedCreatorId !== p.creatorId || fresh.sourceFingerprint !== after.current.source.source_revision || !validatePlanWithContext(after.current, fresh.context).ok) return { kind: "error", code: "stale_source" };
      return { kind: "stored", current: after.current, recordedRevision: body.approvedRevision, pointers: after.pointers };
    }
  };

  async function reviewWrite(p: PlanningPrincipal, planId: string, body: ReviewBody, operation: "approve" | "cancel"): Promise<PlanWriteResult> {
    if (!validPrincipal(p) || !validId(planId) || !object(body) || !exact(body, ["clientMutationKey", "baseRevision"]) || !validId(body.clientMutationKey) || !validRevision(body.baseRevision)) return { kind: "error", code: "invalid_request" };
    const mutation = makeMutation(p.creatorId, body.clientMutationKey, { operation, planId, baseRevision: body.baseRevision });
    const replayed = await replay(mutation); if (replayed.result) return replayed.result;
    const current = await deps.repository.get(p.creatorId, planId);
    if (current.kind !== "ok") return repoError(current);
    if (current.current.revision !== body.baseRevision || (operation === "approve" ? current.current.review !== "proposed" : current.current.review === "cancelled")) return { kind: "error", code: "revision_conflict", current: current.current };
    const ctx = await deps.context.loadContext(p.creatorId, current.current);
    if (ctx.sourceFingerprint !== current.current.source.source_revision || !validatePlanWithContext(current.current, ctx.context).ok) return { kind: "error", code: "stale_source" };
    const result = operation === "approve" ? await deps.repository.approve(mutation as Mutation & { command: Extract<Mutation["command"], { operation: "approve" }> }) : await deps.repository.cancel(mutation as Mutation & { command: Extract<Mutation["command"], { operation: "cancel" }> });
    return stored(result);
  }
}
