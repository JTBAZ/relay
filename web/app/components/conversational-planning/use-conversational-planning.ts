"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RelayApiError, RelayForbiddenError, RelayServerError } from "@/lib/relay-api";
import {
  fetchPlanningCapabilities,
  getPlanningPlan,
  getPlanningPreview,
  listPlanningPlans,
  type PlanningCapabilities,
  type PlanningListOk,
  type PlanningPreviewOk,
  type PlanningReadOk
} from "@/lib/conversational-planning-api";
import type { PageCursor } from "../../../../src/conversational-planning/persistence.js";
import type { PlanSnapshot } from "../../../../src/conversational-planning/contract.js";

export type PlanView =
  | { kind: "closed" }
  | { kind: "new"; selection: { selectedPostIds: readonly string[]; selectedMediaIds: readonly string[] } }
  | { kind: "loading"; planId: string }
  | { kind: "detail"; planId: string; read: PlanningReadOk; preview: PlanningPreviewOk }
  | { kind: "read_error"; planId: string; reason: "stale_source" | "forbidden" | "unavailable" | "revision_mismatch" | "other" };
export type CapabilitiesView = { kind: "loading" } | { kind: "ready"; value: PlanningCapabilities } | { kind: "error"; reason: string };
export type PlanListView = { kind: "loading" } | { kind: "ready"; items: readonly PlanSnapshot[]; nextCursor: PageCursor | null; loadingMore: boolean; loadMoreError: string | null } | { kind: "error"; reason: string };
export type PlanningOpenRequest = { kind: "new" } | { kind: "existing"; planId: string };
export type PlanningControllerInput = { creatorId: string; sessionReady: boolean; studioIdFromSession: boolean; selectedPostIds: readonly string[]; selectedMediaIds: readonly string[]; writeBlocked: boolean };

const unique = (ids: readonly string[]) => Object.freeze([...new Set(ids)]);
const errorText = (error: unknown) => error instanceof Error ? error.message : "The request failed. Try again.";
function detailError(error: unknown): "stale_source" | "forbidden" | "unavailable" | "other" {
  if (error instanceof RelayForbiddenError || (error instanceof RelayApiError && error.status === 403)) return "forbidden";
  if ((error instanceof RelayApiError || error instanceof RelayServerError) && (error.code === "stale_source" || error.code === "STALE_SOURCE")) return "stale_source";
  if ((error instanceof RelayApiError && error.status === 404) || (error instanceof RelayServerError && error.status === 503)) return "unavailable";
  return "other";
}
const emptyList = (): PlanListView => ({ kind: "ready", items: [], nextCursor: null, loadingMore: false, loadMoreError: null });

