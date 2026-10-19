import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createPlanningContextSource } from "./context.js";
import { saveConversationalDraftInTransaction, ConversationalDraftReservationError } from "../autopost/autopost-draft-service.js";
import { createConversationalAttentionEventInTransaction } from "../distribution/creator-schedule-event-service.js";
import {
  PLAN_SCHEMA_VERSION, validatePlanShape, validatePlanWithContext, validateStepPointer,
  type PlanSnapshot, type PlanReview, type TrustedPlanContext, type CopyValue, type TimeSpec, type StepPointer
} from "./contract.js";

const MAX_KEY = 160;
const MAX_REQUEST = 8_000;
const MAX_SELECTION = 32;
const MAX_TEMPLATE_SELECTION = 3;
const MAX_COMMAND_BYTES = 16 * 1024;
const PAGE_MAX = 100;
const RACE_REREADS = 2;

export type TargetHandleRef = { handle: string };
export type ManualFieldPatch =
  | { step_id: string; field: "title"; value: CopyValue }
  | { step_id: string; field: "note"; value: string | null }
  | { step_id: string; field: "enabled"; value: boolean }
  | { step_id: string; field: "time"; value: TimeSpec | null };
export type Command =
  | { operation: "create"; latestRequest: string; selectedPostIds: readonly string[]; selectedMediaIds: readonly string[]; selectedTemplateIds?: readonly string[] }
  | { operation: "revise_ai"; planId: string; baseRevision: number; latestRequest: string; selectedPostIds: readonly string[]; selectedMediaIds: readonly string[]; selectedTemplateIds?: readonly string[]; targetHandleRefs?: readonly TargetHandleRef[] }
  | { operation: "revise_manual"; planId: string; baseRevision: number; patch: readonly ManualFieldPatch[] }
  | { operation: "approve"; planId: string; baseRevision: number }
  | { operation: "cancel"; planId: string; baseRevision: number };
export type Mutation = { creatorId: string; clientMutationKey: string; command: Command };
export type PageCursor = { updatedAt: string; id: string };
export type CheckedPointer = StepPointer;
export type PlanRow = { id: string; creatorId: string; schemaVersion: number; revision: number; review: PlanReview; sourceRef: unknown; snapshot: unknown; clientCreateKey: string; createdAt: Date | string; updatedAt: Date | string };
export type RevisionRow = { id: string; planId: string; creatorId: string; revision: number; clientMutationKey: string; requestHash: string; snapshot: unknown; createdAt: Date | string };
type PersistenceTransaction = Pick<Prisma.TransactionClient, "tenant" | "creatorConversationalPlan" | "creatorConversationalPlanRevision" | "creatorConversationalPlanPointer" | "autopostDraft" | "creatorScheduleEvent" | "post" | "postDistributionPlan" | "postDistributionVariant" | "postDistributionAttempt">;
export type PersistenceDb = PersistenceTransaction & {
  $transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};
/** Compile-time adapter proving the repository surface is accepted by the generated production client. */
export function assertPersistenceClientAssignable(client: PrismaClient): PersistenceDb { return client; }
export type ContextLoad = { context: TrustedPlanContext; sourceFingerprint: string };
export type ContextLoader = (authenticatedCreatorId: string, candidateSnapshot: PlanSnapshot) => Promise<ContextLoad>;
export type RepoError = { kind: "not_found" | "creator_not_provisioned" | "idempotency_conflict" | "revision_conflict" | "pointer_conflict" | "invalid_snapshot" | "stale_source" | "authority_gap"; code?: string; current?: PlanSnapshot };
export type ReadResult = { kind: "ok"; current: PlanSnapshot; pointers: readonly CheckedPointer[] } | RepoError;
export type ReplayResult = { kind: "new" } | { kind: "replay"; recordedRevision: number; current: PlanSnapshot; pointers: readonly CheckedPointer[] } | RepoError;
export type WriteResult = { kind: "ok"; current: PlanSnapshot; recordedRevision: number; pointers: readonly CheckedPointer[] } | RepoError;
export type ListResult = { kind: "ok"; items: PlanSnapshot[]; nextCursor: PageCursor | null } | RepoError;
export type PointerReadResult = { kind: "ok"; pointers: readonly CheckedPointer[] } | RepoError;
export type PointerWriteResult = { kind: "ok"; current: PlanSnapshot; pointer: CheckedPointer; pointers: readonly CheckedPointer[] } | RepoError;
type PointerRow = { id: string; planId: string; creatorId: string; nodeId: string; slot: StepPointer["slot"]; authorityKind: StepPointer["kind"]; authorityId: string; createdAt: Date | string };
type AuthorityResult = { kind: "ok"; pointer: StepPointer; authority: Record<string, unknown> } | RepoError;

export type PreparationOutput = "relay_post" | "draft" | "attention_event";
export type PrepareOutputInput = Readonly<{ creatorId: string; planId: string; approvedRevision: number; stepId: string; output: PreparationOutput }>;
export type PreparationBlockCode = "source_intent_gap" | "attached_media_reuse_gap" | "missing_absolute_time" | "title_normalization_gap" | "note_normalization_gap" | "media_not_available" | "active_draft_limit" | "dependency_blocked" | "authority_gap";
export type PrepareOutputResult =
  | { kind: "linked"; current: PlanSnapshot; pointer: CheckedPointer; pointers: readonly CheckedPointer[]; reused: boolean }
  | { kind: "blocked"; code: PreparationBlockCode }
  | { kind: "conflict"; code: "approved_revision_conflict" | "stale_source" | "pointer_conflict" | "authority_conflict" }
  | { kind: "unavailable"; code: "not_found" | "creator_not_provisioned" | "entitlement_required" | "invalid_snapshot" | "preparation_unavailable" };
export interface ConversationalPreparationRepository { prepareOutput(input: PrepareOutputInput): Promise<PrepareOutputResult>; }

class PreparationRollbackSignal extends Error {
  constructor(readonly result: PrepareOutputResult) { super("Preparation transaction must roll back"); }
}

export interface ConversationalPlanRepository {
  lookupReplay(input: Mutation): Promise<ReplayResult>;
  create(input: Mutation & { command: Extract<Command, { operation: "create" }>; snapshot: PlanSnapshot }): Promise<WriteResult>;
  get(creatorId: string, planId: string): Promise<ReadResult>;
  listCurrent(creatorId: string, page: { limit: number; cursor?: PageCursor }): Promise<ListResult>;
  revise(input: Mutation & { command: Extract<Command, { operation: "revise_ai" | "revise_manual" }>; candidate: PlanSnapshot }): Promise<WriteResult>;
  approve(input: Mutation & { command: Extract<Command, { operation: "approve" }> }): Promise<WriteResult>;
  cancel(input: Mutation & { command: Extract<Command, { operation: "cancel" }> }): Promise<WriteResult>;
  listCheckedPointers(creatorId: string, planId: string): Promise<PointerReadResult>;
  putCheckedPointer(creatorId: string, planId: string, pointer: StepPointer): Promise<PointerWriteResult>;
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const hasExactKeys = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const validId = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 160 && v.trim() === v;
const validIso = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const safeRowIso = (v: Date | string): string | null => { try { return validIso(v instanceof Date ? v.toISOString() : new Date(v).toISOString()) ? (v instanceof Date ? v.toISOString() : new Date(v).toISOString()) : null; } catch { return null; } };
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (!record(v)) return JSON.stringify(v) ?? "null";
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
};
const digest = (v: unknown) => createHash("sha256").update(canonical(v), "utf8").digest("hex");
const utf8Size = (v: unknown) => new TextEncoder().encode(canonical(v)).byteLength;
const toInputJson = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const asDate = (v: Date | string) => v instanceof Date ? v.toISOString() : new Date(v).toISOString();
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const knownOperation = (op: unknown): op is Command["operation"] => ["create", "revise_ai", "revise_manual", "approve", "cancel"].includes(String(op));

