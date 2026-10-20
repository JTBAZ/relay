import type { PlanSnapshot, PlanStep, StepPointer } from "./contract.js";
import type {
  ConversationalPlanRepository,
  ConversationalPreparationRepository,
  PrepareOutputResult,
  PreparationOutput,
  ReadResult
} from "./persistence.js";
import type { PlanPreparationAdapter, PreparationResult } from "./service.js";

const MAX_STEPS = 32;
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const inputValid = (value: unknown): value is { creatorId: string; planId: string; approvedRevision: number } =>
  record(value) && Object.keys(value).length === 3 && Object.hasOwn(value, "creatorId") && Object.hasOwn(value, "planId") && Object.hasOwn(value, "approvedRevision") &&
  id(value.creatorId) && id(value.planId) && Number.isSafeInteger(value.approvedRevision) && (value.approvedRevision as number) > 0;

function dependencyOrder(snapshot: PlanSnapshot): PlanStep[] | null {
  if (!Array.isArray(snapshot.steps) || snapshot.steps.length > MAX_STEPS) return null;
  if (snapshot.steps.some(step => !Array.isArray(step.depends_on))) return null;
  const byId = new Map(snapshot.steps.map(step => [step.step_id, step]));
  if (byId.size !== snapshot.steps.length) return null;
  const index = new Map(snapshot.steps.map((step, position) => [step.step_id, position]));
  const indegree = new Map(snapshot.steps.map(step => [step.step_id, step.depends_on.length]));
  const dependents = new Map<string, string[]>();
  for (const step of snapshot.steps) {
    if (!Array.isArray(step.depends_on) || step.depends_on.some(dep => !byId.has(dep))) return null;
    for (const dependency of step.depends_on) dependents.set(dependency, [...(dependents.get(dependency) ?? []), step.step_id]);
  }
  const ready = snapshot.steps.filter(step => indegree.get(step.step_id) === 0).map(step => step.step_id);
  const ordered: PlanStep[] = [];
  while (ready.length) {
    ready.sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
    const next = ready.shift()!;
    ordered.push(byId.get(next)!);
    for (const child of dependents.get(next) ?? []) {
      const remaining = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, remaining);
      if (remaining === 0) ready.push(child);
    }
  }
  return ordered.length === snapshot.steps.length ? ordered : null;
}

const authorityGap: PreparationResult = { kind: "blocked", code: "authority_gap" };
const unavailable: PreparationResult = { kind: "blocked", code: "preparation_unavailable" };

function outputFailure(result: PrepareOutputResult): PreparationResult {
  return result.kind === "unavailable" && (result.code === "preparation_unavailable" || result.code === "not_found" || result.code === "creator_not_provisioned") ? unavailable : authorityGap;
}

function linkedOutput(result: PrepareOutputResult, creatorId: string, planId: string, revision: number, stepId: string, output: PreparationOutput): boolean {
  if (result.kind !== "linked") return false;
  const expectedKind: StepPointer["kind"] = output === "relay_post" ? "relay_post" : output === "draft" ? "autopost_draft" : "schedule_event";
  const pointer = result.pointer;
  return result.current.creator_id === creatorId && result.current.plan_id === planId && result.current.revision === revision && result.current.review === "approved_for_preparation" &&
    pointer.node_id === stepId && pointer.slot === output && pointer.kind === expectedKind &&
    result.pointers.some(candidate => candidate.node_id === stepId && candidate.slot === output && candidate.kind === expectedKind && candidate.authority_id === pointer.authority_id);
}

function dependencyAncestorsAreReady(step: PlanStep, byId: Map<string, PlanStep>, completed: Set<string>): boolean {
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (seen.has(id)) return true;
    seen.add(id);
    const dependency = byId.get(id);
    if (!dependency || !dependency.enabled || !completed.has(id)) return false;
    return dependency.depends_on.every(visit);
  };
  return step.depends_on.every(visit);
}

export function createPlanPreparationAdapter(deps: Readonly<{
  repository: Pick<ConversationalPlanRepository, "get">;
  outputs: ConversationalPreparationRepository;
}>): PlanPreparationAdapter {
  return {
    async prepare(input): Promise<PreparationResult> {
      if (!inputValid(input)) return authorityGap;
      let read: ReadResult;
      try {
        read = await deps.repository.get(input.creatorId, input.planId);
      } catch {
        return unavailable;
      }
      if (read.kind !== "ok") return read.kind === "not_found" || read.kind === "creator_not_provisioned" ? unavailable : authorityGap;
      const snapshot = read.current;
      if (snapshot.creator_id !== input.creatorId || snapshot.plan_id !== input.planId || snapshot.revision !== input.approvedRevision || snapshot.review !== "approved_for_preparation") return authorityGap;
      const ordered = dependencyOrder(snapshot);
      if (!ordered) return authorityGap;
      const byId = new Map(ordered.map(step => [step.step_id, step]));
      const completed = new Set<string>();
      let enabledSourceCount = 0;
      let unsupportedRequiredWork = false;

      for (const step of ordered) {
        if (!step.enabled) continue;
        if (step.capability !== "prepare_post_draft") {
          unsupportedRequiredWork = true;
          continue;
        }
        enabledSourceCount++;
        if (!dependencyAncestorsAreReady(step, byId, completed)) {
          unsupportedRequiredWork = true;
          continue;
        }
        let sourceOutput: PreparationOutput;
        if (snapshot.source.kind === "existing_post" && snapshot.source.post_id && step.target_post_id === snapshot.source.post_id) sourceOutput = "relay_post";
        else if (snapshot.source.kind === "staged_media" && step.target_post_id === null) sourceOutput = "draft";
        else {
          unsupportedRequiredWork = true;
          continue;
        }
        let result: PrepareOutputResult;
        try {
          result = await deps.outputs.prepareOutput({ creatorId: input.creatorId, planId: input.planId, approvedRevision: input.approvedRevision, stepId: step.step_id, output: sourceOutput });
        } catch {
          return unavailable;
        }
        if (!linkedOutput(result, input.creatorId, input.planId, input.approvedRevision, step.step_id, sourceOutput)) return result.kind === "linked" ? authorityGap : outputFailure(result);
        completed.add(step.step_id);

        if (step.time === null) continue;
        if (step.time.kind !== "absolute") {
          unsupportedRequiredWork = true;
          continue;
        }
        try {
          result = await deps.outputs.prepareOutput({ creatorId: input.creatorId, planId: input.planId, approvedRevision: input.approvedRevision, stepId: step.step_id, output: "attention_event" });
        } catch {
          return unavailable;
        }
        if (!linkedOutput(result, input.creatorId, input.planId, input.approvedRevision, step.step_id, "attention_event")) return result.kind === "linked" ? authorityGap : outputFailure(result);
      }

      if (enabledSourceCount === 0 || unsupportedRequiredWork) return authorityGap;
      return { kind: "authorities_linked" };
    }
  };
}