export function useConversationalPlanning(input: PlanningControllerInput) {
  const identity = `${input.creatorId}\u0000${input.studioIdFromSession}\u0000${input.sessionReady}`;
  const identityRef = useRef(identity);
  const identityChanged = identityRef.current !== identity;
  const detailGeneration = useRef(0), indexGeneration = useRef(0), moreGeneration = useRef(0);
  const activePlanId = useRef<string | null>(null);
  const detailAbort = useRef<AbortController | null>(null), indexAbort = useRef<AbortController | null>(null), moreAbort = useRef<AbortController | null>(null);
  const cursorRef = useRef<PageCursor | null>(null);
  const [view, setView] = useState<PlanView>({ kind: "closed" });
  const [capabilities, setCapabilities] = useState<CapabilitiesView>({ kind: "loading" });
  const [list, setList] = useState<PlanListView>({ kind: "loading" });

  const abortAll = useCallback(() => {
    detailAbort.current?.abort(); indexAbort.current?.abort(); moreAbort.current?.abort();
    detailAbort.current = null; indexAbort.current = null; moreAbort.current = null;
    detailGeneration.current++; indexGeneration.current++; moreGeneration.current++;
  }, []);
  const abortDetail = useCallback(() => {
    detailAbort.current?.abort(); detailAbort.current = null; detailGeneration.current++;
  }, []);

  const readPlan = useCallback(async (planId: string) => {
    if (!input.sessionReady || !input.studioIdFromSession || !input.creatorId) {
      activePlanId.current = null;
      setView({ kind: "read_error", planId, reason: "unavailable" });
      return;
    }
    activePlanId.current = planId;
    const capturedIdentity = identityRef.current;
    abortDetail();
    const controller = new AbortController(); detailAbort.current = controller;
    const generation = ++detailGeneration.current;
    setView({ kind: "loading", planId });
    try {
      const [read, preview] = await Promise.all([getPlanningPlan(planId, controller.signal), getPlanningPreview(planId, controller.signal)]);
      if (controller.signal.aborted || generation !== detailGeneration.current || capturedIdentity !== identityRef.current) return;
      const current = read.current;
      if (current.plan_id !== planId || current.creator_id !== input.creatorId || preview.planId !== planId || preview.revision !== current.revision || preview.review !== current.review) {
        setView({ kind: "read_error", planId, reason: "revision_mismatch" }); return;
      }
      setView({ kind: "detail", planId, read, preview });
    } catch (error) {
      if (controller.signal.aborted || generation !== detailGeneration.current || capturedIdentity !== identityRef.current) return;
      setView({ kind: "read_error", planId, reason: detailError(error) });
    }
  }, [abortDetail, input.creatorId, input.sessionReady, input.studioIdFromSession]);

  const reloadPlan = useCallback(() => {
    const planId = activePlanId.current;
    if (planId) void readPlan(planId);
  }, [readPlan]);

  const open = useCallback((request: PlanningOpenRequest) => {
    abortDetail();
    if (request.kind === "new") {
      activePlanId.current = null;
      setView({ kind: "new", selection: { selectedPostIds: unique(input.selectedPostIds), selectedMediaIds: unique(input.selectedMediaIds) } });
    } else {
      activePlanId.current = request.planId;
      void readPlan(request.planId);
    }
  }, [abortDetail, input.selectedMediaIds, input.selectedPostIds, readPlan]);

  const close = useCallback(() => { activePlanId.current = null; abortDetail(); setView({ kind: "closed" }); }, [abortDetail]);

  useEffect(() => {
    const previous = identityRef.current;
    if (previous === identity) return;
    identityRef.current = identity;
    activePlanId.current = null; abortAll(); setView({ kind: "closed" }); setCapabilities({ kind: "loading" }); setList({ kind: "loading" }); cursorRef.current = null;
  }, [identity, abortAll]);

  const reloadIndex = useCallback(async () => {
    if (!input.sessionReady || !input.studioIdFromSession || !input.creatorId) {
      abortAll(); setCapabilities({ kind: "error", reason: "Studio access is not available for this session." }); setList({ kind: "error", reason: "Studio access is not available for this session." }); return;
    }
    indexAbort.current?.abort(); moreAbort.current?.abort();
    const controller = new AbortController(); indexAbort.current = controller;
    const capturedIdentity = identityRef.current, generation = ++indexGeneration.current;
    setCapabilities({ kind: "loading" }); setList({ kind: "loading" }); cursorRef.current = null;
    const valid = () => !controller.signal.aborted && generation === indexGeneration.current && capturedIdentity === identityRef.current;
    const capPromise = fetchPlanningCapabilities(controller.signal).then(value => { if (valid()) setCapabilities({ kind: "ready", value }); }).catch(error => { if (valid()) setCapabilities({ kind: "error", reason: errorText(error) }); });
    const listPromise = listPlanningPlans({ limit: 20 }, controller.signal).then((result: PlanningListOk) => { if (valid()) { cursorRef.current = result.nextCursor; setList({ kind: "ready", items: result.items, nextCursor: result.nextCursor, loadingMore: false, loadMoreError: null }); } }).catch(error => { if (valid()) setList({ kind: "error", reason: errorText(error) }); });
    await Promise.all([capPromise, listPromise]);
  }, [abortAll, input.creatorId, input.sessionReady, input.studioIdFromSession]);

  const loadMore = useCallback(async () => {
    if (list.kind !== "ready" || !list.nextCursor || list.loadingMore) return;
    const cursor = list.nextCursor, capturedIdentity = identityRef.current, generation = ++moreGeneration.current;
    moreAbort.current?.abort(); const controller = new AbortController(); moreAbort.current = controller;
    setList(current => current.kind === "ready" ? { ...current, loadingMore: true, loadMoreError: null } : current);
    try {
      const result = await listPlanningPlans({ limit: 20, cursor }, controller.signal);
      if (controller.signal.aborted || generation !== moreGeneration.current || capturedIdentity !== identityRef.current || cursorRef.current !== cursor) return;
      cursorRef.current = result.nextCursor;
      setList(current => current.kind === "ready" ? { ...current, items: [...current.items, ...result.items], nextCursor: result.nextCursor, loadingMore: false, loadMoreError: null } : current);
    } catch (error) {
      if (controller.signal.aborted || generation !== moreGeneration.current || capturedIdentity !== identityRef.current) return;
      setList(current => current.kind === "ready" ? { ...current, loadingMore: false, loadMoreError: errorText(error) } : current);
    }
  }, [list]);

  useEffect(() => { void reloadIndex(); }, [identity, reloadIndex]);
  useEffect(() => () => abortAll(), [abortAll]);

  return {
    open, close, reloadPlan, reloadIndex, loadMore,
    view: identityChanged ? ({ kind: "closed" } as const) : view,
    capabilities: identityChanged ? ({ kind: "loading" } as const) : capabilities,
    list: identityChanged ? ({ kind: "loading" } as const) : list,
    writeBlocked: input.writeBlocked
  };
}