function validateCommand(command: unknown): command is Command {
  if (!record(command) || !knownOperation(command.operation)) return false;
  const op = command.operation;
  if (op === "create") {
    const required = ["operation", "latestRequest", "selectedPostIds", "selectedMediaIds"];
    if (!(hasExactKeys(command, required) || hasExactKeys(command, [...required, "selectedTemplateIds"]))) return false;
  } else if (op === "revise_ai") {
    const required = ["operation", "planId", "baseRevision", "latestRequest", "selectedPostIds", "selectedMediaIds"];
    const allowedKeys = [...required, "selectedTemplateIds", "targetHandleRefs"];
    const presentKeys = Object.keys(command);
    if (!required.every(key => Object.hasOwn(command, key)) || presentKeys.some(key => !allowedKeys.includes(key))) return false;
    if (!validId(command.planId) || !Number.isSafeInteger(command.baseRevision) || (command.baseRevision as number) < 0) return false;
    if (command.targetHandleRefs !== undefined && (!Array.isArray(command.targetHandleRefs) || command.targetHandleRefs.length > 32 || command.targetHandleRefs.some(x => !record(x) || !hasExactKeys(x, ["handle"]) || typeof x.handle !== "string" || !x.handle.trim() || x.handle.length > 100) || new Set(command.targetHandleRefs.map(x => (x as TargetHandleRef).handle)).size !== command.targetHandleRefs.length)) return false;
  } else if (op === "revise_manual") {
    if (!hasExactKeys(command, ["operation", "planId", "baseRevision", "patch"]) || !validId(command.planId) || !Number.isSafeInteger(command.baseRevision) || (command.baseRevision as number) < 0 || !Array.isArray(command.patch) || command.patch.length < 1 || command.patch.length > 128) return false;
    const seen = new Set<string>();
    for (const patch of command.patch) {
      if (!record(patch) || !validId(patch.step_id) || !["title", "note", "enabled", "time"].includes(String(patch.field)) || !Object.hasOwn(patch, "value") || !hasExactKeys(patch, ["step_id", "field", "value"])) return false;
      if (seen.has(`${patch.step_id}:${patch.field}`)) return false;
      seen.add(`${patch.step_id}:${patch.field}`);
      if (patch.field === "note" && !(patch.value === null || (typeof patch.value === "string" && patch.value.length <= 2000))) return false;
      if (patch.field === "enabled" && typeof patch.value !== "boolean") return false;
      if (patch.field === "title" && !record(patch.value)) return false;
      if (patch.field === "time" && patch.value !== null && !record(patch.value)) return false;
    }
  } else {
    if (!hasExactKeys(command, ["operation", "planId", "baseRevision"]) || !validId(command.planId) || !Number.isSafeInteger(command.baseRevision) || (command.baseRevision as number) < 0) return false;
  }
  if (op === "create" || op === "revise_ai") {
    if (typeof command.latestRequest !== "string" || !command.latestRequest.trim() || command.latestRequest.length > MAX_REQUEST) return false;
    for (const key of ["selectedPostIds", "selectedMediaIds"] as const) {
      const ids = command[key];
      if (!Array.isArray(ids) || ids.length > MAX_SELECTION || ids.some(x => !validId(x)) || new Set(ids).size !== ids.length) return false;
    }
    if (command.selectedTemplateIds !== undefined && (!Array.isArray(command.selectedTemplateIds) || command.selectedTemplateIds.length > MAX_TEMPLATE_SELECTION || command.selectedTemplateIds.some(id => !validId(id) || id.length > 160) || new Set(command.selectedTemplateIds).size !== command.selectedTemplateIds.length)) return false;
  }
  return utf8Size(command) <= MAX_COMMAND_BYTES;
}

function requestHash(input: Mutation): string | null {
  if (!validId(input.creatorId) || !validId(input.clientMutationKey) || input.clientMutationKey.length > MAX_KEY || !validateCommand(input.command)) return null;
  const command = input.command;
  let normalized: Command = command;
  if (command.operation === "create") {
    const { selectedTemplateIds, ...withoutTemplateSelection } = command;
    normalized = selectedTemplateIds?.length ? { ...withoutTemplateSelection, selectedTemplateIds } : withoutTemplateSelection;
  } else if (command.operation === "revise_ai") {
    const { selectedTemplateIds, ...withoutTemplateSelection } = command;
    const withNormalizedHandles = { ...withoutTemplateSelection, targetHandleRefs: command.targetHandleRefs ?? [] };
    normalized = selectedTemplateIds?.length ? { ...withNormalizedHandles, selectedTemplateIds } : withNormalizedHandles;
  }
  return digest({ v: 1, creatorId: input.creatorId, operation: command.operation, command: normalized });
}

function rowSnapshot(raw: unknown, creatorId: string): { kind: "ok"; row: PlanRow; snapshot: PlanSnapshot } | RepoError {
  if (!record(raw)) return { kind: "invalid_snapshot", code: "row_missing" };
  const row = raw as unknown as PlanRow;
  const shape = validatePlanShape(row.snapshot);
  if (!shape.ok) return { kind: "invalid_snapshot", code: "shape_invalid" };
  const snapshot = shape.value;
  const createdAt = safeRowIso(row.createdAt), updatedAt = safeRowIso(row.updatedAt);
  if (row.creatorId !== creatorId || row.id !== snapshot.plan_id || snapshot.creator_id !== creatorId || row.schemaVersion !== PLAN_SCHEMA_VERSION || snapshot.schema_version !== row.schemaVersion || row.revision !== snapshot.revision || row.review !== snapshot.review || !same(row.sourceRef, snapshot.source) || createdAt !== snapshot.created_at || updatedAt !== snapshot.updated_at) return { kind: "invalid_snapshot", code: "projection_mismatch" };
  return { kind: "ok", row, snapshot };
}

function applyManualPatches(current: PlanSnapshot, patches: readonly ManualFieldPatch[]): PlanSnapshot | null {
  const next = structuredClone(current);
  for (const patch of patches) {
    const step = next.steps.find(s => s.step_id === patch.step_id);
    if (!step) return null;
    if (patch.field === "title") {
      step.title = structuredClone(patch.value);
      if (step.capability === "prepare_distribution") step.copy_title = structuredClone(patch.value);
    }
    else if (patch.field === "note") step.note = patch.value;
    else if (patch.field === "enabled") step.enabled = patch.value;
    else step.time = structuredClone(patch.value);
  }
  return next;
}

