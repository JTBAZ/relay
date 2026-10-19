import { relayFetch } from "./relay-api";
import type {
  ConfirmResult,
  CreateBody,
  PlanListResult,
  PlanPreviewResult,
  PlanReadResult,
  PlanWriteResult,
  ResumePreparationBody,
  ReviseBody,
  ReviewBody,
  ServiceError,
  StoredPlan,
  TurnResult
} from "../../src/conversational-planning/service.js";
import type { PageCursor } from "../../src/conversational-planning/persistence.js";

export type PlanningCapabilities = Readonly<{
  enabled: boolean;
  ai_enabled: boolean;
  ai_available: boolean;
  preparation_available: boolean;
  required_plan: "autopost";
  entitled: true;
}>;

export type PlanningListOk = Exclude<PlanListResult, ServiceError>;
export type PlanningReadOk = Exclude<PlanReadResult, ServiceError>;
export type PlanningPreviewOk = Exclude<PlanPreviewResult, ServiceError>;
export type PlanningTurnOk = Exclude<TurnResult, ServiceError>;

const base = "/api/v1/conversational-planning";

/** Encode the route's UTF-8 JSON cursor as unpadded base64url, within its 1024-char bound. */
export function encodePlanningCursor(cursor: PageCursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ updatedAt: cursor.updatedAt, id: cursor.id }));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  if (encoded.length > 1024) throw new RangeError("Planning cursor exceeds the 1024-character route limit.");
  return encoded;
}

function jsonPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return relayFetch<T>(path, { method: "POST", body: JSON.stringify(body), ...(signal ? { signal } : {}) });
}

export function fetchPlanningCapabilities(signal?: AbortSignal): Promise<PlanningCapabilities> {
  return relayFetch(`${base}/capabilities`, { signal });
}

export function listPlanningPlans(input: { limit: number; cursor?: PageCursor }, signal?: AbortSignal): Promise<PlanningListOk> {
  const params = new URLSearchParams({ limit: String(input.limit) });
  if (input.cursor) params.set("cursor", encodePlanningCursor(input.cursor));
  return relayFetch(`${base}/plans?${params.toString()}`, { signal });
}

export function getPlanningPlan(planId: string, signal?: AbortSignal): Promise<PlanningReadOk> {
  return relayFetch(`${base}/plans/${encodeURIComponent(planId)}`, { signal });
}

export function getPlanningPreview(planId: string, signal?: AbortSignal): Promise<PlanningPreviewOk> {
  return relayFetch(`${base}/plans/${encodeURIComponent(planId)}/preview`, { signal });
}

export function createPlanningPlan(body: CreateBody, signal?: AbortSignal): Promise<PlanningTurnOk> {
  return jsonPost(`${base}/plans`, body, signal);
}

export function revisePlanningPlan(planId: string, body: ReviseBody, signal?: AbortSignal): Promise<PlanningTurnOk> {
  return jsonPost(`${base}/plans/${encodeURIComponent(planId)}/revise`, body, signal);
}

export function approvePlanningPlan(planId: string, body: ReviewBody): Promise<Exclude<PlanWriteResult, ServiceError>> {
  return jsonPost(`${base}/plans/${encodeURIComponent(planId)}/approve`, body);
}

export function cancelPlanningPlan(planId: string, body: ReviewBody): Promise<Exclude<PlanWriteResult, ServiceError>> {
  return jsonPost(`${base}/plans/${encodeURIComponent(planId)}/cancel`, body);
}

export function confirmPlanningPlan(planId: string, body: ReviewBody): Promise<StoredPlan> {
  return jsonPost<Exclude<ConfirmResult, ServiceError | { kind: "preparation_unavailable" }>>(`${base}/plans/${encodeURIComponent(planId)}/confirm`, body);
}

export function resumePlanningPreparation(planId: string, body: ResumePreparationBody): Promise<StoredPlan> {
  return jsonPost<Exclude<ConfirmResult, ServiceError | { kind: "preparation_unavailable" }>>(`${base}/plans/${encodeURIComponent(planId)}/resume-preparation`, body);
}