function createLivePointerResolver() {
  const matchingStoredPointer = async (client: PersistenceTransaction, planId: string, creatorId: string, nodeId: string, slot: StepPointer["slot"]): Promise<PointerRow | null> => {
    const row = await client.creatorConversationalPlanPointer.findFirst({ where: { planId, creatorId, nodeId, slot } });
    return row ? row as unknown as PointerRow : null;
  };
  const resolvePointer = async (client: PersistenceTransaction, planId: string, creatorId: string, snapshot: PlanSnapshot, row: PointerRow, depth = 0): Promise<AuthorityResult> => {
    if (depth > 4 || row.planId !== planId || row.creatorId !== creatorId) return { kind: "authority_gap", code: "pointer_scope_or_chain_invalid" };
    const pointer: StepPointer = { node_id: row.nodeId, kind: row.authorityKind, authority_id: row.authorityId, slot: row.slot };
    // The map is only the pure helper's shape input; each switch arm below queries and verifies the live authority.
    const shape = validateStepPointer(pointer, creatorId, new Map([[pointer.authority_id, { creator_id: creatorId, kind: pointer.kind }]]));
    if (!shape.ok) return { kind: "authority_gap", code: shape.issues[0]?.code ?? "pointer_shape_invalid" };
    const step = snapshot.steps.find(s => s.step_id === pointer.node_id);
    const gap = (code: string): AuthorityResult => ({ kind: "authority_gap", code });
    const directPost = async (postId: string) => client.post.findFirst({ where: { id: postId, creatorId }, select: { id: true, creatorId: true } });
    const draftForStep = async (stepId: string): Promise<AuthorityResult | null> => {
      const draftPointer = await matchingStoredPointer(client, planId, creatorId, stepId, "draft");
      if (!draftPointer) return null;
      return resolvePointer(client, planId, creatorId, snapshot, draftPointer, depth + 1);
    };
    switch (pointer.slot) {
      case "draft": {
        if (!step || step.capability !== "prepare_post_draft" || pointer.kind !== "autopost_draft") return gap("draft_node_mismatch");
        const authority = await client.autopostDraft.findFirst({ where: { id: pointer.authority_id, creatorId }, select: { id: true, creatorId: true, conversationalStepKey: true, publishedPostId: true } }) as unknown as Record<string, unknown> | null;
        if (!authority || authority.conversationalStepKey !== `plan:${planId}:step:${step.step_id}`) return gap("draft_owner_or_correlation_mismatch");
        return { kind: "ok", pointer: shape.value, authority };
      }
      case "attention_event": {
        if (!step || step.capability !== "prepare_post_draft" || pointer.kind !== "schedule_event") return gap("attention_event_node_mismatch");
        const authority = await client.creatorScheduleEvent.findFirst({ where: { id: pointer.authority_id, creatorId }, select: { id: true, creatorId: true, conversationalStepKey: true, eventType: true, destination: true, postId: true } }) as unknown as Record<string, unknown> | null;
        if (!authority || authority.conversationalStepKey !== `plan:${planId}:step:${step.step_id}` || authority.eventType !== "make_post" || authority.destination !== "patreon") return gap("attention_event_owner_or_correlation_mismatch");
        let expectedPostId: string | null;
        if (snapshot.source.kind === "existing_post") {
          if (!snapshot.source.post_id || step.target_post_id !== snapshot.source.post_id || !(await directPost(snapshot.source.post_id))) return gap("attention_event_source_post_mismatch");
          const sourcePointer = await matchingStoredPointer(client, planId, creatorId, step.step_id, "relay_post");
          if (!sourcePointer) return gap("attention_event_source_pointer_missing");
          const sourceOutput = await resolvePointer(client, planId, creatorId, snapshot, sourcePointer, depth + 1);
          if (sourceOutput.kind !== "ok" || sourceOutput.pointer.kind !== "relay_post" || sourceOutput.pointer.authority_id !== snapshot.source.post_id) return gap("attention_event_source_pointer_mismatch");
          expectedPostId = snapshot.source.post_id;
        } else {
          const sourcePointer = await matchingStoredPointer(client, planId, creatorId, step.step_id, "draft");
          if (!sourcePointer) return gap("attention_event_source_pointer_missing");
          const sourceOutput = await resolvePointer(client, planId, creatorId, snapshot, sourcePointer, depth + 1);
          if (sourceOutput.kind !== "ok" || sourceOutput.pointer.kind !== "autopost_draft") return gap("attention_event_source_pointer_mismatch");
          const draft = sourceOutput.authority;
          if (!draft || draft.creatorId !== creatorId || draft.conversationalStepKey !== `plan:${planId}:step:${step.step_id}` || draft.publishedPostId) return gap("attention_event_staged_draft_missing_or_published");
          expectedPostId = null;
        }
        if (authority.postId !== expectedPostId) return gap("attention_event_parent_mismatch");
        return { kind: "ok", pointer: shape.value, authority };
      }
      case "engagement_event":
        if (!step || (step.capability !== "reply_block" && step.capability !== "engagement_check")) return gap("engagement_event_node_mismatch");
        return gap("schedule_event_mapping_unaccepted");
      case "preview_media":
        if (!step || step.capability !== "prepare_preview") return gap("preview_media_node_mismatch");
        return gap("preview_export_provenance_unaccepted");
      case "relay_post": {
        if (!step || step.capability !== "prepare_post_draft" || pointer.kind !== "relay_post") return gap("relay_post_node_mismatch");
        const authority = await directPost(pointer.authority_id) as unknown as Record<string, unknown> | null;
        if (!authority) return gap("relay_post_missing_or_foreign");
        if (snapshot.source.kind === "existing_post" && snapshot.source.post_id === pointer.authority_id) return { kind: "ok", pointer: shape.value, authority };
        const draft = await draftForStep(step.step_id);
        if (!draft || draft.kind !== "ok" || draft.authority.publishedPostId !== pointer.authority_id) return gap("relay_post_not_source_or_draft_output");
        return { kind: "ok", pointer: shape.value, authority };
      }
      case "distribution_plan": {
        const group = snapshot.distribution_groups.find(g => g.group_id === pointer.node_id);
        if (!group || pointer.kind !== "distribution_plan") return gap("distribution_plan_group_mismatch");
        const authority = await client.postDistributionPlan.findFirst({ where: { id: pointer.authority_id, creatorId }, select: { id: true, creatorId: true, conversationalGroupKey: true, postId: true, sourceDraftId: true } }) as unknown as Record<string, unknown> | null;
        if (!authority || authority.conversationalGroupKey !== `plan:${planId}:group:${group.group_id}`) return gap("distribution_plan_owner_or_correlation_mismatch");
        const postId = snapshot.source.kind === "existing_post" ? snapshot.source.post_id : null;
        let expectedPostId = postId;
        if (!expectedPostId) {
          const relayPointer = await matchingStoredPointer(client, planId, creatorId, group.source_step_id, "relay_post");
          if (!relayPointer) return gap("distribution_plan_source_pointer_missing");
          const relay = await resolvePointer(client, planId, creatorId, snapshot, relayPointer, depth + 1);
          if (relay.kind !== "ok") return relay;
          expectedPostId = relay.pointer.authority_id;
        }
        if (authority.postId !== expectedPostId || !(await directPost(expectedPostId))) return gap("distribution_plan_source_post_mismatch");
        if (authority.sourceDraftId !== null && authority.sourceDraftId !== undefined) {
          const draft = await draftForStep(group.source_step_id);
          if (!draft || draft.kind !== "ok" || draft.pointer.authority_id !== authority.sourceDraftId) return gap("distribution_plan_source_draft_mismatch");
        }
        return { kind: "ok", pointer: shape.value, authority };
      }
      case "variant": {
        if (!step || step.capability !== "prepare_distribution" || pointer.kind !== "distribution_variant") return gap("variant_node_mismatch");
        const group = snapshot.distribution_groups.find(g => g.group_id === step.distribution_group_id);
        if (!group || group.destination_step_ids.filter(id => id === step.step_id).length !== 1) return gap("variant_group_membership_mismatch");
        const planPointer = await matchingStoredPointer(client, planId, creatorId, group.group_id, "distribution_plan");
        if (!planPointer) return gap("variant_distribution_plan_pointer_missing");
        const parent = await resolvePointer(client, planId, creatorId, snapshot, planPointer, depth + 1);
        if (parent.kind !== "ok") return parent;
        const authority = await client.postDistributionVariant.findFirst({ where: { id: pointer.authority_id, creatorId }, select: { id: true, creatorId: true, planId: true, postId: true, destination: true } }) as unknown as Record<string, unknown> | null;
        if (!authority || authority.planId !== parent.pointer.authority_id || authority.postId !== parent.authority.postId || authority.destination !== step.destination) return gap("variant_parent_or_destination_mismatch");
        return { kind: "ok", pointer: shape.value, authority };
      }
      case "current_attempt": {
        if (!step || step.capability !== "publish_handoff" || pointer.kind !== "distribution_attempt") return gap("attempt_node_mismatch");
        const distributionStep = snapshot.steps.find(s => s.step_id === step.distribution_step_id);
        if (!distributionStep || distributionStep.capability !== "prepare_distribution" || distributionStep.destination !== step.destination) return gap("attempt_distribution_step_mismatch");
        const variantPointer = await matchingStoredPointer(client, planId, creatorId, distributionStep.step_id, "variant");
        if (!variantPointer) return gap("attempt_variant_pointer_missing");
        const variant = await resolvePointer(client, planId, creatorId, snapshot, variantPointer, depth + 1);
        if (variant.kind !== "ok") return variant;
        const authority = await client.postDistributionAttempt.findFirst({ where: { id: pointer.authority_id, creatorId }, select: { id: true, creatorId: true, variantId: true, postId: true, destination: true } }) as unknown as Record<string, unknown> | null;
        if (!authority || authority.variantId !== variant.pointer.authority_id || authority.postId !== variant.authority.postId || authority.destination !== step.destination) return gap("attempt_parent_or_destination_mismatch");
        return { kind: "ok", pointer: shape.value, authority };
      }
      default: {
        const exhaustive: never = pointer.slot;
        return gap(`unsupported_pointer_slot:${String(exhaustive)}`);
      }
    }
  };
  const checkPointers = async (client: PersistenceTransaction, creatorId: string, planId: string, snapshot: PlanSnapshot): Promise<PointerReadResult> => {
    const rows = await client.creatorConversationalPlanPointer.findMany({ where: { planId, creatorId }, orderBy: [{ nodeId: "asc" }, { slot: "asc" }, { id: "asc" }] });
    if (!Array.isArray(rows)) throw new Error("Unexpected pointer query result");
    const pointers: StepPointer[] = [];
    for (const raw of rows) {
      if (!record(raw)) return { kind: "authority_gap", code: "pointer_row_corrupt" };
      const resolved = await resolvePointer(client, planId, creatorId, snapshot, raw as unknown as PointerRow);
      if (resolved.kind !== "ok") return resolved;
      pointers.push(resolved.pointer);
    }
    return { kind: "ok", pointers };
  };

  return { matchingStoredPointer, resolvePointer, checkPointers };
}

function uniqueError(error: unknown): boolean { return record(error) && error.code === "P2002"; }

export function createConversationalPlanRepository(db: PersistenceDb, loadContext: ContextLoader): ConversationalPlanRepository {
  const tenantExists = async (creatorId: string) => !!await db.tenant.findFirst({ where: { relayCreatorId: creatorId }, select: { id: true } });
  const contextValidate = async (creatorId: string, snapshot: PlanSnapshot): Promise<RepoError | null> => {
    // Loader errors are infrastructure failures and must remain visible to the caller.
    const loaded = await loadContext(creatorId, snapshot);
    if (loaded.context.authenticatedCreatorId !== creatorId || loaded.sourceFingerprint !== snapshot.source.source_revision || loaded.context.currentSourceRevision !== loaded.sourceFingerprint) return { kind: "stale_source", code: "source_fingerprint_mismatch" };
    const checked = validatePlanWithContext(snapshot, loaded.context);
    return checked.ok ? null : { kind: "invalid_snapshot", code: checked.issues[0]?.code ?? "context_invalid" };
  };

  const { matchingStoredPointer, resolvePointer, checkPointers } = createLivePointerResolver();
  const loadCurrent = async (creatorId: string, planId: string, client: PersistenceTransaction = db): Promise<{ row: PlanRow; snapshot: PlanSnapshot; pointers: readonly CheckedPointer[] } | RepoError> => {
    const raw = await client.creatorConversationalPlan.findFirst({ where: { id: planId, creatorId } });
    if (!raw) return { kind: "not_found" };
    const checked = rowSnapshot(raw, creatorId);
    if (checked.kind !== "ok") return checked;
    const contextError = await contextValidate(creatorId, checked.snapshot);
    if (contextError) return contextError;
    const pointers = await checkPointers(client, creatorId, planId, checked.snapshot);
    if (pointers.kind !== "ok") return pointers;
    return { row: checked.row, snapshot: checked.snapshot, pointers: pointers.pointers };
  };
  const revisionLookup = (creatorId: string, key: string) => db.creatorConversationalPlanRevision.findFirst({ where: { creatorId, clientMutationKey: key } });
  const replayByHash = async (input: Mutation, hash: string): Promise<ReplayResult> => {
    const key = input.clientMutationKey;
    const [revision, createRow] = await Promise.all([
      revisionLookup(input.creatorId, key),
      db.creatorConversationalPlan.findFirst({ where: { creatorId: input.creatorId, clientCreateKey: key } })
    ]);
    if (!revision && !createRow) return { kind: "new" };
    if (!revision || !record(revision)) return { kind: "idempotency_conflict" };
    const rev = revision as unknown as RevisionRow;
    if (rev.requestHash !== hash || !Number.isSafeInteger(rev.revision) || !validId(rev.planId) || rev.creatorId !== input.creatorId) return { kind: "idempotency_conflict" };
    const historical = validatePlanShape(rev.snapshot);
    if (!historical.ok || historical.value.revision !== rev.revision || historical.value.plan_id !== rev.planId || historical.value.creator_id !== input.creatorId) return { kind: "invalid_snapshot", code: "revision_corrupt" };
    const currentResult = await loadCurrent(input.creatorId, rev.planId);
    if ("kind" in currentResult) return currentResult;
    if (createRow && (!record(createRow) || (createRow as unknown as PlanRow).id !== rev.planId || (input.command.operation !== "create" && (createRow as unknown as PlanRow).clientCreateKey === key))) return { kind: "idempotency_conflict" };
    return { kind: "replay", recordedRevision: rev.revision, current: currentResult.snapshot, pointers: currentResult.pointers };
  };
  const boundedReplay = async (input: Mutation, hash: string): Promise<ReplayResult> => {
    for (let i = 0; i <= RACE_REREADS; i++) {
      const result = await replayByHash(input, hash);
      if (result.kind !== "new") return result;
    }
    return { kind: "new" };
  };
  const ensureNoExistingKey = async (input: Mutation, hash: string): Promise<ReplayResult | null> => {
    const replay = await boundedReplay(input, hash);
    return replay.kind === "new" ? null : replay;
  };
  const replayWrite = (replay: ReplayResult): WriteResult => replay.kind === "replay"
    ? { kind: "ok", current: replay.current, recordedRevision: replay.recordedRevision, pointers: replay.pointers }
    : replay.kind === "new" ? { kind: "idempotency_conflict" } : replay;
  const writeReview = async (input: Mutation, op: "approve" | "cancel"): Promise<WriteResult> => {
    if (input.command.operation !== op) return { kind: "invalid_snapshot", code: "invalid_command" };
    const hash = requestHash(input); if (!hash) return { kind: "invalid_snapshot", code: "invalid_command" };
    if (!await tenantExists(input.creatorId)) return { kind: "creator_not_provisioned" };
    const replay = await ensureNoExistingKey(input, hash); if (replay) return replayWrite(replay);
    const command = input.command as Extract<Command, { operation: "approve" | "cancel" }>;
    const currentResult = await loadCurrent(input.creatorId, command.planId);
    if ("kind" in currentResult) return currentResult;
    const { row, snapshot } = currentResult;
    if (snapshot.revision !== command.baseRevision) return { kind: "revision_conflict", current: snapshot };
    if (op === "approve" && snapshot.review !== "proposed") return { kind: "revision_conflict", current: snapshot };
    if (op === "cancel" && snapshot.review === "cancelled") return { kind: "revision_conflict", current: snapshot };
    const next = { ...snapshot, revision: snapshot.revision + 1, review: (op === "approve" ? "approved_for_preparation" : "cancelled") as PlanReview, updated_at: new Date().toISOString() };
    return acceptRevision(input, hash, row, next);
  };
  const acceptRevision = async (input: Mutation, hash: string, row: PlanRow, next: PlanSnapshot): Promise<WriteResult> => {
    const errors = validatePlanShape(next); if (!errors.ok) return { kind: "invalid_snapshot", code: errors.issues[0]?.code ?? "shape_invalid" };
    const contextError = await contextValidate(input.creatorId, next); if (contextError) return contextError;
    const checkedPointers = await checkPointers(db, input.creatorId, row.id, next);
    if (checkedPointers.kind !== "ok") return checkedPointers;
    try {
      const result = await db.$transaction(async tx => {
        const inside = await tx.creatorConversationalPlanRevision.findFirst({ where: { creatorId: input.creatorId, clientMutationKey: input.clientMutationKey } });
        if (inside) return { replayCheck: true as const };
        const updated = await tx.creatorConversationalPlan.updateMany({ where: { id: row.id, creatorId: input.creatorId, revision: row.revision }, data: { schemaVersion: next.schema_version, revision: next.revision, review: next.review, sourceRef: toInputJson(next.source), snapshot: toInputJson(next), updatedAt: new Date(next.updated_at) } });
        if (!updated.count) return { casLost: true as const };
        await tx.creatorConversationalPlanRevision.create({ data: { planId: row.id, creatorId: input.creatorId, revision: next.revision, clientMutationKey: input.clientMutationKey, requestHash: hash, snapshot: toInputJson(next) } });
        return { saved: true as const };
      });
      if ("replayCheck" in result) {
        const winner = await boundedReplay(input, hash);
        return replayWrite(winner);
      }
      if ("casLost" in result) {
        const latest = await loadCurrent(input.creatorId, row.id);
        return "kind" in latest ? latest : { kind: "revision_conflict", current: latest.snapshot };
      }
      return { kind: "ok", current: next, recordedRevision: next.revision, pointers: checkedPointers.pointers };
    } catch (error) {
      if (!uniqueError(error)) throw error;
      const winner = await boundedReplay(input, hash);
      return replayWrite(winner);
    }
  };

  return {
    async lookupReplay(input) {
      const hash = requestHash(input); if (!hash) return { kind: "invalid_snapshot", code: "invalid_command" };
      if (!await tenantExists(input.creatorId)) return { kind: "creator_not_provisioned" };
      return boundedReplay(input, hash);
    },
    async create(input) {
      if (input.command.operation !== "create") return { kind: "invalid_snapshot", code: "invalid_command" };
      const hash = requestHash(input); if (!hash) return { kind: "invalid_snapshot", code: "invalid_command" };
      if (!await tenantExists(input.creatorId)) return { kind: "creator_not_provisioned" };
      const replay = await ensureNoExistingKey(input, hash); if (replay) return replayWrite(replay);
      const snapshot = input.snapshot;
      const valid = validatePlanShape(snapshot);
      if (!valid.ok || snapshot.creator_id !== input.creatorId || snapshot.plan_id === "" || snapshot.schema_version !== PLAN_SCHEMA_VERSION || snapshot.revision !== 0 || snapshot.review !== "proposed") return { kind: "invalid_snapshot", code: "create_snapshot_invalid" };
      const loaded = await contextValidate(input.creatorId, snapshot); if (loaded) return loaded;
      try {
        await db.$transaction(async tx => {
          const prior = await tx.creatorConversationalPlan.findFirst({ where: { creatorId: input.creatorId, clientCreateKey: input.clientMutationKey } });
          if (prior) throw Object.assign(new Error("create key race"), { code: "P2002" });
          await tx.creatorConversationalPlan.create({ data: { id: snapshot.plan_id, creatorId: input.creatorId, schemaVersion: snapshot.schema_version, revision: 0, review: snapshot.review, sourceRef: toInputJson(snapshot.source), snapshot: toInputJson(snapshot), clientCreateKey: input.clientMutationKey, createdAt: new Date(snapshot.created_at), updatedAt: new Date(snapshot.updated_at) } });
          await tx.creatorConversationalPlanRevision.create({ data: { planId: snapshot.plan_id, creatorId: input.creatorId, revision: 0, clientMutationKey: input.clientMutationKey, requestHash: hash, snapshot: toInputJson(snapshot), createdAt: new Date(snapshot.created_at) } });
        });
        return { kind: "ok", current: snapshot, recordedRevision: 0, pointers: [] };
      } catch (error) {
        if (!uniqueError(error)) throw error;
        const winner = await boundedReplay(input, hash);
        return replayWrite(winner);
      }
    },
    async get(creatorId, planId) {
      if (!validId(creatorId) || !validId(planId)) return { kind: "not_found" };
      if (!await tenantExists(creatorId)) return { kind: "creator_not_provisioned" };
      const loaded = await loadCurrent(creatorId, planId);
      return "kind" in loaded ? loaded : { kind: "ok", current: loaded.snapshot, pointers: loaded.pointers };
    },
    async listCurrent(creatorId, page) {
      if (!record(page) || !["limit", "cursor"].every(k => Object.hasOwn(page, k) || (k === "cursor" && !Object.hasOwn(page, k))) || Object.keys(page).some(k => !["limit", "cursor"].includes(k)) || !validId(creatorId) || !Number.isInteger(page.limit) || page.limit < 1 || page.limit > PAGE_MAX || (page.cursor && (!record(page.cursor) || !hasExactKeys(page.cursor, ["updatedAt", "id"]) || !validIso(page.cursor.updatedAt) || !validId(page.cursor.id)))) return { kind: "invalid_snapshot", code: "invalid_page" };
      if (!await tenantExists(creatorId)) return { kind: "creator_not_provisioned" };
      const where = { creatorId, ...(page.cursor ? { OR: [{ updatedAt: { lt: new Date(page.cursor.updatedAt) } }, { updatedAt: new Date(page.cursor.updatedAt), id: { lt: page.cursor.id } }] } : {}) };
      const rows = await db.creatorConversationalPlan.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: page.limit + 1 });
      if (!Array.isArray(rows)) throw new Error("Unexpected plan list result");
      const items: PlanSnapshot[] = [];
      for (const raw of rows.slice(0, page.limit)) {
        const checked = rowSnapshot(raw, creatorId); if (checked.kind !== "ok") return checked;
        const contextError = await contextValidate(creatorId, checked.snapshot); if (contextError) return contextError;
        const pointers = await checkPointers(db, creatorId, checked.row.id, checked.snapshot);
        if (pointers.kind !== "ok") return pointers;
        items.push(checked.snapshot);
      }
      const more = rows.length > page.limit;
      const tail = rows[Math.min(page.limit, rows.length) - 1] as PlanRow | undefined;
      return { kind: "ok", items, nextCursor: more && tail ? { updatedAt: asDate(tail.updatedAt), id: tail.id } : null };
    },
    async revise(input) {
      if (input.command.operation !== "revise_ai" && input.command.operation !== "revise_manual") return { kind: "invalid_snapshot", code: "invalid_command" };
      const hash = requestHash(input); if (!hash) return { kind: "invalid_snapshot", code: "invalid_command" };
      if (!await tenantExists(input.creatorId)) return { kind: "creator_not_provisioned" };
      const replay = await ensureNoExistingKey(input, hash); if (replay) return replayWrite(replay);
      const command = input.command, loaded = await loadCurrent(input.creatorId, command.planId);
      if ("kind" in loaded) return loaded;
      if (loaded.snapshot.revision !== command.baseRevision) return { kind: "revision_conflict", current: loaded.snapshot };
      const candidate = input.candidate;
      const candidateShape = validatePlanShape(candidate);
      if (!candidateShape.ok) return { kind: "invalid_snapshot", code: candidateShape.issues[0]?.code ?? "shape_invalid" };
      if (loaded.snapshot.review !== "proposed" || candidate.plan_id !== loaded.snapshot.plan_id || candidate.creator_id !== input.creatorId || candidate.created_at !== loaded.snapshot.created_at || !same(candidate.source, loaded.snapshot.source) || candidate.revision !== command.baseRevision + 1 || candidate.review !== loaded.snapshot.review) return { kind: "invalid_snapshot", code: "revision_identity_mismatch" };
      if (command.operation === "revise_manual") {
        const expected = applyManualPatches(loaded.snapshot, command.patch);
        if (!expected || !same({ ...expected, revision: candidate.revision, updated_at: candidate.updated_at }, candidate)) return { kind: "invalid_snapshot", code: "manual_patch_candidate_mismatch" };
      }
      return acceptRevision(input, hash, loaded.row, candidate);
    },
    approve(input) { return writeReview(input, "approve"); },
    cancel(input) { return writeReview(input, "cancel"); },
    async listCheckedPointers(creatorId, planId) {
      if (!validId(creatorId) || !validId(planId)) return { kind: "not_found" };
      if (!await tenantExists(creatorId)) return { kind: "creator_not_provisioned" };
      const loaded = await loadCurrent(creatorId, planId);
      return "kind" in loaded ? loaded : { kind: "ok", pointers: loaded.pointers };
    },
    async putCheckedPointer(creatorId, planId, pointer) {
      if (!validId(creatorId) || !validId(planId)) return { kind: "not_found" };
      if (!record(pointer) || !validId(pointer.node_id) || !validId(pointer.authority_id) || typeof pointer.kind !== "string" || typeof pointer.slot !== "string") return { kind: "invalid_snapshot", code: "pointer_input_invalid" };
      const pointerShape = validateStepPointer(pointer, creatorId, new Map([[pointer.authority_id, { creator_id: creatorId, kind: pointer.kind }]]));
      if (!pointerShape.ok) return { kind: "invalid_snapshot", code: pointerShape.issues[0]?.code ?? "pointer_input_invalid" };
      if (!await tenantExists(creatorId)) return { kind: "creator_not_provisioned" };
      const loaded = await loadCurrent(creatorId, planId);
      if ("kind" in loaded) return loaded;
      if (loaded.snapshot.review !== "approved_for_preparation") return { kind: "revision_conflict", current: loaded.snapshot, code: "plan_not_approved" };
      const sameSlot = loaded.pointers.find(p => p.node_id === pointer.node_id && p.slot === pointer.slot);
      if (sameSlot) return sameSlot.kind === pointer.kind && sameSlot.authority_id === pointer.authority_id
        ? { kind: "ok", current: loaded.snapshot, pointer: sameSlot, pointers: loaded.pointers }
        : { kind: "pointer_conflict", current: loaded.snapshot, code: "occupied_slot_immutable" };
      const inputRow: PointerRow = { id: "new", planId, creatorId, nodeId: pointer.node_id, slot: pointer.slot, authorityKind: pointer.kind, authorityId: pointer.authority_id, createdAt: new Date() };
      try {
        const inserted = await db.$transaction(async tx => {
          const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM public.creator_conversational_plans WHERE id = ${planId} AND creator_id = ${creatorId} AND revision = ${loaded.snapshot.revision} AND review = 'approved_for_preparation' FOR UPDATE`);
          if (!locked.length) return { lost: true as const };
          const existing = await matchingStoredPointer(tx, planId, creatorId, pointer.node_id, pointer.slot);
          if (existing) {
            if (existing.authorityId !== pointer.authority_id || existing.authorityKind !== pointer.kind) return { conflict: true as const };
            const checkedExisting = await resolvePointer(tx, planId, creatorId, loaded.snapshot, existing);
            return checkedExisting.kind === "ok" ? { existing: checkedExisting.pointer } : { error: checkedExisting };
          }
          const checked = await resolvePointer(tx, planId, creatorId, loaded.snapshot, inputRow);
          if (checked.kind !== "ok") return { error: checked };
          await tx.creatorConversationalPlanPointer.create({ data: { planId, creatorId, nodeId: checked.pointer.node_id, slot: checked.pointer.slot, authorityKind: checked.pointer.kind, authorityId: checked.pointer.authority_id } });
          return { inserted: checked.pointer };
        });
        if ("lost" in inserted) {
          const latest = await loadCurrent(creatorId, planId);
          return "kind" in latest ? latest : { kind: "revision_conflict", current: latest.snapshot };
        }
        if ("conflict" in inserted) return { kind: "pointer_conflict", current: loaded.snapshot, code: "occupied_slot_immutable" };
        if ("error" in inserted && inserted.error) return inserted.error;
        const committedPointer = "existing" in inserted ? inserted.existing : "inserted" in inserted ? inserted.inserted : null;
        if (!committedPointer) throw new Error("Pointer transaction completed without an outcome");
        const latest = await loadCurrent(creatorId, planId);
        return "kind" in latest ? latest : { kind: "ok", current: latest.snapshot, pointer: committedPointer, pointers: latest.pointers };
      } catch (error) {
        if (!uniqueError(error)) throw error;
        const latest = await loadCurrent(creatorId, planId);
        if ("kind" in latest) return latest;
        const winner = latest.pointers.find(p => p.node_id === pointer.node_id && p.slot === pointer.slot);
        if (winner && winner.kind === pointer.kind && winner.authority_id === pointer.authority_id) return { kind: "ok", current: latest.snapshot, pointer: winner, pointers: latest.pointers };
        return { kind: "pointer_conflict", current: latest.snapshot, code: winner ? "occupied_slot_immutable" : "unique_race_winner_unavailable" };
      }
    }
  };
}

/** Transaction-bound preparation writer. Every authority write is derived from the locked approved snapshot. */
export function createConversationalPreparationRepository(
  db: Pick<PrismaClient, "$transaction">
): ConversationalPreparationRepository {
  const livePointers = createLivePointerResolver();
  const validInput = (value: unknown): value is PrepareOutputInput => record(value) &&
    hasExactKeys(value, ["creatorId", "planId", "approvedRevision", "stepId", "output"]) &&
    validId(value.creatorId) && validId(value.planId) && validId(value.stepId) &&
    typeof value.approvedRevision === "number" && Number.isSafeInteger(value.approvedRevision) && value.approvedRevision >= 0 &&
    ["relay_post", "draft", "attention_event"].includes(String(value.output));

  const blocked = (code: PreparationBlockCode): Extract<PrepareOutputResult, { kind: "blocked" }> => ({ kind: "blocked", code });
  const conflict = (code: Extract<PrepareOutputResult, { kind: "conflict" }>["code"]): Extract<PrepareOutputResult, { kind: "conflict" }> => ({ kind: "conflict", code });
  const unavailable = (code: Extract<PrepareOutputResult, { kind: "unavailable" }>["code"]): Extract<PrepareOutputResult, { kind: "unavailable" }> => ({ kind: "unavailable", code });
  const isCanonicalUtc = (value: unknown): value is string => typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

  type UnitResult = { kind: "committed"; pointer: StepPointer; reused: boolean } | PrepareOutputResult;
  const transact = async (input: PrepareOutputInput, recoverOnly = false): Promise<UnitResult> => db.$transaction(async tx => {
    const tenant = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "public"."tenants" WHERE "relay_creator_id" = ${input.creatorId} FOR UPDATE`);
    if (!tenant.length) return unavailable("creator_not_provisioned");
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "public"."creator_conversational_plans" WHERE "id" = ${input.planId} AND "creator_id" = ${input.creatorId} FOR UPDATE`);
    if (!locked.length) return unavailable("not_found");
    const raw = await tx.creatorConversationalPlan.findFirst({ where: { id: input.planId, creatorId: input.creatorId } });
    if (!raw) return unavailable("not_found");
    const checked = rowSnapshot(raw, input.creatorId);
    if (checked.kind !== "ok") return unavailable("invalid_snapshot");
    const snapshot = checked.snapshot;
    if (snapshot.revision !== input.approvedRevision || snapshot.review !== "approved_for_preparation") return conflict("approved_revision_conflict");
    const context = createPlanningContextSource(tx);
    const loaded = await context.loadContext(input.creatorId, snapshot);
    if (loaded.context.authenticatedCreatorId !== input.creatorId || loaded.sourceFingerprint !== snapshot.source.source_revision || loaded.context.currentSourceRevision !== loaded.sourceFingerprint) return conflict("stale_source");
    const contextual = validatePlanWithContext(snapshot, loaded.context);
    if (!contextual.ok) return unavailable("invalid_snapshot");
    const currentPointers = await livePointers.checkPointers(tx, input.creatorId, input.planId, snapshot);
    if (currentPointers.kind !== "ok") return conflict("authority_conflict");
    const step = snapshot.steps.find(candidate => candidate.step_id === input.stepId);
    if (!step || step.capability !== "prepare_post_draft") return blocked("source_intent_gap");
    const stepsById = new Map(snapshot.steps.map(candidate => [candidate.step_id, candidate]));
    const dependencyIds = new Set<string>();
    const includeDependencies = (id: string) => {
      if (dependencyIds.has(id)) return;
      dependencyIds.add(id);
      for (const dependency of stepsById.get(id)?.depends_on ?? []) includeDependencies(dependency);
    };
    includeDependencies(step.step_id);
    if ([...dependencyIds].some(id => stepsById.get(id)?.enabled === false)) return blocked("dependency_blocked");
    const relevantClarifications = snapshot.clarifications.filter(clarification => clarification.blocking && clarification.affected_node_ids.some(id => dependencyIds.has(id)));
    const relevantSlotIds = new Set(relevantClarifications.map(clarification => clarification.slot_id));
    if (relevantClarifications.length) return blocked("dependency_blocked");
    const blocksOutput = snapshot.unresolved_requests.some(request => request.blocking_slot_ids.some(slot => {
      const clarification = snapshot.clarifications.find(candidate => candidate.slot_id === slot && candidate.blocking && candidate.affected_node_ids.includes(request.request_id));
      if (!clarification) return false;
      const attachedToDependency = relevantSlotIds.has(slot);
      const sourceScope = (clarification.reason === "ambiguous_source" || clarification.reason === "missing_post") &&
        (request.intended_capability === null || request.intended_capability === step.capability) &&
        (request.intended_destination === null || request.intended_destination === step.intended_destination);
      return attachedToDependency || sourceScope;
    }));
    if (blocksOutput) return blocked("dependency_blocked");
    if (input.output === "draft" && (snapshot.source.kind !== "staged_media" || step.target_post_id !== null)) return blocked("attached_media_reuse_gap");
    if (input.output === "relay_post" && (snapshot.source.kind !== "existing_post" || !snapshot.source.post_id || step.target_post_id !== snapshot.source.post_id)) return blocked("source_intent_gap");
    if (input.output === "attention_event" && snapshot.source.kind === "existing_post" && (!snapshot.source.post_id || step.target_post_id !== snapshot.source.post_id)) return blocked("source_intent_gap");
    if (input.output === "attention_event" && snapshot.source.kind === "staged_media" && step.target_post_id !== null) return blocked("source_intent_gap");
    if (input.output === "attention_event") {
      const sourceSlot = snapshot.source.kind === "existing_post" ? "relay_post" : "draft";
      const sourcePointer = currentPointers.pointers.find(candidate => candidate.node_id === step.step_id && candidate.slot === sourceSlot);
      if (!sourcePointer || (snapshot.source.kind === "existing_post" && (sourcePointer.kind !== "relay_post" || sourcePointer.authority_id !== snapshot.source.post_id)) || (snapshot.source.kind === "staged_media" && sourcePointer.kind !== "autopost_draft")) return blocked("dependency_blocked");
    }
    const stepKey = `plan:${input.planId}:step:${step.step_id}`;
    let pointer: StepPointer;
    let reused = false;
    const pointerRow = await tx.creatorConversationalPlanPointer.findFirst({ where: { planId: input.planId, creatorId: input.creatorId, nodeId: step.step_id, slot: input.output } });
    if (pointerRow) {
      if (!record(pointerRow)) return conflict("pointer_conflict");
      const row = pointerRow as unknown as PointerRow;
      if (row.planId !== input.planId || row.creatorId !== input.creatorId || row.nodeId !== step.step_id || row.slot !== input.output) return conflict("pointer_conflict");
      pointer = { node_id: row.nodeId, kind: row.authorityKind, authority_id: row.authorityId, slot: row.slot };
      const live = await livePointers.resolvePointer(tx, input.planId, input.creatorId, snapshot, row);
      if (live.kind !== "ok" || live.pointer.authority_id !== pointer.authority_id || live.pointer.kind !== pointer.kind) return conflict("authority_conflict");
      reused = true;
    } else if (recoverOnly) {
      if (input.output === "draft") {
        const authority = await tx.autopostDraft.findFirst({ where: { creatorId: input.creatorId, conversationalStepKey: stepKey }, select: { id: true, creatorId: true, conversationalStepKey: true } });
        if (!authority || authority.creatorId !== input.creatorId || authority.conversationalStepKey !== stepKey) return conflict("authority_conflict");
        pointer = { node_id: step.step_id, kind: "autopost_draft", authority_id: authority.id, slot: "draft" };
      } else if (input.output === "attention_event") {
        const authority = await tx.creatorScheduleEvent.findFirst({ where: { creatorId: input.creatorId, conversationalStepKey: stepKey }, select: { id: true, creatorId: true, conversationalStepKey: true, eventType: true, destination: true, postId: true } });
        const expectedPostId = snapshot.source.kind === "existing_post" && step.target_post_id === snapshot.source.post_id ? snapshot.source.post_id : null;
        if (!authority || authority.creatorId !== input.creatorId || authority.conversationalStepKey !== stepKey || authority.eventType !== "make_post" || authority.destination !== "patreon" || authority.postId !== expectedPostId) return conflict("authority_conflict");
        if (snapshot.source.kind === "staged_media") {
          const sourceDraft = await tx.autopostDraft.findFirst({ where: { creatorId: input.creatorId, conversationalStepKey: stepKey }, select: { id: true, publishedPostId: true } });
          if (!sourceDraft || sourceDraft.publishedPostId) return blocked("authority_gap");
        }
        pointer = { node_id: step.step_id, kind: "schedule_event", authority_id: authority.id, slot: "attention_event" };
      } else {
        if (snapshot.source.kind !== "existing_post" || !snapshot.source.post_id || step.target_post_id !== snapshot.source.post_id) return conflict("authority_conflict");
        const post = await tx.post.findFirst({ where: { id: snapshot.source.post_id, creatorId: input.creatorId }, select: { id: true } });
        if (!post) return conflict("authority_conflict");
        pointer = { node_id: step.step_id, kind: "relay_post", authority_id: post.id, slot: "relay_post" };
        reused = true;
      }
      reused = true;
    } else if (input.output === "draft") {
      if (snapshot.source.kind !== "staged_media") return blocked("attached_media_reuse_gap");
      if (!step.source_media_ids.length || step.source_media_ids.length > 3 || step.source_media_ids.some(id => !snapshot.source.selected_media_ids.includes(id))) return blocked("media_not_available");
      const title = step.title.mode === "literal" ? step.title.value : step.title.part_source === "creator" ? `${step.title.prefix}${step.title.part}${step.title.suffix}` : step.title.part_source === "creative_series_member" && snapshot.source.creative_series_member_id && loaded.context.verifiedSeriesMemberPartLabels.get(snapshot.source.creative_series_member_id) === step.title.part ? `${step.title.prefix}${step.title.part}${step.title.suffix}` : null;
      if (title === null) return blocked("title_normalization_gap");
      const saved = await saveConversationalDraftInTransaction(tx, { creatorId: input.creatorId, stepKey, mediaIds: step.source_media_ids, title });
      if (saved.kind === "blocked") return blocked(saved.code);
      if (saved.kind === "conflict") return conflict("authority_conflict");
      pointer = { node_id: step.step_id, kind: "autopost_draft", authority_id: saved.draftId, slot: "draft" };
      reused = saved.reused;
    } else if (input.output === "relay_post") {
      if (snapshot.source.kind !== "existing_post" || !snapshot.source.post_id || step.target_post_id !== snapshot.source.post_id) return blocked("source_intent_gap");
      const post = await tx.post.findFirst({ where: { id: snapshot.source.post_id, creatorId: input.creatorId }, select: { id: true } });
      if (!post) return conflict("authority_conflict");
      pointer = { node_id: step.step_id, kind: "relay_post", authority_id: post.id, slot: "relay_post" };
      reused = true;
    } else {
      let source: { kind: "existing_post"; postId: string } | { kind: "staged_draft"; draftId: string };
      if (snapshot.source.kind === "existing_post") {
        if (!snapshot.source.post_id || step.target_post_id !== snapshot.source.post_id) return blocked("source_intent_gap");
        source = { kind: "existing_post", postId: snapshot.source.post_id };
      } else {
        const draft = await tx.autopostDraft.findFirst({ where: { creatorId: input.creatorId, conversationalStepKey: stepKey }, select: { id: true, creatorId: true, conversationalStepKey: true, publishedPostId: true } });
        if (!draft || draft.creatorId !== input.creatorId || draft.conversationalStepKey !== stepKey || draft.publishedPostId) return blocked(draft?.publishedPostId ? "authority_gap" : "dependency_blocked");
        source = { kind: "staged_draft", draftId: draft.id };
      }
      if (!step.time || step.time.kind !== "absolute" || !isCanonicalUtc(step.time.at_utc)) return blocked("missing_absolute_time");
      if (!(step.note === null || (typeof step.note === "string" && step.note.length <= 2_000))) return blocked("note_normalization_gap");
      const result = await createConversationalAttentionEventInTransaction(tx, { creatorId: input.creatorId, stepKey, dueAtUtc: step.time.at_utc, note: step.note, source });
      if (result.kind === "blocked") return blocked(result.code);
      if (result.kind === "conflict") return conflict("authority_conflict");
      pointer = { node_id: step.step_id, kind: "schedule_event", authority_id: result.eventId, slot: "attention_event" };
      reused = result.reused;
    }
    const sameSlot = pointerRow as unknown as PointerRow | null;
    if (sameSlot) {
      if (sameSlot.authorityId !== pointer.authority_id || sameSlot.authorityKind !== pointer.kind) return conflict("pointer_conflict");
    } else {
      const checkedPointer = await livePointers.resolvePointer(tx, input.planId, input.creatorId, snapshot, { id: "pending", planId: input.planId, creatorId: input.creatorId, nodeId: pointer.node_id, slot: pointer.slot, authorityKind: pointer.kind, authorityId: pointer.authority_id, createdAt: new Date() });
      if (checkedPointer.kind !== "ok") throw new PreparationRollbackSignal(conflict("authority_conflict"));
      await tx.creatorConversationalPlanPointer.create({ data: { planId: input.planId, creatorId: input.creatorId, nodeId: pointer.node_id, slot: pointer.slot, authorityKind: pointer.kind, authorityId: pointer.authority_id } });
    }
    return { kind: "committed", pointer, reused };
  });

  return {
    async prepareOutput(rawInput) {
      if (!validInput(rawInput)) return unavailable("invalid_snapshot");
      let result: UnitResult;
      try {
        result = await transact(rawInput);
      } catch (error) {
        if (error instanceof PreparationRollbackSignal) return error.result;
        if (error instanceof ConversationalDraftReservationError) return blocked("media_not_available");
        if (!uniqueError(error)) return unavailable("preparation_unavailable");
        result = conflict("authority_conflict");
        for (let attempt = 0; attempt < RACE_REREADS; attempt++) {
          try {
            const recovered = await transact(rawInput, true);
            if (recovered.kind === "committed") { result = recovered; break; }
            result = recovered;
          } catch (recoveryError) {
            if (!uniqueError(recoveryError)) return unavailable("preparation_unavailable");
          }
        }
      }
      if (result.kind !== "committed") return result;
      try {
        const latest = await db.$transaction(async tx => {
          const tenant = await tx.tenant.findFirst({ where: { relayCreatorId: rawInput.creatorId }, select: { id: true } });
          if (!tenant) return unavailable("creator_not_provisioned");
          const currentRaw = await tx.creatorConversationalPlan.findFirst({ where: { id: rawInput.planId, creatorId: rawInput.creatorId } });
          if (!currentRaw) return unavailable("not_found");
          const checked = rowSnapshot(currentRaw, rawInput.creatorId);
          if (checked.kind !== "ok") return unavailable("invalid_snapshot");
          const current = checked.snapshot;
          if (current.revision !== rawInput.approvedRevision || current.review !== "approved_for_preparation") return conflict("approved_revision_conflict");
          const context = await createPlanningContextSource(tx).loadContext(rawInput.creatorId, current);
          if (context.sourceFingerprint !== current.source.source_revision || context.context.currentSourceRevision !== context.sourceFingerprint) return conflict("stale_source");
          const checkedContext = validatePlanWithContext(current, context.context);
          if (!checkedContext.ok) return unavailable("invalid_snapshot");
          const checkedPointers = await livePointers.checkPointers(tx, rawInput.creatorId, rawInput.planId, current);
          if (checkedPointers.kind !== "ok") return conflict("authority_conflict");
          const pointers = checkedPointers.pointers;
          const pointer = pointers.find(p => p.node_id === rawInput.stepId && p.slot === rawInput.output);
          if (!pointer || pointer.authority_id !== result.pointer.authority_id || pointer.kind !== result.pointer.kind) return conflict("pointer_conflict");
          return { kind: "linked" as const, current, pointer, pointers, reused: result.reused };
        });
        return latest;
      } catch {
        return unavailable("preparation_unavailable");
      }
    }
  };
}
