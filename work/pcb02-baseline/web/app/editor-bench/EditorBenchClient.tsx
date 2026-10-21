"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GalleryGrid from "@/app/components/GalleryGrid";
import { groupGalleryItemsByPost } from "@/lib/gallery-group";
import { PreviewizerOverlay } from "@/app/components/distribution/PreviewizerOverlay";
import type { GalleryItem } from "@/lib/relay-api";
import { RelayApiError } from "@/lib/relay-api";
import { sendRelayScheduleEventToExtension } from "@/lib/relay-extension-messaging";
import { cancelBenchConversationPreview, chatBenchVariantEdit, completeBenchConversationPreview, confirmBenchVariantEdit, confirmBenchSchedule, fetchRealLibraryPost, fetchRealLibraryPosts, fetchRealLibrarySelectionCatalog, reviewRealLibraryAgain, reviewRealLibrarySchedule, reviewBenchSchedule, updateRealLibrarySelection, openBenchConversationPreview, startBenchConversation, getBenchConversation, sendBenchConversationTurn, confirmBenchConversation, reviewBenchConversationXDraft, reviewBenchConversationDeviantArtDraft, confirmBenchConversationXDraft, confirmBenchConversationDeviantArtDraft, reviewBenchConversationXDraftSchedule, confirmBenchConversationXDraftSchedule, reviewBenchConversationDeviantArtDraftSchedule, confirmBenchConversationDeviantArtDraftSchedule, reviewBenchConversationXHandoff, confirmBenchConversationXHandoff, reviewBenchConversationDeviantArtHandoff, confirmBenchConversationDeviantArtHandoff, toggleBenchConversationSelection, updateBenchConversationCell, uploadBenchConversationPreview, RealLibrarySelectionApiError, type BenchCatalog, type BenchExample, type BenchMode, type BenchRefinementState, type BenchResponse, type BenchRuntime, type BenchVariantEditChatResult, type BenchVariantEditConfirmResult, type BenchConversationSnapshot, type BenchConversationTurn, type BenchConversationConfirm, type BenchConversationPreviewOpen, type BenchConversationXDraftReview, type BenchConversationXDraftScheduleReview, type BenchConversationXHandoffReview, type BenchConversationXHandoffConfirm, type BenchConversationDestination, type RealLibraryPost, type RealLibrarySelectionCatalog, type RealLibraryRefinementState, type RealLibrarySelectionResult, type RealLibraryReviewResult, type ScheduleBatchReviewResult, type ScheduleConfirmResult, type ScheduleReviewResponse } from "@/lib/editor-bench";
import { sendRelayBenchDeviantArtHandoffToExtension, sendRelayBenchXHandoffToExtension } from "@/lib/relay-extension-messaging";

const statuses = ["proposal", "clarification", "limitation", "unchanged", "selected", "rejected", "unavailable"];
const provenances = ["example_replay", "edited_replay", "model_interpretation", "none"];
const capabilityLabels: Record<string, string> = {
  prepare_post_draft: "Prepare post draft",
  prepare_preview: "Prepare preview",
  prepare_distribution: "Prepare distribution",
  publish_handoff: "Publication handoff",
  reply_block: "Reply block",
  engagement_check: "Engagement check",
};
const preparationRequirementLabels: Record<string, string> = {
  source_selection: "select posts", template: "choose a template", copy_choice: "choose a copy option",
  previewizer: "run Previewizer", source_media_review: "review source media",
};
function isBenchResponse(value: any, catalog: BenchCatalog): value is BenchResponse {
  const selectionValid = value?.selection === undefined || (
    value.selection && typeof value.selection === "object" && !Array.isArray(value.selection) &&
    Object.keys(value.selection).length === 3 && ["postIds", "mediaIds", "changed"].every(key => Object.hasOwn(value.selection, key)) &&
    Array.isArray(value.selection.postIds) && Array.isArray(value.selection.mediaIds) && typeof value.selection.changed === "boolean" &&
    value.selection.postIds.every((id: unknown) => typeof id === "string" && catalog.cards.some(card => card.postId === id)) &&
    value.selection.mediaIds.every((id: unknown) => typeof id === "string" && catalog.media.some(item => item.id === id && value.selection.postIds.includes(item.postId))) &&
    new Set(value.selection.postIds).size === value.selection.postIds.length && new Set(value.selection.mediaIds).size === value.selection.mediaIds.length
  );
  const usageValid = value?.usage === undefined || (
    value.usage && typeof value.usage === "object" && !Array.isArray(value.usage) &&
    Object.keys(value.usage).length === 5 && ["calls", "known", "inputTokens", "outputTokens", "costUsd"].every(key => Object.hasOwn(value.usage, key)) &&
    Number.isInteger(value.usage.calls) && value.usage.calls >= 0 && typeof value.usage.known === "boolean" &&
    [value.usage.inputTokens, value.usage.outputTokens, value.usage.costUsd].every((item: unknown) => item === null || (typeof item === "number" && Number.isFinite(item) && item >= 0))
  );
  return value && ["curation", "mock_posting"].includes(value.mode) && statuses.includes(value.status) && selectionValid && usageValid &&
    provenances.includes(value.provenance) && Array.isArray(value.beforeAfter) && Array.isArray(value.diagnostics) &&
    (value.message === undefined || typeof value.message === "string") && (value.runtime === undefined || isBenchRuntime(value.runtime));
}
function isBenchRuntime(value: any): value is BenchRuntime {
  return value && typeof value.enabled === "boolean" && (value.model === null || typeof value.model === "string") &&
    (value.reasoningEffort === null || value.reasoningEffort === "none") &&
    (value.remainingUsd === null || typeof value.remainingUsd === "number") && (value.reason === null || typeof value.reason === "string");
}
function isBenchRefinementState(value: unknown, catalog: BenchCatalog, expectedPosts?: string[]): value is BenchRefinementState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (Object.keys(state).length !== 4 || !["v", "fixtureRevision", "selectedPostIds", "excludedPostIds"].every(key => Object.hasOwn(state, key)) || state.v !== 1) return false;
  if (!Number.isSafeInteger(state.fixtureRevision) || (state.fixtureRevision as number) < 0 || (catalog.fixtureRevision !== undefined && state.fixtureRevision !== catalog.fixtureRevision)) return false;
  const validIds = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.length <= 16 && ids.every(id => typeof id === "string" && catalog.cards.some(card => card.postId === id)) && new Set(ids).size === ids.length;
  if (!validIds(state.selectedPostIds) || !validIds(state.excludedPostIds)) return false;
  const selected = state.selectedPostIds as string[], excluded = state.excludedPostIds as string[];
  const canonical = catalog.cards.map(card => card.postId);
  const inCanonicalOrder = (ids: string[]) => ids.every((id, index) => index === 0 || canonical.indexOf(ids[index - 1]) < canonical.indexOf(id));
  if (selected.some(id => excluded.includes(id)) || !inCanonicalOrder(selected) || !inCanonicalOrder(excluded)) return false;
  return expectedPosts === undefined || JSON.stringify(selected) === JSON.stringify(expectedPosts);
}
function isSelectionOnlyRefinement(value: BenchResponse, catalog: BenchCatalog): value is BenchResponse & { selection: NonNullable<BenchResponse["selection"]>; refinementState: BenchRefinementState } {
  if (value.mode !== "curation" || !["selected", "unchanged"].includes(value.status) || value.provenance !== "model_interpretation" || !value.selection || !isBenchRefinementState(value.refinementState, catalog, value.selection.postIds)) return false;
  if (!value.result || typeof value.result !== "object" || !Object.hasOwn(value.result, "refinement")) return false;
  const intent = value.interpreted;
  const emptyNoop = !!intent && typeof intent === "object" && !Array.isArray(intent) &&
    Array.isArray((intent as Record<string, unknown>).operations) && ((intent as Record<string, unknown>).operations as unknown[]).length === 0 &&
    ["proposal", "no_change"].includes(String((intent as Record<string, unknown>).outcome));
  return intent === null || emptyNoop;
}
function isRealLibraryCatalog(value: unknown): value is RealLibrarySelectionCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const catalog = value as Partial<RealLibrarySelectionCatalog>;
  if (catalog.scope !== "real_library" || catalog.complete !== true || catalog.timezone !== "Europe/London" || typeof catalog.catalogRevision !== "string" || !catalog.catalogRevision || !Array.isArray(catalog.supportedFields) || !Array.isArray(catalog.posts) || catalog.posts.length > 40) return false;
  const ids = catalog.posts.map(post => post?.postId);
  return ids.every(id => typeof id === "string" && !!id) && new Set(ids).size === ids.length && catalog.posts.every(post => !!post && typeof post.title === "string" && typeof post.descriptionText === "string" && Array.isArray(post.tags) && typeof post.createdAt === "string" && (post.publishedAt === null || typeof post.publishedAt === "string") && typeof post.publishState === "string" && Array.isArray(post.collections) && Array.isArray(post.collectionIds) && Array.isArray(post.media) && post.media.every(media => media && typeof media.id === "string"));
}
function isRealLibraryRefinementState(value: unknown, catalog: RealLibrarySelectionCatalog, expectedPosts?: string[]): value is RealLibraryRefinementState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  const keys = ["v", "scope", "catalogRevision", "selectedPostIds", "excludedPostIds"];
  if (Object.keys(state).length !== keys.length || !keys.every(key => Object.hasOwn(state, key)) || state.v !== 1 || state.scope !== "real_library" || state.catalogRevision !== catalog.catalogRevision) return false;
  const canonical = catalog.posts.map(post => post.postId);
  const validIds = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.length <= 40 && ids.every(id => typeof id === "string" && canonical.includes(id)) && new Set(ids).size === ids.length && ids.every((id, index) => index === 0 || canonical.indexOf(ids[index - 1]) < canonical.indexOf(id));
  if (!validIds(state.selectedPostIds) || !validIds(state.excludedPostIds) || (state.selectedPostIds as string[]).some(id => (state.excludedPostIds as string[]).includes(id))) return false;
  return expectedPosts === undefined || JSON.stringify(state.selectedPostIds) === JSON.stringify(expectedPosts);
}
function isRealLibrarySelectionResult(value: unknown, catalog: RealLibrarySelectionCatalog): value is RealLibrarySelectionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<RealLibrarySelectionResult>;
  return result.scope === "real_library" && ["selected", "unchanged", "clarification"].includes(String(result.status)) && typeof result.message === "string" && !!result.selection && typeof result.selection.changed === "boolean" && Array.isArray(result.selection.postIds) && isRealLibraryRefinementState(result.refinementState, catalog, result.selection.postIds);
}
function destinationLabel(destination: "patreon" | "x" | "deviantart") {
  return destination === "x" ? "X" : destination === "deviantart" ? "DeviantArt" : "Patreon";
}
function isBatchReview(review: ScheduleReviewResponse): review is ScheduleBatchReviewResult {
  return review.reviewKind === "manual_batch";
}
function isGroupedReview(review: ScheduleReviewResponse): review is ScheduleBatchReviewResult | RealLibraryReviewResult {
  return "items" in review;
}
function thumbnail(title: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="100%" height="100%" fill="#e9e4dc"/><circle cx="240" cy="150" r="80" fill="#94a3b8"/><text x="240" y="280" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#253047">${title}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function draftDiffValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "(empty)";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export default function EditorBenchClient() {
  const [catalog, setCatalog] = useState<BenchCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [mode, setMode] = useState<BenchMode>("mock_posting");
  const [conversationMode, setConversationMode] = useState(true);
  const [conversationSession, setConversationSession] = useState<BenchConversationSnapshot | null>(null);
  const [conversationRestoreLoading, setConversationRestoreLoading] = useState(false);
  const [conversationTurn, setConversationTurn] = useState<BenchConversationTurn | null>(null);
  const [conversationReceipt, setConversationReceipt] = useState<BenchConversationConfirm | null>(null);
  const [xDraftReview, setXDraftReview] = useState<BenchConversationXDraftReview | null>(null);
  const [xDraftBusy, setXDraftBusy] = useState(false);
  const [cellBusyKey, setCellBusyKey] = useState<string | null>(null);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const xDraftConfirming = useRef(false);
  const [scheduleVariantId, setScheduleVariantId] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [draftScheduleReview, setDraftScheduleReview] = useState<BenchConversationXDraftScheduleReview | null>(null);
  const [draftScheduleBusy, setDraftScheduleBusy] = useState(false);
  const draftScheduleConfirming = useRef(false);
  const [xHandoffReview, setXHandoffReview] = useState<BenchConversationXHandoffReview | null>(null);
  const [xHandoffBusy, setXHandoffBusy] = useState(false);
  const [xHandoffOutcome, setXHandoffOutcome] = useState<{ handoffId: string; kind: "success" | "error"; message: string } | null>(null);
  const xHandoffConfirming = useRef(false);
  const [previewOpen, setPreviewOpen] = useState<BenchConversationPreviewOpen | null>(null);
  const [previewBusyMediaId, setPreviewBusyMediaId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const previewReturnFocus = useRef<HTMLElement | null>(null);
  const previewHandshakeInFlight = useRef(false);
  const [sourceMode, setSourceMode] = useState<"fixture" | "real_library">("fixture");
  const [editDraftMode, setEditDraftMode] = useState(false);
  const [variantEditReview, setVariantEditReview] = useState<BenchVariantEditChatResult | null>(null);
  const [variantEditReceipt, setVariantEditReceipt] = useState<BenchVariantEditConfirmResult | null>(null);
  const variantEditAbort = useRef<AbortController | null>(null);
  const [curationSource, setCurationSource] = useState<"fixture" | "real_library">("fixture");
  const [refinementState, setRefinementState] = useState<BenchRefinementState | null>(null);
  const [realLibraryCatalog, setRealLibraryCatalog] = useState<RealLibrarySelectionCatalog | null>(null);
  const [realLibrarySelection, setRealLibrarySelection] = useState<RealLibraryRefinementState | null>(null);
  const [realLibrarySelectedIds, setRealLibrarySelectedIds] = useState<string[]>([]);
  const [realLibraryLoading, setRealLibraryLoading] = useState(false);
  const [realLibraryBusy, setRealLibraryBusy] = useState(false);
  const [realLibraryError, setRealLibraryError] = useState<{ code: string | null; message: string } | null>(null);
  const [libraryPosts, setLibraryPosts] = useState<{post_id:string;title:string}[]>([]);
  const [libraryPost, setLibraryPost] = useState<RealLibraryPost | null>(null);
  const [libraryMediaIds, setLibraryMediaIds] = useState<string[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [request, setRequest] = useState("");
  const [intent, setIntent] = useState("");
  const [response, setResponse] = useState<BenchResponse | null>(null);
  const [requestError, setRequestError] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualSelectionBusy, setManualSelectionBusy] = useState(false);
  const [scheduleReview, setScheduleReview] = useState<ScheduleReviewResponse | null>(null);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [receipt, setReceipt] = useState<ScheduleConfirmResult | null>(null);
  const [batchReceipts, setBatchReceipts] = useState<Record<string, ScheduleConfirmResult>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [extensionBusy, setExtensionBusy] = useState(false);
  const [extensionOutcome, setExtensionOutcome] = useState<{ eventId: string; kind: "success" | "error"; message: string } | null>(null);
  const [chat, setChat] = useState<string[]>([]);
  const generation = useRef(0);
  const scheduleGeneration = useRef(0);
  const requestAbort = useRef<AbortController | null>(null);
  const conversationAbort = useRef<AbortController | null>(null);
  const conversationSendInFlight = useRef(false);
  const manualSelectionInFlight = useRef(false);
  const catalogAbort = useRef<AbortController | null>(null);
  const pair = useRef<BenchExample | null>(null);
  const acceptedFreeTextProposal = useRef<string | null>(null);
  const realRequest = useRef<{latestRequest:string;postId:string;mediaIds:string[]}|null>(null);
  const realRequestAbort = useRef<AbortController | null>(null);
  const sourceReadGeneration = useRef(0);
  const extensionBusyRef = useRef(false);
  const extensionGeneration = useRef(0);
  const realLibraryCatalogAbort = useRef<AbortController | null>(null);
  const realLibraryCatalogGeneration = useRef(0);
  const realLibrarySelectionAbort = useRef<AbortController | null>(null);
  const realLibrarySelectionGeneration = useRef(0);
  const realLibraryBusyRef = useRef(false);

  const loadCatalog = useCallback(async () => {
    catalogAbort.current?.abort();
    const controller = new AbortController();
    catalogAbort.current = controller;
    const token = ++generation.current;
    setRefinementState(null);
    setSelected([]);
    setCatalogError("");
    try {
      const result = await fetch("/api/editor-bench", { signal: controller.signal });
      if (!result.ok) throw new Error(`Catalog request failed (${result.status}).`);
      const value = await result.json();
      if (!value || !Array.isArray(value.cards) || !Array.isArray(value.examples) || !Array.isArray(value.media) || (value.runtime !== undefined && !isBenchRuntime(value.runtime))) throw new Error("Catalog response was malformed.");
      if (token === generation.current) setCatalog(value as BenchCatalog);
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : "Catalog could not load.");
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
    return () => { generation.current++; scheduleGeneration.current++; catalogAbort.current?.abort(); requestAbort.current?.abort(); conversationAbort.current?.abort(); variantEditAbort.current?.abort(); };
  }, [loadCatalog]);

  useEffect(() => {
    const storageKey = "editor-bench-conversation-session";
    if (!catalog && !catalogError) return;
    let sessionId: string | null = null;
    try { sessionId = window.sessionStorage.getItem(storageKey); } catch { return; }
    if (!sessionId) return;
    const token = ++generation.current;
    const controller = new AbortController();
    let active = true;
    conversationSendInFlight.current = true; setConversationRestoreLoading(true); setBusy(true);
    void getBenchConversation(sessionId, controller.signal).then(snapshot => {
      if (active && token === generation.current) { setConversationSession(snapshot); setConversationMode(true); setMode("mock_posting"); }
    }).catch(error => {
      if (active && token === generation.current && error instanceof RelayApiError && error.status === 404) {
        try { window.sessionStorage.removeItem(storageKey); } catch { /* Session storage can be unavailable. */ }
      } else if (active && token === generation.current && !controller.signal.aborted) setRequestError(error instanceof Error ? error.message : "The saved mock conversation could not be loaded.");
    }).finally(() => {
      if (active && token === generation.current) { conversationSendInFlight.current = false; setConversationRestoreLoading(false); setBusy(false); }
    });
    return () => {
      active = false; controller.abort();
      if (token === generation.current) { conversationSendInFlight.current = false; setConversationRestoreLoading(false); setBusy(false); }
    };
  }, [catalog, catalogError]);

  useEffect(() => {
    const storageKey = "editor-bench-conversation-session";
    if (conversationSession?.sessionId) { try { window.sessionStorage.setItem(storageKey, conversationSession.sessionId); } catch { /* Session storage can be unavailable. */ } }
  }, [conversationSession?.sessionId]);

  const visibleCards = conversationMode && conversationSession ? conversationSession.cards : catalog?.cards ?? [];
  const visibleMedia = conversationMode && conversationSession ? conversationSession.media : catalog?.media ?? [];
  const visibleSelected = conversationMode && conversationSession ? conversationSession.selection.postIds : selected;
  const items = useMemo(() => visibleCards.flatMap(card => card.mediaIds.map((media_id) => ({
    media_id, post_id: card.postId, title: card.title, description: "Synthetic fixture", published_at: card.publishState === "draft" ? "" : "2026-01-01T00:00:00Z",
    tag_ids: card.tags ?? [], tier_ids: [], has_export: true, processing_status: "READY", export_status: "ready",
    content_url_path: thumbnail(card.title), preview_url_path: thumbnail(card.title), thumb_url_path: thumbnail(card.title),
    visibility: "visible", collection_ids: card.collectionIds, collection_theme_tag_ids: [], mime_type: "image/svg+xml", media_role: "image",
  } satisfies GalleryItem))), [visibleCards]);
  const groups = useMemo(() => groupGalleryItemsByPost(items), [items]);

  function invalidate() {
    acceptedFreeTextProposal.current = null;
    pair.current = null;
    generation.current++;
    requestAbort.current?.abort();
    realRequestAbort.current?.abort();
    setBusy(false);
    setResponse(null);
    setRequestError("");
    scheduleGeneration.current++;
    setScheduleReview(null);
    setDraftScheduleReview(null);
    setXHandoffReview(null);
    setScheduleError("");
    setScheduleBusy(false);
    setReceipt(null);
    setBatchReceipts({});
    setRowErrors({});
    variantEditAbort.current?.abort();
    variantEditAbort.current = null;
    setVariantEditReview(null);
    setVariantEditReceipt(null);
    conversationAbort.current?.abort();
    conversationAbort.current = null;
    setConversationTurn(null);
    setConversationReceipt(null);
    realRequest.current = null;
    extensionGeneration.current++;
    setExtensionOutcome(null);
    realLibrarySelectionAbort.current?.abort();
    realLibrarySelectionGeneration.current++;
    realLibraryBusyRef.current = false;
    setRealLibraryBusy(false);
  }
  async function enterConversation() {
    if (conversationSendInFlight.current) return;
    conversationSendInFlight.current = true;
    invalidate();
    setConversationMode(true); setMode("mock_posting"); setSourceMode("fixture"); setEditDraftMode(false);
    clearRealLibraryContext(); setCurationSource("fixture"); setRequest(""); setIntent("");
    const token = ++generation.current, controller = new AbortController();
    conversationAbort.current?.abort(); conversationAbort.current = controller;
    setBusy(true); setRequestError("");
    try {
      if (conversationSession) {
        try {
          const refreshed = await getBenchConversation(conversationSession.sessionId, controller.signal);
          if (token === generation.current) { setConversationSession(refreshed); setConversationTurn(null); setConversationReceipt(null); }
          return;
        } catch (error) {
          if (!(error instanceof RelayApiError && error.status === 404)) throw error;
          if (token === generation.current) { setConversationSession(null); setConversationTurn(null); }
        }
      }
      const started = await startBenchConversation(controller.signal);
      if (token === generation.current) setConversationSession(started);
    } catch (error) { if (token === generation.current && !controller.signal.aborted) setRequestError(error instanceof Error ? error.message : "Mock conversation could not start."); }
    finally { conversationSendInFlight.current = false; if (token === generation.current) { setBusy(false); if (conversationAbort.current === controller) conversationAbort.current = null; } }
  }
  async function refreshConversation(sessionId: string, expectedGeneration: number) {
    try {
      const refreshed = await getBenchConversation(sessionId);
      if (expectedGeneration === generation.current) { setConversationSession(refreshed); setConversationTurn(null); setConversationReceipt(null); setDraftScheduleReview(null); setXHandoffReview(null); }
      return true;
    } catch (error) {
      if (expectedGeneration === generation.current && error instanceof RelayApiError && error.status === 404) {
        setConversationSession(null); setConversationTurn(null); setDraftScheduleReview(null); setRequestError("This mock conversation expired. Start a new Conversation to continue.");
        try { window.sessionStorage.removeItem("editor-bench-conversation-session"); } catch { /* Session storage can be unavailable. */ }
      }
      return false;
    }
  }
  async function reviewConversationXDraft(postId: string, destination: BenchConversationDestination) {
    if (!conversationSession || busy || conversationSendInFlight.current || xDraftBusy || previewOpen || previewHandshakeInFlight.current) return;
    const sessionId = conversationSession.sessionId;
    const token = ++generation.current, controller = new AbortController();
    conversationSendInFlight.current = true;
    conversationAbort.current?.abort(); conversationAbort.current = controller;
    const cellKey = `${postId}::${destination}`;
    setBusy(true); setCellBusyKey(cellKey); setXDraftBusy(true); setXDraftReview(null); setDraftScheduleReview(null); setRequestError("");
    setCellErrors(current => { const next = { ...current }; delete next[cellKey]; return next; });
    try {
      const reviewed = destination === "deviantart"
        ? await reviewBenchConversationDeviantArtDraft({ sessionId, revision: conversationSession.revision, postId }, controller.signal)
        : await reviewBenchConversationXDraft({ sessionId, revision: conversationSession.revision, postId }, controller.signal);
      if (token !== generation.current) return;
      setConversationSession(reviewed); setConversationTurn(null); setConversationReceipt(null); setXDraftReview(reviewed); setXHandoffReview(null);
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) {
        setXDraftReview(null);
        const refreshed = await refreshConversation(sessionId, token);
        if (token === generation.current) {
          const message = `${error instanceof Error ? error.message : "Draft review could not be prepared."}${refreshed ? " The current conversation was reloaded." : " Reload the conversation before continuing."}`;
          setCellErrors(current => ({ ...current, [cellKey]: message })); setRequestError(message);
        }
      }
    } finally {
      conversationSendInFlight.current = false;
      setCellBusyKey(null);
      setXDraftBusy(false);
      if (token === generation.current) { setBusy(false); if (conversationAbort.current === controller) conversationAbort.current = null; }
    }
  }
  async function updateConversationCell(postId: string, destination: BenchConversationDestination, action: "skip" | "restore") {
    if (!conversationSession || busy || conversationSendInFlight.current || xDraftBusy || previewOpen) return;
    const sessionId = conversationSession.sessionId;
    const cellKey = `${postId}::${destination}`;
    const token = ++generation.current, controller = new AbortController();
    conversationSendInFlight.current = true;
    conversationAbort.current?.abort(); conversationAbort.current = controller;
    setBusy(true); setCellBusyKey(cellKey); setXDraftReview(null); setDraftScheduleReview(null); setXHandoffReview(null); setRequestError("");
    try {
      const updated = await updateBenchConversationCell({ sessionId, revision: conversationSession.revision, postId, destination, action }, controller.signal);
      if (token !== generation.current) return;
      setConversationSession(updated); setConversationTurn(null); setConversationReceipt(null);
      setCellErrors(current => { const next = { ...current }; delete next[cellKey]; return next; });
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) {
        const refreshed = await refreshConversation(sessionId, token);
        if (token === generation.current) {
          const message = `${error instanceof Error ? error.message : `Cell could not be ${action === "skip" ? "skipped" : "restored"}.`}${refreshed ? " The current conversation was reloaded." : " Reload the conversation before continuing."}`;
          setCellErrors(current => ({ ...current, [cellKey]: message })); setRequestError(message);
        }
      }
    } finally {
      conversationSendInFlight.current = false; setCellBusyKey(null);
      if (token === generation.current) { setBusy(false); if (conversationAbort.current === controller) conversationAbort.current = null; }
    }
  }
  async function confirmConversationXDraft() {
    if (!conversationSession || !xDraftReview?.reviewToken || busy || conversationSendInFlight.current || xDraftBusy || previewOpen) return;
    const sessionId = conversationSession.sessionId, reviewToken = xDraftReview.reviewToken;
    const token = ++generation.current, controller = new AbortController();
    conversationSendInFlight.current = true; xDraftConfirming.current = true;
    conversationAbort.current?.abort(); conversationAbort.current = controller;
    setBusy(true); setXDraftBusy(true); setRequestError("");
    try {
      const confirm = xDraftReview.review.destination === "deviantart" ? confirmBenchConversationDeviantArtDraft : confirmBenchConversationXDraft;
      const result = await confirm({ sessionId, reviewToken }, controller.signal);
      if (token !== generation.current) return;
      setConversationSession(result); setConversationTurn(null); setConversationReceipt(null); setXDraftReview(null);
      setCellErrors(current => { const next = { ...current }; delete next[`${xDraftReview.review.postId}::${xDraftReview.review.destination}`]; return next; });
      setChat(messages => [...messages, `Unscheduled mock ${xDraftReview.review.destination === "deviantart" ? "DeviantArt" : "X"} draft created. Nothing was posted.`]);
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) {
        setXDraftReview(null);
        const refreshed = await refreshConversation(sessionId, token);
        if (token === generation.current) {
          const message = `${error instanceof Error ? error.message : `${xDraftReview?.review.destination === "deviantart" ? "DeviantArt" : "X"} draft confirmation status is unknown.`}${refreshed ? " The current conversation was reloaded; review the item again before confirming." : " Reload the conversation before continuing."}`;
          if (xDraftReview) setCellErrors(current => ({ ...current, [`${xDraftReview.review.postId}::${xDraftReview.review.destination}`]: message }));
          setRequestError(message);
        }
      }
    } finally {
      xDraftConfirming.current = false; conversationSendInFlight.current = false;
      setXDraftBusy(false);
      if (token === generation.current) { setBusy(false); if (conversationAbort.current === controller) conversationAbort.current = null; }
    }
  }
  async function toggleConversationPost(postId: string) {
    if (!conversationMode || busy || conversationSendInFlight.current || manualSelectionInFlight.current || previewOpen || previewHandshakeInFlight.current) return;
    manualSelectionInFlight.current = true;
    conversationSendInFlight.current = true;
    const token = ++generation.current, controller = new AbortController();
    let sessionId = conversationSession?.sessionId;
    conversationAbort.current?.abort(); conversationAbort.current = controller;
    setBusy(true); setManualSelectionBusy(true); setRequestError("");
    try {
      const current = conversationSession
        ? await getBenchConversation(conversationSession.sessionId, controller.signal)
        : await startBenchConversation(controller.signal);
      if (token !== generation.current) return;
      sessionId = current.sessionId;
      const updated = await toggleBenchConversationSelection({ sessionId: current.sessionId, revision: current.revision, postId }, controller.signal);
      if (token !== generation.current) return;
      setConversationSession(updated); setConversationTurn(null); setConversationReceipt(null); setXDraftReview(null); setDraftScheduleReview(null); setXHandoffReview(null);
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) {
        if (sessionId) await refreshConversation(sessionId, token);
        if (token === generation.current) setRequestError(error instanceof Error ? error.message : "Selection could not be updated. Review the current conversation and try again.");
      }
    } finally {
      manualSelectionInFlight.current = false;
      conversationSendInFlight.current = false;
      setManualSelectionBusy(false);
      if (token === generation.current) { setBusy(false); if (conversationAbort.current === controller) conversationAbort.current = null; }
    }
  }
  async function confirmConversation() {
    const turn = conversationTurn;
    if (!conversationSession || !turn?.reviewToken || busy || previewOpen || turn.status !== "review") return;
    const token = ++generation.current, controller = new AbortController();
    conversationAbort.current?.abort(); conversationAbort.current = controller;
    setBusy(true); setRequestError("");
    try {
      const result = await confirmBenchConversation({ sessionId: conversationSession.sessionId, reviewToken: turn.reviewToken }, controller.signal);
      if (token !== generation.current) return;
      setConversationSession(result); setConversationTurn(null); setConversationReceipt(result);
      setChat(messages => [...messages, result.receipt.kind === "edit" ? "Mock edit saved." : "Mock posting cue saved. Publishing is manual."]);
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) {
        const refreshed = await refreshConversation(conversationSession.sessionId, token);
        setRequestError(error instanceof Error
          ? `${error.message}${refreshed ? " The current mock conversation was reloaded." : " Reload the conversation before continuing."}`
          : `Confirmation status is unknown.${refreshed ? " The current mock conversation was reloaded." : " Reload the conversation before continuing."}`);
      }
    }
    finally {
      if (token === generation.current) { setBusy(false); if (conversationAbort.current === controller) conversationAbort.current = null; }
    }
  }
  async function reviewConversationDraftSchedule() {
    const draft = conversationSession?.confirmedDrafts?.find(item => item.variantId === scheduleVariantId);
    if (!conversationSession || !draft || draft.scheduledFor || busy || conversationSendInFlight.current || draftScheduleBusy || previewOpen) return;
    const sessionId = conversationSession.sessionId;
    const token = ++generation.current, controller = new AbortController();
    conversationSendInFlight.current = true; conversationAbort.current?.abort(); conversationAbort.current = controller;
    setBusy(true); setDraftScheduleBusy(true); setDraftScheduleReview(null); setXDraftReview(null); setRequestError("");
    try {
      const review = draft.destination === "deviantart" ? reviewBenchConversationDeviantArtDraftSchedule : reviewBenchConversationXDraftSchedule;
      const reviewed = await review({ sessionId, revision: conversationSession.revision, variantId: draft.variantId, localDate: scheduleDate, localTime: scheduleTime }, controller.signal);
      if (token !== generation.current) return;
      setConversationSession(reviewed); setDraftScheduleReview(reviewed); setXHandoffReview(null); setConversationTurn(null); setConversationReceipt(null);
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) {
        const refreshed = await refreshConversation(sessionId, token);
        if (token === generation.current) setRequestError(`${error instanceof Error ? error.message : "Schedule review could not be prepared."}${refreshed ? " The current conversation was reloaded." : " Reload the conversation before continuing."}`);
      }
    } finally {
      conversationSendInFlight.current = false; setDraftScheduleBusy(false);
      if (token === generation.current) { setBusy(false); if (conversationAbort.current === controller) conversationAbort.current = null; }
    }
  }
  async function confirmConversationDraftSchedule() {
    if (!conversationSession || !draftScheduleReview?.reviewToken || busy || conversationSendInFlight.current || draftScheduleBusy || previewOpen) return;
    const sessionId = conversationSession.sessionId, reviewToken = draftScheduleReview.reviewToken;
    const token = ++generation.current, controller = new AbortController();
    conversationSendInFlight.current = true; draftScheduleConfirming.current = true; conversationAbort.current?.abort(); conversationAbort.current = controller;
    setBusy(true); setDraftScheduleBusy(true); setRequestError("");
    try {
      const destination = draftScheduleReview.review.destination;
      const confirm = destination === "deviantart" ? confirmBenchConversationDeviantArtDraftSchedule : confirmBenchConversationXDraftSchedule;
      const result = await confirm({ sessionId, reviewToken }, controller.signal);
      if (token !== generation.current) return;
      setConversationSession(result); setDraftScheduleReview(null); setConversationTurn(null); setConversationReceipt(null);
      setChat(messages => [...messages, `Temporary mock ${destination === "deviantart" ? "DeviantArt" : "X"} posting cue scheduled. Publishing remains manual.`]);
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) {
        setDraftScheduleReview(null);
        const refreshed = await refreshConversation(sessionId, token);
        if (token === generation.current) setRequestError(`${error instanceof Error ? error.message : "Schedule confirmation status is unknown."}${refreshed ? " The current conversation was reloaded; review the item again before confirming." : " Reload the conversation before continuing."}`);
      }
    } finally {
      draftScheduleConfirming.current = false; conversationSendInFlight.current = false; setDraftScheduleBusy(false);
      if (token === generation.current) { setBusy(false); if (conversationAbort.current === controller) conversationAbort.current = null; }
    }
  }
  async function reviewConversationXHandoff(variantId: string) {
    if (!conversationSession || busy || conversationSendInFlight.current || xHandoffBusy || previewOpen) return;
    const sessionId = conversationSession.sessionId, token = ++generation.current, controller = new AbortController();
    conversationSendInFlight.current = true; conversationAbort.current?.abort(); conversationAbort.current = controller;
    setBusy(true); setXHandoffBusy(true); setXHandoffReview(null); setXDraftReview(null); setDraftScheduleReview(null); setRequestError("");
    try {
      const draft = conversationSession.confirmedDrafts?.find(item => item.variantId === variantId);
      const review = draft?.destination === "deviantart" ? reviewBenchConversationDeviantArtHandoff : reviewBenchConversationXHandoff;
      const reviewed = await review({ sessionId, revision: conversationSession.revision, variantId }, controller.signal);
      if (token !== generation.current) return;
      setConversationSession(reviewed); setXHandoffReview(reviewed); setConversationTurn(null); setConversationReceipt(null);
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) {
        const refreshed = await refreshConversation(sessionId, token);
        if (token === generation.current) setRequestError(`${error instanceof Error ? error.message : "Handoff review could not be prepared."}${refreshed ? " The current conversation was reloaded." : " Reload the conversation before continuing."}`);
      }
    } finally {
      conversationSendInFlight.current = false; setXHandoffBusy(false);
      if (token === generation.current) { setBusy(false); if (conversationAbort.current === controller) conversationAbort.current = null; }
    }
  }
  async function openConversationXHandoff(sessionId: string, handoffId: string, destination: "x" | "deviantart" = "x") {
    if (extensionBusyRef.current) return;
    const token = generation.current;
    extensionBusyRef.current = true; setXHandoffBusy(true); setXHandoffOutcome(null);
    try {
      const result = destination === "deviantart"
        ? await sendRelayBenchDeviantArtHandoffToExtension(sessionId, handoffId)
        : await sendRelayBenchXHandoffToExtension(sessionId, handoffId);
      if (token === generation.current) setXHandoffOutcome({ handoffId, kind: result.ok ? "success" : "error", message: result.ok ? `${destination === "deviantart" ? "DeviantArt" : "X Compose"} opened. Review the draft and publish manually.` : result.error });
    } finally { extensionBusyRef.current = false; setXHandoffBusy(false); }
  }
  async function confirmConversationXHandoff() {
    if (!conversationSession || !xHandoffReview?.reviewToken || busy || conversationSendInFlight.current || xHandoffBusy || previewOpen) return;
    const sessionId = conversationSession.sessionId, reviewToken = xHandoffReview.reviewToken;
    const token = ++generation.current, controller = new AbortController();
    conversationSendInFlight.current = true; xHandoffConfirming.current = true; conversationAbort.current?.abort(); conversationAbort.current = controller;
    setBusy(true); setXHandoffBusy(true); setRequestError("");
    try {
      const destination = xHandoffReview.review.destination;
      const confirm = destination === "deviantart" ? confirmBenchConversationDeviantArtHandoff : confirmBenchConversationXHandoff;
      const result = await confirm({ sessionId, reviewToken }, controller.signal);
      if (token !== generation.current) return;
      setConversationSession(result); setXHandoffReview(null); setConversationTurn(null); setConversationReceipt(null);
      if (!result.reused) await openConversationXHandoff(sessionId, result.receipt.handoffId, destination);
      else setXHandoffOutcome({ handoffId: result.receipt.handoffId, kind: "success", message: `This handoff is already confirmed. Use Open ${destination === "deviantart" ? "DeviantArt" : "X"} again to open another compose tab.` });
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) {
        setXHandoffReview(null);
        const refreshed = await refreshConversation(sessionId, token);
        if (token === generation.current) setRequestError(`${error instanceof Error ? error.message : "Handoff confirmation status is unknown."}${refreshed ? ` The current conversation was reloaded; use Open ${xHandoffReview.review.destination === "deviantart" ? "DeviantArt" : "X"} again if the receipt was saved.` : " Reload the conversation before continuing."}`);
      }
    } finally {
      conversationSendInFlight.current = false; xHandoffConfirming.current = false; setXHandoffBusy(false);
      if (token === generation.current) { setBusy(false); if (conversationAbort.current === controller) conversationAbort.current = null; }
    }
  }
  async function openConversationPreview(postId: string, mediaId: string) {
    if (!conversationSession || !conversationSession.preparation || busy || previewOpen || previewHandshakeInFlight.current) return;
    setXDraftReview(null);
    setDraftScheduleReview(null);
    setXHandoffReview(null);
    previewReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previewHandshakeInFlight.current = true;
    const token = generation.current;
    setPreviewBusyMediaId(mediaId); setPreviewError("");
    setBusy(true);
    try {
      const opened = await openBenchConversationPreview({ sessionId: conversationSession.sessionId, revision: conversationSession.revision, postId, mediaId });
      if (token !== generation.current) {
        await cancelBenchConversationPreview(opened.sessionId, opened.attempt.id).catch(() => undefined);
        return;
      }
      setConversationSession(opened);
      setPreviewOpen(opened);
    } catch (error) {
      if (token === generation.current) setPreviewError(error instanceof Error ? error.message : "Previewizer could not open this fixture image.");
    } finally {
      previewHandshakeInFlight.current = false;
      if (token === generation.current) { setPreviewBusyMediaId(null); setBusy(false); }
    }
  }
  async function uploadConversationPreview(blob: Blob) {
    if (!previewOpen) throw new Error("This Previewizer attempt has ended. Open the selected image again.");
    const token = generation.current;
    const uploaded = await uploadBenchConversationPreview(previewOpen.sessionId, previewOpen.attempt.id, blob);
    if (token !== generation.current) throw new Error("The conversation changed. Open the selected fixture image again.");
    return { mediaId: uploaded.previewMediaId };
  }
  async function completeConversationPreview(result: { previewMediaId: string }) {
    if (!previewOpen) throw new Error("This Previewizer attempt has ended. Open the selected image again.");
    const token = generation.current;
    const completed = await completeBenchConversationPreview(previewOpen.sessionId, previewOpen.attempt.id, result.previewMediaId);
    if (token !== generation.current) throw new Error("The conversation changed. Review its current preview status.");
    setConversationSession(completed); setXDraftReview(null);
    setPreviewOpen(null);
    setPreviewError("");
    setChat(messages => [...messages, `Mock preview export saved. Review the destination cells to create unscheduled drafts.`]);
  }
  async function cancelConversationPreview() {
    const current = previewOpen;
    if (!current || previewHandshakeInFlight.current) return;
    previewHandshakeInFlight.current = true;
    const token = generation.current;
    setPreviewOpen(null);
    setPreviewBusyMediaId(current.attempt.sourceMediaId);
    setBusy(true);
    try {
      const snapshot = await cancelBenchConversationPreview(current.sessionId, current.attempt.id);
      if (token === generation.current && conversationSession?.sessionId === current.sessionId) setConversationSession(snapshot);
    } catch (error) {
      if (token === generation.current) setPreviewError(error instanceof Error ? error.message : "The Previewizer attempt could not be cancelled.");
    } finally {
      previewHandshakeInFlight.current = false;
      if (token === generation.current) { setPreviewBusyMediaId(null); setBusy(false); }
    }
  }
  function clearRealLibraryContext() {
    realLibraryCatalogGeneration.current++;
    realLibraryCatalogAbort.current?.abort();
    realLibrarySelectionGeneration.current++;
    realLibrarySelectionAbort.current?.abort();
    realLibraryBusyRef.current = false;
    setRealLibraryCatalog(null); setRealLibrarySelection(null); setRealLibrarySelectedIds([]);
    setRealLibraryLoading(false); setRealLibraryBusy(false); setRealLibraryError(null);
  }
  async function loadRealLibraryCatalog() {
    // An explicit catalogue reload starts a new real-Library selection context.
    // Advancing both generations and aborting here prevents an older selection
    // response from being applied to the replacement catalogue. Typing does not
    // call this path and therefore keeps the current refinement state intact.
    invalidate();
    realLibrarySelectionAbort.current?.abort();
    realLibrarySelectionGeneration.current++;
    realLibraryBusyRef.current = false;
    setRealLibraryBusy(false);
    setRealLibraryCatalog(null);
    setRealLibrarySelection(null);
    setRealLibrarySelectedIds([]);
    setRealLibraryError(null);
    realLibraryCatalogAbort.current?.abort();
    const controller = new AbortController();
    realLibraryCatalogAbort.current = controller;
    const token = ++realLibraryCatalogGeneration.current;
    setRealLibraryLoading(true); setRealLibraryError(null);
    try {
      const catalog = await fetchRealLibrarySelectionCatalog(controller.signal);
      if (!isRealLibraryCatalog(catalog)) throw new Error("The real Library catalog response was incomplete or malformed.");
      if (token === realLibraryCatalogGeneration.current) {
        setRealLibraryCatalog(catalog); setRealLibrarySelection(null); setRealLibrarySelectedIds([]); setRealLibraryError(null);
      }
    } catch (error) {
      if (token === realLibraryCatalogGeneration.current && !controller.signal.aborted) setRealLibraryError({ code: error instanceof RealLibrarySelectionApiError ? error.code : null, message: error instanceof Error ? error.message : "The real Library catalog could not load." });
    } finally {
      if (token === realLibraryCatalogGeneration.current) setRealLibraryLoading(false);
    }
  }
  async function sendRealLibrarySelection(latestRequest: string) {
    if (!realLibraryCatalog) { setRealLibraryError({ code: null, message: "Load the real Library catalog before selecting." }); return; }
    const token = ++generation.current;
    requestAbort.current?.abort();
    const controller = new AbortController(); requestAbort.current = controller;
    setBusy(true); setRequestError(""); setRealLibraryError(null); setResponse(null);
    try {
      const result = await updateRealLibrarySelection({ kind: "select", latestRequest, state: realLibrarySelection }, controller.signal);
      if (!isRealLibrarySelectionResult(result, realLibraryCatalog)) throw new Error("The real Library selection response was malformed.");
      if (token === generation.current) {
        if (result.status === "selected" || result.status === "unchanged") {
          setRealLibrarySelection(result.refinementState); setRealLibrarySelectedIds(result.selection.postIds); setRealLibraryError(null);
        }
        setChat(messages => [...messages, result.message]);
      }
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) {
        setRealLibraryError({ code: error instanceof RealLibrarySelectionApiError ? error.code : null, message: error instanceof Error ? error.message : "The real Library selection could not be updated." });
      }
    } finally { if (token === generation.current) setBusy(false); }
  }
  async function resetRealLibrarySelection() {
    if (!realLibraryCatalog || busy || realLibraryBusyRef.current) return;
    realLibraryBusyRef.current = true;
    const token = ++generation.current;
    realLibrarySelectionAbort.current?.abort();
    const controller = new AbortController(); realLibrarySelectionAbort.current = controller;
    const selectionToken = ++realLibrarySelectionGeneration.current;
    setRealLibraryBusy(true); setRealLibraryError(null);
    try {
      const result = await updateRealLibrarySelection({ kind: "reset", catalogRevision: realLibraryCatalog.catalogRevision }, controller.signal);
      if (!isRealLibrarySelectionResult(result, realLibraryCatalog) || result.selection.postIds.length || result.refinementState.excludedPostIds.length) throw new Error("The reset response was invalid.");
      if (token === generation.current && selectionToken === realLibrarySelectionGeneration.current) {
        setRealLibrarySelectedIds([]); setRealLibrarySelection(null); setRealLibraryError(null); setChat(messages => [...messages, result.message]);
      }
    } catch (error) {
      if (token === generation.current && selectionToken === realLibrarySelectionGeneration.current && !controller.signal.aborted) setRealLibraryError({ code: error instanceof RealLibrarySelectionApiError ? error.code : null, message: error instanceof Error ? error.message : "The real Library selection could not be reset." });
    } finally {
      if (selectionToken === realLibrarySelectionGeneration.current) { realLibraryBusyRef.current = false; setRealLibraryBusy(false); }
    }
  }
  async function toggleRealLibraryPost(postId: string) {
    if (!realLibraryCatalog || busy || realLibraryBusyRef.current) return;
    const currentlySelected = realLibrarySelectedIds.includes(postId);
    const state = realLibrarySelection ?? { v: 1 as const, scope: "real_library" as const, catalogRevision: realLibraryCatalog.catalogRevision, selectedPostIds: [], excludedPostIds: [] };
    invalidate();
    realLibraryBusyRef.current = true;
    const token = generation.current, selectionToken = ++realLibrarySelectionGeneration.current;
    const controller = new AbortController(); realLibrarySelectionAbort.current = controller;
    setRealLibraryBusy(true); setRealLibraryError(null);
    try {
      const result = await updateRealLibrarySelection({ kind: "toggle", catalogRevision: realLibraryCatalog.catalogRevision, postId, selected: !currentlySelected, state }, controller.signal);
      if (!isRealLibrarySelectionResult(result, realLibraryCatalog)) throw new Error("The real Library toggle response was malformed.");
      if (token === generation.current && selectionToken === realLibrarySelectionGeneration.current && (result.status === "selected" || result.status === "unchanged")) {
        setRealLibrarySelection(result.refinementState); setRealLibrarySelectedIds(result.selection.postIds); setRealLibraryError(null);
      }
    } catch (error) {
      if (token === generation.current && selectionToken === realLibrarySelectionGeneration.current && !controller.signal.aborted) setRealLibraryError({ code: error instanceof RealLibrarySelectionApiError ? error.code : null, message: error instanceof Error ? error.message : "The Library item could not be selected." });
    } finally {
      if (selectionToken === realLibrarySelectionGeneration.current) { realLibraryBusyRef.current = false; setRealLibraryBusy(false); }
    }
  }
  async function requestScheduleReview(latestRequest: string, structuredIntent: unknown, selection: { postIds: string[]; mediaIds: string[] }) {
    const parentToken = generation.current;
    const token = ++scheduleGeneration.current;
    const previousReview = scheduleReview;
    setScheduleError("");
    setScheduleBusy(true);
    try {
      const review = await reviewBenchSchedule({
        latestRequest,
        structuredIntent,
        selectedPostIds: selection.postIds,
        selectedMediaIds: selection.mediaIds,
      });
      if (token === scheduleGeneration.current && parentToken === generation.current) {
        if (review.reviewKind === "manual_batch") {
          const oldItems = previousReview && "items" in previousReview ? previousReview.items : [];
          setBatchReceipts(current => Object.fromEntries(Object.entries(current).filter(([destination]) => {
            const oldItem = oldItems.find(item => item.destination === destination);
            const nextItem = review.items.find(item => item.destination === destination);
            return !!oldItem && !!nextItem && JSON.stringify(oldItem.review.createPayload) === JSON.stringify(nextItem.review.createPayload);
          })));
        }
        setRowErrors({});
        setScheduleReview(review);
      }
    } catch (error) {
      if (token === scheduleGeneration.current && parentToken === generation.current) setScheduleError(error instanceof Error ? error.message : "Schedule review failed.");
    } finally {
      if (token === scheduleGeneration.current && parentToken === generation.current) setScheduleBusy(false);
    }
  }
  function loadExample(example: BenchExample) {
    invalidate();
    setConversationMode(false);
    setEditDraftMode(false);
    clearRealLibraryContext();
    setRefinementState(null);
    pair.current = example;
    setSourceMode("fixture");
    setCurationSource("fixture");
    setMode(example.mode);
    setSelected(example.selectedPostIds);
    setRequest(example.latestRequest);
    setIntent(JSON.stringify(example.structuredIntent, null, 2));
    setChat(messages => [...messages, `Example loaded: ${example.title}`]);
  }

  async function submit(body: unknown, addChatReply = false, freeTextRequest?: string, options?: { refinementState?: BenchRefinementState | null; includeRefinementState?: boolean }) {
    if (busy) return;
    const token = ++generation.current;
    extensionGeneration.current++;
    setExtensionOutcome(null);
    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    setBusy(true);
    setResponse(null);
    setRequestError("");
    scheduleGeneration.current++;
    setScheduleReview(null);
    setScheduleError("");
    setScheduleBusy(false);
    setReceipt(null);
    setBatchReceipts({});
    setRowErrors({});
    acceptedFreeTextProposal.current = null;
    try {
      const requestBody = options?.includeRefinementState ? { ...(body as Record<string, unknown>), refinementState: options.refinementState ?? null } : body;
      const result = await fetch("/api/editor-bench", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody), signal: controller.signal });
      const value = await result.json();
      if (!result.ok) throw new Error(value?.error ? `Request failed: ${value.error}` : `Request failed (${result.status}).`);
      if (!isBenchResponse(value, catalog!)) throw new Error("The bench returned an invalid response.");
      if (token === generation.current) {
        setResponse(value);
        let acceptedRefinement: (BenchResponse & { selection: NonNullable<BenchResponse["selection"]>; refinementState: BenchRefinementState }) | null = null;
        if (options?.includeRefinementState && isSelectionOnlyRefinement(value, catalog!)) acceptedRefinement = value;
        if (acceptedRefinement) {
          setSelected(acceptedRefinement.refinementState.selectedPostIds);
          setRefinementState(acceptedRefinement.refinementState);
        } else if (options?.includeRefinementState && options.refinementState === null && value.status === "proposal" && value.provenance === "model_interpretation" && value.selection) {
          setSelected(value.selection.postIds);
        } else if (!options?.includeRefinementState && value.selection) setSelected(value.selection.postIds);
        setCatalog(current => current && value.runtime ? { ...current, runtime: value.runtime } : current);
        if (value.message || addChatReply) setChat(messages => [...messages, value.message || `${value.status.replaceAll("_", " ")} · ${value.provenance.replaceAll("_", " ")}`]);
        if (freeTextRequest && mode === "mock_posting" && value.status === "proposal" && value.provenance === "model_interpretation" && value.interpreted && value.selection) {
          acceptedFreeTextProposal.current = freeTextRequest;
          void requestScheduleReview(freeTextRequest, value.interpreted, value.selection);
        }
      }
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) setRequestError(error instanceof Error ? error.message : "Request failed.");
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }

  async function replay() {
    if (!catalog) return;
    clearRealLibraryContext();
    setCurationSource("fixture");
    setRefinementState(null);
    let body: any;
    try {
      const parsed = JSON.parse(intent);
      const isPairedExample = pair.current && pair.current.mode === mode && pair.current.latestRequest === request && JSON.stringify(pair.current.structuredIntent) === JSON.stringify(parsed);
      body = isPairedExample
        ? { mode, selectedPostIds: selected, selectedMediaIds: pair.current!.selectedMediaIds, replay: { kind: "example", exampleId: pair.current!.id } }
        : { mode, selectedPostIds: selected, selectedMediaIds: catalog.media.filter(item => selected.includes(item.postId)).map(item => item.id), replay: { kind: "edited", latestRequest: request, structuredIntent: parsed } };
    } catch {
      setRequestError("Intent must be valid JSON.");
      return;
    }
    await submit(body);
  }

  async function send() {
    if (!request.trim() || !catalog || busy || previewOpen || realLibraryBusyRef.current) return;
    const text = request;
    if (conversationMode) {
      if (conversationSendInFlight.current) return;
      conversationSendInFlight.current = true;
      const token = ++generation.current, controller = new AbortController();
      conversationAbort.current?.abort(); conversationAbort.current = controller;
      setChat(messages => [...messages, text]); setBusy(true); setRequestError(""); setConversationTurn(null); setConversationReceipt(null); setXDraftReview(null); setDraftScheduleReview(null); setXHandoffReview(null);
      try {
        const current = conversationSession
          ? await getBenchConversation(conversationSession.sessionId, controller.signal)
          : await startBenchConversation(controller.signal);
        if (token !== generation.current) return;
        setConversationSession(current);
        const turn = await sendBenchConversationTurn({ sessionId: current.sessionId, revision: current.revision, latestRequest: text }, controller.signal);
        if (token !== generation.current) return;
        setConversationSession(turn); setConversationTurn(turn);
        if (turn.message) setChat(messages => [...messages, turn.message!]);
        else if (turn.status === "selected") setChat(messages => [...messages, `Selection updated. ${turn.selection.postIds.length} post${turn.selection.postIds.length === 1 ? "" : "s"} selected.`]);
        else if (turn.status === "review") setChat(messages => [...messages, "Review the proposed change below. Confirm it to apply the mock change."]);
      } catch (error) {
        if (token === generation.current && !controller.signal.aborted) {
          const refreshed = conversationSession ? await refreshConversation(conversationSession.sessionId, token) : false;
          setRequestError(error instanceof Error
            ? `${error.message}${conversationSession ? (refreshed ? " The current mock conversation was reloaded." : " Start a new Conversation before continuing.") : ""}`
            : `Conversation status is unknown.${conversationSession ? (refreshed ? " The current mock conversation was reloaded." : " Start a new Conversation before continuing.") : ""}`);
        }
      }
      finally {
        conversationSendInFlight.current = false;
        if (token === generation.current) { setBusy(false); if (conversationAbort.current === controller) conversationAbort.current = null; }
      }
      return;
    }
    if (mode === "mock_posting" && sourceMode === "fixture" && editDraftMode) {
      const token = ++generation.current;
      const controller = new AbortController();
      variantEditAbort.current?.abort();
      variantEditAbort.current = controller;
      setChat(messages => [...messages, text]);
      setBusy(true); setRequestError(""); setVariantEditReview(null); setVariantEditReceipt(null);
      try {
        const result = await chatBenchVariantEdit(text, controller.signal);
        if (token !== generation.current) return;
        setVariantEditReview(result);
        if (result.decision === "clarification" && result.question) setChat(messages => [...messages, result.question!]);
      } catch (error) { if (token === generation.current && !controller.signal.aborted) setRequestError(error instanceof Error ? error.message : "Draft edit review failed."); }
      finally { if (token === generation.current) { setBusy(false); if (variantEditAbort.current === controller) variantEditAbort.current = null; } }
      return;
    }
    if (mode === "curation" && ["start over", "reset selection"].includes(text.trim().toLowerCase())) {
      setChat(messages => [...messages, text]);
      if (curationSource === "real_library") await resetRealLibrarySelection(); else await resetSelection();
      return;
    }
    if (mode === "curation" && curationSource === "real_library") {
      setChat(messages => [...messages, text]);
      await sendRealLibrarySelection(text);
      return;
    }
    if (mode === "mock_posting" && sourceMode === "real_library") {
      if (!libraryPost || libraryMediaIds.length < 1 || libraryMediaIds.length > 3) { setRequestError("Choose one Library post and 1–3 ready files."); return; }
      const token = ++generation.current;
      extensionGeneration.current++;
      setExtensionOutcome(null);
      const controller = new AbortController();
      realRequestAbort.current?.abort();
      realRequestAbort.current = controller;
      scheduleGeneration.current++;
      const selectedMedia = [...libraryMediaIds];
      setChat(messages => [...messages, text]);
      setBusy(true); setRequestError(""); setScheduleError(""); setScheduleReview(null); setScheduleBusy(false); setReceipt(null); setBatchReceipts({}); setRowErrors({});
      realRequest.current = { latestRequest: text, postId: libraryPost.postId, mediaIds: selectedMedia };
      try {
        const result = await reviewRealLibrarySchedule({ latestRequest: text, postId: libraryPost.postId, mediaIds: selectedMedia }, controller.signal);
        if (token !== generation.current) return;
        if ("kind" in result && result.kind === "clarification") { setChat(messages => [...messages, result.question]); return; }
        setScheduleReview(result); setScheduleError("");
      } catch (error) { if (token === generation.current && !controller.signal.aborted) setScheduleError(error instanceof Error ? error.message : "Schedule review failed."); }
      finally { if (token === generation.current) { setBusy(false); if (realRequestAbort.current === controller) realRequestAbort.current = null; } }
      return;
    }
    const selectedAtSend = [...selected];
    pair.current = null;
    setChat(messages => [...messages, text]);
    await submit({ mode, selectedPostIds: selectedAtSend, selectedMediaIds: catalog.media.filter(item => selectedAtSend.includes(item.postId)).map(item => item.id), replay: { kind: "free_text", latestRequest: text } }, true, text, mode === "curation" ? { includeRefinementState: true, refinementState } : undefined);
  }

  async function confirmVariantEdit() {
    const review = variantEditReview;
    if (!review?.reviewToken || busy) return;
    const token = ++generation.current;
    const controller = new AbortController();
    variantEditAbort.current?.abort(); variantEditAbort.current = controller;
    setBusy(true); setRequestError("");
    try {
      const result = await confirmBenchVariantEdit(review.reviewToken, controller.signal);
      if (token !== generation.current) return;
      setVariantEditReceipt(result); setVariantEditReview(null);
    } catch (error) { if (token === generation.current && !controller.signal.aborted) setRequestError(error instanceof Error ? error.message : "Draft edit could not be confirmed."); }
    finally { if (token === generation.current) { setBusy(false); if (variantEditAbort.current === controller) variantEditAbort.current = null; } }
  }

  async function resetSelection() {
    if (!catalog || busy || mode !== "curation") return;
    const token = ++generation.current;
    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    realRequestAbort.current?.abort();
    scheduleGeneration.current++;
    setBusy(true); setRequestError(""); setResponse(null); setScheduleReview(null); setScheduleError(""); setScheduleBusy(false); setReceipt(null); setBatchReceipts({}); setRowErrors({});
    try {
      const result = await fetch("/api/editor-bench", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "curation", selectedPostIds: [], selectedMediaIds: [], replay: { kind: "selection_reset" } }), signal: controller.signal });
      const value = await result.json();
      if (!result.ok) throw new Error(value?.error ? `Request failed: ${value.error}` : `Request failed (${result.status}).`);
      if (!isBenchResponse(value, catalog) || !value.selection || value.selection.postIds.length !== 0 || value.selection.mediaIds.length !== 0 || !isBenchRefinementState(value.refinementState, catalog, []) || value.refinementState.excludedPostIds.length !== 0) throw new Error("The reset response was invalid.");
      if (token === generation.current) {
        setResponse(value); setSelected([]); setRefinementState(null);
        setCatalog(current => current && value.runtime ? { ...current, runtime: value.runtime } : current);
      }
    } catch (error) {
      if (token === generation.current && !controller.signal.aborted) setRequestError(error instanceof Error ? error.message : "Selection could not be reset.");
    } finally { if (token === generation.current) { setBusy(false); if (requestAbort.current === controller) requestAbort.current = null; } }
  }

  async function chooseLibraryPost(postId: string) {
    const token = ++sourceReadGeneration.current;
    invalidate(); setLibraryPost(null); setLibraryMediaIds([]);
    if (!postId) { setLibraryLoading(false); return; }
    setLibraryLoading(true);
    try { const detail = await fetchRealLibraryPost(postId); if (token === sourceReadGeneration.current) setLibraryPost(detail); }
    catch (error) { if (token === sourceReadGeneration.current) setScheduleError(error instanceof Error ? error.message : "Library post could not load."); }
    finally { if (token === sourceReadGeneration.current) setLibraryLoading(false); }
  }
  function retryRealLibraryReview() {
    const requestData = realRequest.current;
    if (!requestData || !scheduleReview || scheduleReview.reviewKind !== "real_library_manual") return;
    const previous = scheduleReview;
    const parentToken = generation.current;
    const token = ++scheduleGeneration.current;
    setScheduleBusy(true); setScheduleError("");
    void reviewRealLibraryAgain({ latestRequest: requestData.latestRequest, source: previous.source, intent: previous.intent }).then(next => {
      if (parentToken !== generation.current || token !== scheduleGeneration.current) return;
      const sameAttachment = previous.source.postId === next.source.postId && JSON.stringify(previous.source.mediaIds) === JSON.stringify(next.source.mediaIds);
      setBatchReceipts(current => Object.fromEntries(Object.entries(current).filter(([destination]) => {
        const oldItem = previous.items.find(item => item.destination === destination), newItem = next.items.find(item => item.destination === destination);
        return sameAttachment && !!oldItem && !!newItem && JSON.stringify(oldItem.review.createPayload) === JSON.stringify(newItem.review.createPayload) && JSON.stringify(oldItem.review.attachment?.mediaIds) === JSON.stringify(newItem.review.attachment?.mediaIds) && oldItem.review.attachment?.postId === newItem.review.attachment?.postId;
      })));
      setRowErrors({});
      setScheduleReview(next);
    }).catch(error => { if (parentToken === generation.current && token === scheduleGeneration.current) setScheduleError(error instanceof Error ? error.message : "Schedule review failed."); }).finally(() => { if (parentToken === generation.current && token === scheduleGeneration.current) setScheduleBusy(false); });
  }

  async function confirmSchedule(reviewToken: string, destination?: "patreon" | "x" | "deviantart") {
    if (!scheduleReview || scheduleBusy || (destination ? !!batchReceipts[destination] : !!receipt)) return;
    const currentReview = scheduleReview;
    const token = scheduleGeneration.current;
    setScheduleBusy(true);
    setScheduleError("");
    if (destination) setRowErrors(current => ({ ...current, [destination]: "" }));
    try {
      const result = await confirmBenchSchedule(reviewToken);
      if (token === scheduleGeneration.current) {
        if (destination && isGroupedReview(currentReview)) setBatchReceipts(current => ({ ...current, [destination]: result }));
        else { setReceipt(result); setScheduleReview(null); }
      }
    } catch (error) {
      if (token === scheduleGeneration.current) {
        const message = error instanceof Error ? error.message : "Confirmation failed.";
        if (destination && isGroupedReview(currentReview)) setRowErrors(current => ({ ...current, [destination]: message }));
        else setScheduleError(message);
      }
    } finally {
      if (token === scheduleGeneration.current) setScheduleBusy(false);
    }
  }

  async function openSavedXEvent(eventId: string) {
    if (extensionBusyRef.current) return;
    extensionBusyRef.current = true;
    const parentToken = generation.current;
    const token = ++extensionGeneration.current;
    setExtensionBusy(true);
    setExtensionOutcome(null);
    try {
      const result = await sendRelayScheduleEventToExtension(eventId);
      if (parentToken !== generation.current || token !== extensionGeneration.current) return;
      setExtensionOutcome({
        eventId,
        kind: result.ok ? "success" : "error",
        message: result.ok ? "X opened. Check the text and images, then publish on X." : result.error
      });
    } catch (error) {
      if (parentToken === generation.current && token === extensionGeneration.current) {
        setExtensionOutcome({ eventId, kind: "error", message: error instanceof Error ? error.message : "The Relay extension could not open X." });
      }
    } finally {
      extensionBusyRef.current = false;
      setExtensionBusy(false);
    }
  }

  const canRetryScheduleReview = mode === "mock_posting" && response?.mode === "mock_posting" && response.status === "proposal" &&
    response.provenance === "model_interpretation" && !!response.interpreted && !!response.selection && !!request.trim() && acceptedFreeTextProposal.current === request;

  function readableFields(serialized: string | null) {
    if (!serialized) return [];
    try {
      const value = JSON.parse(serialized);
      if (!value || typeof value !== "object" || Array.isArray(value)) return [["Value", serialized]];
      const idLabel = (id: string) => catalog?.cards.find(card => card.postId === id)?.title ?? (id === "bench_collection_studies" ? "Field notes" : id);
      return Object.entries(value).map(([key, raw]) => {
        const label = key.replace(/[A-Z]/g, char => ` ${char.toLowerCase()}`).replace(/^./, char => char.toUpperCase());
        const isIdentifier = key === "postId" || key === "post_id" || key === "collectionId" || key === "collection_id" || key === "postIds" || key === "post_ids" || key === "collectionIds" || key === "collection_ids";
        const display = isIdentifier && Array.isArray(raw) ? raw.map(id => typeof id === "string" ? idLabel(id) : String(id)).join(", ")
          : isIdentifier && typeof raw === "string" ? idLabel(raw) : typeof raw === "string" ? raw : JSON.stringify(raw);
        return [label, display, JSON.stringify(raw)];
      });
    } catch { return [["Value", serialized]]; }
  }

  if (!catalog) return <main className="p-8 text-slate-900">{catalogError ? <div>{catalogError} <button onClick={() => void loadCatalog()} className="underline">Retry</button></div> : "Loading…"}</main>;
  const runtime = catalog.runtime;
  const directProposal = response?.result?.manualPostingEvent;
  const directProposals = response?.result?.manualPostingEvents;
  const showDirectProposal = !scheduleReview && !receipt && Object.keys(batchReceipts).length === 0 && response?.mode === "mock_posting" && response.status === "proposal" &&
    directProposal && ["x", "deviantart"].includes(directProposal.destination) && directProposal.source && directProposal.dueAt;
  const showBatchProposal = !scheduleReview && !receipt && Object.keys(batchReceipts).length === 0 && response?.mode === "mock_posting" && response.status === "proposal" && Array.isArray(directProposals) && directProposals.length > 0;
  const budgetLabel = runtime?.remainingUsd === null || runtime?.remainingUsd === undefined ? "budget unknown" : `$${runtime.remainingUsd.toFixed(4)} left`;
  return <main className="min-h-screen bg-[#f5f5f2] p-6 text-slate-900"><div className="mx-auto max-w-5xl">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Editor bench</h1><p className="text-xs text-slate-500">{conversationMode ? "Mock conversation · temporary synthetic state · not saved to the durable Schedule Rail." : mode === "curation" && curationSource === "real_library" ? "REAL LIBRARY CURATION · metadata-only selection · no edits or publishing." : mode === "mock_posting" && sourceMode === "real_library" ? "REAL LIBRARY SOURCE · selected owned media · manual Schedule Rail cues only · no automatic publishing." : "Demo · synthetic sample data · no real posts. Confirmed reviews save manual Schedule Rail events only."}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs text-slate-600">{runtime?.enabled ? `${runtime.model ?? "Model ready"} · ${budgetLabel}` : `AI unavailable · ${budgetLabel}`}</span></header>
    <section className="mb-5 rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{(["curation", "mock_posting"] as BenchMode[]).map(value => <button key={value} disabled={busy || previewOpen !== null} onClick={() => { invalidate(); setConversationMode(false); setEditDraftMode(false); clearRealLibraryContext(); setRefinementState(null); setCurationSource("fixture"); pair.current = null; setMode(value); setRequest(""); setIntent(""); }} className={`rounded-full px-3 py-1.5 text-sm ${!conversationMode && mode === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"} disabled:opacity-50`}>{value === "curation" ? "Curation" : "Mock posting"}</button>)}<button type="button" disabled={busy || previewOpen !== null} onClick={() => void enterConversation()} aria-pressed={conversationMode} className={`rounded-full px-3 py-1.5 text-sm ${conversationMode ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"} disabled:opacity-50`}>Conversation</button></div>{!conversationMode && <details className="text-sm"><summary className="cursor-pointer text-slate-600">Examples</summary>{mode === "curation" && curationSource === "real_library" && <p className="mt-2 text-xs text-slate-500">Loading an example switches back to synthetic fixtures.</p>}<div className="mt-2 flex flex-wrap gap-2">{catalog.examples.filter(example => example.mode === mode).map(example => <button key={example.id} onClick={() => loadExample(example)} className="rounded-lg border px-3 py-1.5">Load {example.title}</button>)}</div></details>}</div>
      {mode === "curation" && <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3"><p className="text-sm font-semibold">Curation source</p><div className="mt-2 flex gap-2"><button onClick={() => { invalidate(); clearRealLibraryContext(); setRefinementState(null); setCurationSource("fixture"); }} className={`rounded-full px-3 py-1.5 text-sm ${curationSource === "fixture" ? "bg-slate-900 text-white" : "bg-white"}`}>Synthetic fixtures</button><button onClick={() => { invalidate(); clearRealLibraryContext(); setRefinementState(null); setCurationSource("real_library"); void loadRealLibraryCatalog(); }} className={`rounded-full px-3 py-1.5 text-sm ${curationSource === "real_library" ? "bg-amber-800 text-white" : "bg-white"}`}>Real Library</button></div></div>}
      {mode === "mock_posting" && !conversationMode && <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
        <p className="text-sm font-semibold">Posting source</p><div className="mt-2 flex gap-2">
          <button onClick={() => { sourceReadGeneration.current++; setLibraryLoading(false); invalidate(); setRefinementState(null); setSourceMode("fixture"); }} className={`rounded-full px-3 py-1.5 text-sm ${sourceMode === "fixture" ? "bg-slate-900 text-white" : "bg-white"}`}>Synthetic fixture</button>
          <button onClick={() => { invalidate(); setEditDraftMode(false); setRefinementState(null); setSourceMode("real_library"); if (!libraryPosts.length) { setLibraryLoading(true); void fetchRealLibraryPosts().then(setLibraryPosts).catch(error => setScheduleError(error instanceof Error ? error.message : "Library posts could not load.")).finally(() => setLibraryLoading(false)); } }} className={`rounded-full px-3 py-1.5 text-sm ${sourceMode === "real_library" ? "bg-amber-800 text-white" : "bg-white"}`}>Real Library</button>
        </div>
        {sourceMode === "real_library" && <div className="mt-3 space-y-3">
          <p className="text-xs text-amber-950">Real owned Library media · selected files will be referenced by each manually confirmed Schedule Rail cue. Nothing is published automatically.</p>
          <label className="block text-sm">Owned post<select value={libraryPost?.postId ?? ""} onChange={event => void chooseLibraryPost(event.target.value)} className="mt-1 block w-full rounded-lg border bg-white p-2"><option value="">{libraryLoading ? "Loading…" : "Choose a Library post"}</option>{libraryPosts.map(post => <option key={post.post_id} value={post.post_id}>{post.title}</option>)}</select></label>
          {libraryPost && <div><p className="mb-1 text-sm font-medium">Choose 1–3 ready files in attachment order</p><div className="space-y-1">{libraryPost.media.map(media => {
            const selectedIndex = libraryMediaIds.indexOf(media.id), ready = media.processingStatus.toUpperCase() === "READY";
            return <button key={media.id} disabled={!ready} onClick={() => { invalidate(); setLibraryMediaIds(current => current.includes(media.id) ? current.filter(id => id !== media.id) : current.length < 3 ? [...current, media.id] : current); }} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${selectedIndex >= 0 ? "border-amber-700 bg-amber-100" : "bg-white"} disabled:opacity-50`}><span>{media.label} <span className="text-xs text-slate-500">· {media.mime} · {media.processingStatus}</span></span><span>{selectedIndex >= 0 ? `#${selectedIndex + 1} · selected` : ready ? "Select" : "Unavailable"}</span></button>;
          })}</div></div>}
        </div>}
      </div>}
      <div aria-live="polite" className="mb-3 max-h-36 space-y-1 overflow-auto text-sm">{chat.map((message, index) => <p key={index} className={index % 2 === 0 ? "text-slate-800" : "text-indigo-800"}>{message}</p>)}</div>
      {conversationMode && conversationSession?.preparation && <div role="status" aria-live="polite" className="mb-3 break-words rounded-lg bg-indigo-50 p-3 text-sm text-slate-700"><p className="font-medium">Preview-first drafts for {conversationSession.preparation.destinations.map(destination => destination === "deviantart" ? "DeviantArt" : "X").join(" and ")}</p><p className="mt-1">{conversationSession.preparation.templateId ? "Square teaser recorded" : "Choose a template"} · {conversationSession.preparation.copyChoice?.kind === "existing_titles" ? "Existing titles recorded" : conversationSession.preparation.copyChoice?.kind === "literal" ? `Shared copy recorded: “${conversationSession.preparation.copyChoice.text}”` : "Choose a copy option"}</p><p className="mt-1">One Previewizer export can serve every selected destination for an artwork. Review and confirm each cell separately. Schedule and handoff use separate confirmations. Nothing is published. Pending: {conversationSession.preparation.pendingRequirements.map(item => preparationRequirementLabels[item] ?? item).join(", ") || "none"}.</p></div>}
      {conversationMode && conversationSession?.preparation && conversationSession.selection.postIds.length > 0 && <section aria-label="Selected fixture previews" className="mb-3 space-y-2 rounded-lg border border-slate-200 p-3">
        <h2 className="text-sm font-semibold">Selected fixture previews</h2>
        {conversationSession.selection.postIds.map(postId => {
          const card = conversationSession.cards.find(item => item.postId === postId);
          const images = conversationSession.media.filter(item => item.postId === postId && item.processingStatus === "ready" && item.mimeType.startsWith("image/"));
          const status = conversationSession.previewStatus?.[postId];
          const cells = conversationSession.matrixCells?.filter(cell => cell.postId === postId) ?? [];
          return <article key={postId} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium">{card?.title ?? postId}</p><p className="break-words text-xs text-slate-600">{status?.status === "complete" ? `Mock preview ready · ${status.receipt?.size ?? 0} bytes` : status?.status === "in_progress" ? "Previewizer open · export not confirmed" : images.length ? "Preview pending" : "No ready image for Previewizer"}</p></div>
              {images.length === 1 && <button type="button" onClick={() => void openConversationPreview(postId, images[0]!.id)} disabled={previewBusyMediaId !== null || !conversationSession.preparation?.templateId} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{previewBusyMediaId === images[0]!.id ? "Opening…" : status?.status === "complete" ? "Open Previewizer again" : "Open Previewizer"}</button>}
            </div>
            {images.length > 1 && <div className="mt-2 flex min-w-0 flex-wrap gap-2">{images.map(image => <button key={image.id} type="button" onClick={() => void openConversationPreview(postId, image.id)} disabled={previewBusyMediaId !== null || !conversationSession.preparation?.templateId} className="max-w-full break-words rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{previewBusyMediaId === image.id ? "Opening…" : `Open ${image.filename ?? image.title}`}</button>)}</div>}
            {!!cells.length && <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2" aria-label={`Destination drafts for ${card?.title ?? postId}`}>
              {cells.map(cell => <div key={cell.key} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-2" data-testid={`conversation-cell-${cell.destination}-${cell.postId}`}>
                <div className="min-w-0"><p className="text-xs font-medium">{cell.destination === "deviantart" ? "DeviantArt" : "X"} · {cell.status === "confirmed" ? "confirmed draft" : cell.status === "ready_to_review" ? "ready to review" : cell.status === "needs_preview" ? "needs preview" : cell.status === "skipped" ? "skipped" : "blocked"}</p>{cell.reason && <p className="mt-1 break-words text-xs text-slate-600">{cell.reason}</p>}{cell.status === "confirmed" && <p className="mt-1 break-words text-xs text-emerald-800">Current copy: “{cell.copyText}”</p>}{cellErrors[cell.key] && <p role="alert" className="mt-1 break-words text-xs text-red-700">{cellErrors[cell.key]}</p>}</div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {cell.status === "ready_to_review" && <button type="button" onClick={() => void reviewConversationXDraft(cell.postId, cell.destination)} disabled={busy || previewOpen !== null || xDraftBusy} className="rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-xs hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{cellBusyKey === cell.key ? "Reviewing…" : `Review ${cell.destination === "deviantart" ? "DeviantArt" : "X"} draft`}</button>}
                  {cell.status === "skipped" ? <button type="button" onClick={() => void updateConversationCell(cell.postId, cell.destination, "restore")} disabled={busy || previewOpen !== null} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{cellBusyKey === cell.key ? "Restoring…" : "Restore cell"}</button> : cell.status !== "confirmed" && <button type="button" onClick={() => void updateConversationCell(cell.postId, cell.destination, "skip")} disabled={busy || previewOpen !== null} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{cellBusyKey === cell.key ? "Skipping…" : "Skip cell"}</button>}
                </div>
              </div>)}
            </div>}
          </article>;
        })}
        {previewError && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">{previewError}</p>}
        {xDraftReview?.review && <article aria-label={`Review ${xDraftReview.review.destination === "deviantart" ? "DeviantArt" : "X"} draft`} className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <h3 className="text-sm font-semibold">Review unscheduled {xDraftReview.review.destination === "deviantart" ? "DeviantArt" : "X"} draft</h3>
          <p className="mt-1 break-words text-xs text-slate-600">Source: {xDraftReview.review.sourceTitle}</p>
          <img src={xDraftReview.review.previewUrl} alt={`Confirmed Previewizer export for ${xDraftReview.review.sourceTitle}`} width={480} height={320} loading="lazy" className="mt-2 max-h-72 max-w-full rounded-md border bg-white object-contain" />
          <p className="mt-2 text-xs font-medium text-slate-600">Exact {xDraftReview.review.destination === "deviantart" ? "title" : "X copy"}</p><p className="break-words text-sm">{xDraftReview.review.copyText}</p>{xDraftReview.review.destination === "deviantart" && <><p className="mt-2 text-xs font-medium text-slate-600">Exact description</p><p className="whitespace-pre-wrap break-words text-sm">{String(xDraftReview.review.variant?.bodyText ?? "") || "(empty)"}</p><p className="mt-2 text-xs font-medium text-slate-600">Exact tags</p><p className="break-words text-sm">{(xDraftReview.review.variant?.tags ?? []).join(", ") || "(none)"}</p></>}
          <dl className="mt-2 space-y-1">{Object.entries(xDraftReview.review.fieldDiff).map(([field, diff]) => <div key={field} className="grid min-w-0 grid-cols-[minmax(5rem,auto)_1fr] gap-2 text-xs"><dt className="break-words font-medium">{field === "postText" ? "X copy" : field === "platformFields" ? (xDraftReview.review.destination === "deviantart" ? "Preview media source" : "X media source") : field}</dt><dd className="min-w-0 break-words">{draftDiffValue(diff.before)} → {draftDiffValue(diff.after)}</dd></div>)}</dl>
          <p className="mt-2 text-xs font-medium text-indigo-900">{xDraftReview.review.label}</p>
          <button type="button" onClick={() => void confirmConversationXDraft()} disabled={busy || xDraftBusy || !xDraftReview.reviewToken} className="mt-3 rounded-lg bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{xDraftBusy ? "Confirming…" : `Confirm ${xDraftReview.review.destination === "deviantart" ? "DeviantArt" : "X"} draft`}</button>
        </article>}
      </section>}
      {conversationMode && !!conversationSession?.confirmedDrafts?.length && <section aria-label="Confirmed preview drafts" className="mb-3 space-y-3 rounded-lg border border-slate-200 p-3">
        <h2 className="text-sm font-semibold">Confirmed preview drafts</h2>
        <div className="space-y-2">{conversationSession.confirmedDrafts.map(draft => {
          const currentCell = conversationSession.matrixCells?.some(cell => cell.status === "confirmed" && cell.variantId === draft.variantId);
          return <article key={draft.variantId} className="rounded-lg bg-slate-50 p-3">
          {!currentCell && <p className="mb-2 text-xs font-medium text-amber-800">Saved history · current preparation choices or selection have changed.</p>}
          <div className="flex min-w-0 flex-wrap items-start gap-3"><img src={draft.previewUrl} alt={`Confirmed Previewizer export for ${draft.sourceTitle}`} width={144} height={96} loading="lazy" className="h-24 w-36 shrink-0 rounded-md border bg-white object-contain" /><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{draft.sourceTitle} · {draft.destination === "deviantart" ? "DeviantArt" : "X"}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{draft.copyText}</p><p className="mt-1 text-xs text-slate-600">{draft.scheduledFor ? `Mock cue scheduled · ${draft.scheduledFor}` : "Confirmed export · no mock cue scheduled"}</p><a className="mt-1 inline-block text-xs text-indigo-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700" href={draft.previewUrl} target="_blank" rel="noreferrer">Open confirmed JPEG</a></div></div>
          {draft.scheduledFor && (draft.handoff ? <div className="mt-2 flex flex-wrap items-center gap-2"><p className="text-xs text-slate-600">Mock handoff confirmed · {draft.handoff.confirmedAt}</p><button type="button" onClick={() => void openConversationXHandoff(conversationSession.sessionId, draft.handoff!.handoffId, draft.destination)} disabled={xHandoffBusy || busy} className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700 disabled:opacity-50">{xHandoffBusy ? "Opening…" : `Open ${draft.destination === "deviantart" ? "DeviantArt" : "X"} again`}</button>{xHandoffOutcome?.handoffId === draft.handoff.handoffId && <p role={xHandoffOutcome.kind === "error" ? "alert" : "status"} aria-live="polite" className={`basis-full text-sm ${xHandoffOutcome.kind === "error" ? "text-red-800" : "text-emerald-800"}`}>{xHandoffOutcome.message}</p>}</div> : <button type="button" onClick={() => void reviewConversationXHandoff(draft.variantId)} disabled={xHandoffBusy || busy || previewOpen !== null} className="mt-2 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700 disabled:opacity-50">{xHandoffBusy ? "Reviewing…" : `Review ${draft.destination === "deviantart" ? "DeviantArt" : "X"} handoff`}</button>)}
          {!draft.scheduledFor && <label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" name="schedule-variant" value={draft.variantId} aria-label={`Select ${draft.destination === "deviantart" ? "DeviantArt" : "X"} draft for scheduling: ${draft.sourceTitle} · ${draft.copyText}`} checked={scheduleVariantId === draft.variantId} disabled={draftScheduleBusy || busy} onChange={() => { if (draftScheduleConfirming.current) return; setScheduleVariantId(draft.variantId); setDraftScheduleReview(null); }} />Select this {draft.destination === "deviantart" ? "DeviantArt" : "X"} draft to schedule</label>}
        </article>})}</div>
        <fieldset disabled={draftScheduleBusy || busy || draftScheduleConfirming.current} className="grid min-w-0 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm">Date in Europe/London<input type="date" name="schedule-date" autoComplete="off" value={scheduleDate} onChange={event => { if (draftScheduleConfirming.current) return; setScheduleDate(event.target.value); setDraftScheduleReview(null); }} className="min-w-0 rounded-lg border bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700" /></label>
          <label className="grid gap-1 text-sm">Local time<input type="time" name="schedule-time" autoComplete="off" value={scheduleTime} onChange={event => { if (draftScheduleConfirming.current) return; setScheduleTime(event.target.value); setDraftScheduleReview(null); }} className="min-w-0 rounded-lg border bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700" /></label>
          <button type="button" onClick={() => void reviewConversationDraftSchedule()} disabled={!scheduleVariantId || !scheduleDate || !scheduleTime || !conversationSession.confirmedDrafts?.some(item => item.variantId === scheduleVariantId && !item.scheduledFor)} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{draftScheduleBusy ? "Reviewing…" : "Review schedule"}</button>
        </fieldset>
        {draftScheduleReview?.review && <article aria-label="Review schedule" className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <h3 className="text-sm font-semibold">Review temporary {draftScheduleReview.review.destination === "deviantart" ? "DeviantArt" : "X"} posting cue</h3><p className="mt-1 break-words text-xs text-slate-600">Source: {draftScheduleReview.review.sourceTitle}</p>
          <img src={draftScheduleReview.review.previewUrl} alt={`Confirmed Previewizer export for ${draftScheduleReview.review.sourceTitle}`} width={480} height={320} loading="lazy" className="mt-2 max-h-72 max-w-full rounded-md border bg-white object-contain" />
          <p className="mt-2 text-xs font-medium text-slate-600">Exact {draftScheduleReview.review.destination === "deviantart" ? "title" : "X copy"}</p><p className="whitespace-pre-wrap break-words text-sm">{draftScheduleReview.review.copyText}</p>{draftScheduleReview.review.destination === "deviantart" && <><p className="mt-2 text-xs font-medium text-slate-600">Exact description</p><p className="whitespace-pre-wrap break-words text-sm">{String(draftScheduleReview.review.variant?.bodyText ?? "") || "(empty)"}</p><p className="mt-2 text-xs font-medium text-slate-600">Exact tags</p><p className="break-words text-sm">{(draftScheduleReview.review.variant?.tags ?? []).join(", ") || "(none)"}</p></>}
          <p className="mt-2 text-sm">{draftScheduleReview.review.dueAt.local} Europe/London</p><p className="text-xs text-slate-600">UTC: {draftScheduleReview.review.dueAt.utc}</p>
          <p className="mt-2 text-xs font-medium text-indigo-900">{draftScheduleReview.review.label}</p>
          <button type="button" onClick={() => void confirmConversationDraftSchedule()} disabled={draftScheduleBusy || !draftScheduleReview.reviewToken} className="mt-3 rounded-lg bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{draftScheduleBusy ? "Confirming…" : "Confirm schedule"}</button>
        </article>}
        {xHandoffReview?.review && <article aria-label={`Review ${xHandoffReview.review.destination === "deviantart" ? "DeviantArt" : "X"} handoff`} className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <h3 className="text-sm font-semibold">Review {xHandoffReview.review.destination === "deviantart" ? "DeviantArt" : "X"} handoff</h3>
          <p className="mt-1 break-words text-xs text-slate-600">Source: {xHandoffReview.review.sourceTitle}</p>
          <img src={xHandoffReview.review.previewUrl} alt={`Confirmed Previewizer export for ${xHandoffReview.review.sourceTitle}`} width={480} height={320} loading="lazy" className="mt-2 max-h-72 max-w-full rounded-md border bg-white object-contain" />
          <p className="mt-2 text-xs font-medium text-slate-600">Exact {xHandoffReview.review.destination === "deviantart" ? "title" : "X copy"}</p><p className="whitespace-pre-wrap break-words text-sm">{xHandoffReview.review.copyText}</p>{xHandoffReview.review.destination === "deviantart" && <><p className="mt-2 text-xs font-medium text-slate-600">Exact description</p><p className="whitespace-pre-wrap break-words text-sm">{String(xHandoffReview.review.variant?.bodyText ?? "") || "(empty)"}</p><p className="mt-2 text-xs font-medium text-slate-600">Exact tags</p><p className="break-words text-sm">{(xHandoffReview.review.variant?.tags ?? []).join(", ") || "(none)"}</p></>}
          <p className="mt-2 text-sm">{xHandoffReview.review.dueAt.local} Europe/London</p><p className="text-xs text-slate-600">UTC: {xHandoffReview.review.dueAt.utc}</p>
          <p className="mt-2 text-xs font-medium text-indigo-900">{xHandoffReview.review.label}</p>
          <button type="button" onClick={() => void confirmConversationXHandoff()} disabled={busy || xHandoffBusy || !xHandoffReview.reviewToken} className="mt-3 rounded-lg bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{xHandoffBusy ? "Confirming…" : `Confirm and open ${xHandoffReview.review.destination === "deviantart" ? "DeviantArt" : "X"}`}</button>
        </article>}
      </section>}
      <label htmlFor="bench-request" className="sr-only">{conversationMode ? "Describe the selection, edit or posting request" : "Describe the edit"}</label>
      {conversationRestoreLoading && <p role="status" aria-live="polite" className="mb-2 text-sm text-slate-600">Loading the saved mock conversation…</p>}
      {conversationMode && <p className="mb-2 text-sm text-slate-600">Use the chat to select artwork and choose X, DeviantArt, or both for preview-first drafts. After Previewizer, review and confirm each destination cell. Scheduling and handoff have separate confirmations. Nothing is published.</p>}
      {mode === "mock_posting" && sourceMode === "fixture" && !conversationMode && <div className="mb-2 flex items-center gap-2 text-sm"><button onClick={() => { invalidate(); setEditDraftMode(value => !value); }} className={`rounded-full px-3 py-1.5 ${editDraftMode ? "bg-indigo-700 text-white" : "border bg-white"}`}>{editDraftMode ? "Edit draft mode · on" : "Edit draft"}</button>{editDraftMode && <span className="text-slate-600">Quote the exact replacement, for example: Change the X caption to “Aurora at dawn”. Unquoted rewrites need clarification.</span>}</div>}
      <div className="flex gap-2"><textarea id="bench-request" name="bench-request" autoComplete="off" value={request} disabled={conversationRestoreLoading || manualSelectionBusy || xDraftConfirming.current || draftScheduleConfirming.current || xHandoffConfirming.current} onChange={event => { if (conversationRestoreLoading || manualSelectionInFlight.current || xDraftConfirming.current || draftScheduleConfirming.current || xHandoffConfirming.current) return; setRequest(event.target.value); setXDraftReview(null); setDraftScheduleReview(null); setXHandoffReview(null); invalidate(); }} placeholder={conversationMode ? 'Select Aurora Study and exclude Tide pools.' : mode === "curation" && curationSource === "real_library" ? "Describe which Library posts to select…" : mode === "mock_posting" && sourceMode === "real_library" ? "Describe manual posting cues for the selected Library media…" : mode === "mock_posting" && editDraftMode ? "For Aurora in X, replace it with “Aurora at dawn”. Unquoted rewrites need clarification." : "Describe a change…"} className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700 disabled:opacity-60" /><button type="button" onClick={() => void send()} disabled={!catalog || conversationRestoreLoading || busy || realLibraryBusy || !request.trim() || (mode === "curation" && curationSource === "real_library" && (!realLibraryCatalog || realLibraryLoading)) || (mode === "mock_posting" && sourceMode === "real_library" && (!libraryPost || libraryMediaIds.length < 1))} className="self-end rounded-xl bg-indigo-700 px-5 py-3 font-medium text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{busy ? "Sending…" : "Send"}</button></div>
      {conversationTurn?.status === "review" && conversationTurn.preview && <article className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-sm font-semibold">Review mock {conversationTurn.preview.kind === "posting" ? "posting cue" : "edit"} · revision {conversationTurn.revision}</p>{conversationTurn.preview.kind === "edit" ? <><p className="mt-2 text-sm">Post: {visibleCards.find(card => card.postId === conversationTurn.preview!.postId)?.title ?? "Selected post"}</p>{(conversationTurn.preview.beforeAfter as any[]).map((change, index) => <p key={index} className="mt-1 break-words text-sm">{String(change.before)} → {String(change.after)}</p>)}{(conversationTurn.preview.action as any)?.kind === "tags" && <p className="mt-2 text-sm">Add: {((conversationTurn.preview.action as any).add as string[]).join(", ") || "none"} · Remove: {((conversationTurn.preview.action as any).remove as string[]).join(", ") || "none"}</p>}</> : <><p className="mt-2 text-sm">Source: {String((conversationTurn.preview.review as any)?.source?.title)} · {String((conversationTurn.preview.review as any)?.destination).toUpperCase()}</p><p className="break-words text-sm">Title: {String((conversationTurn.preview.review as any)?.title)}</p><p className="text-sm">Time: {String((conversationTurn.preview.review as any)?.dueAt?.local)} Europe/London</p></>}<details className="mt-2 text-xs"><summary className="cursor-pointer">Full mock preview</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(conversationTurn.preview, null, 2)}</pre></details><div className="mt-3 flex gap-2"><button type="button" onClick={() => void confirmConversation()} disabled={busy || !conversationTurn.reviewToken} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{conversationTurn.preview.kind === "posting" ? "Confirm posting cue" : "Confirm edit"}</button><button type="button" onClick={() => { invalidate(); }} disabled={busy} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">Cancel</button></div></article>}
      {conversationReceipt && <p aria-live="polite" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm">{conversationReceipt.receipt.kind === "edit" ? "Mock edit saved." : "Mock posting cue saved. Publishing is manual."}</p>}
      {variantEditReview?.decision === "review" && <article className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-sm font-semibold">Review {variantEditReview.destination === "deviantart" ? "DeviantArt" : "X"} draft edit · revision {variantEditReview.expectedRevision} · mock only</p><p className="mt-2 text-sm">Before: {variantEditReview.oldText}</p><p className="text-sm">After: {variantEditReview.newText}</p><div className="mt-3 flex gap-2"><button onClick={() => void confirmVariantEdit()} disabled={busy || !variantEditReview.reviewToken} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm text-white disabled:opacity-50">Confirm edit</button><button onClick={() => { invalidate(); }} disabled={busy} className="rounded-lg border px-4 py-2 text-sm">Cancel</button></div></article>}
      {variantEditReview?.decision === "unchanged" && <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">The draft already has that exact text; no edit was made.</p>}
      {variantEditReceipt && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm">Mock draft updated. Revision {variantEditReceipt.revision}; no post was published.</p>}
      {mode === "curation" && (curationSource === "real_library" ? <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-600"><span>{realLibrarySelectedIds.length} selected · {realLibrarySelection?.excludedPostIds.length ?? 0} excluded</span><button onClick={() => void resetRealLibrarySelection()} disabled={!realLibraryCatalog || busy || realLibraryBusy} className="rounded-lg border px-2.5 py-1.5 text-slate-700 disabled:opacity-50">Start over</button></div> : <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-600"><span>{refinementState?.selectedPostIds.length ?? selected.length} selected · {refinementState?.excludedPostIds.length ?? 0} excluded</span><button onClick={() => void resetSelection()} disabled={busy} className="rounded-lg border px-2.5 py-1.5 text-slate-700 disabled:opacity-50">Start over</button></div>)}
      {runtime?.reason && !runtime.enabled && <p className="mt-2 text-xs text-slate-500">{runtime.reason}</p>}
      {!conversationMode && !(mode === "mock_posting" && sourceMode === "real_library") && !(mode === "curation" && curationSource === "real_library") && <details className="mt-3 text-xs"><summary className="cursor-pointer text-slate-500">Structured replay tools</summary><textarea aria-label="Strict structured intent JSON" value={intent} onChange={event => { setIntent(event.target.value); invalidate(); }} className="mt-2 min-h-36 w-full rounded-lg border p-3 font-mono" /><button disabled={busy} onClick={() => void replay()} className="mt-2 rounded-lg border px-3 py-1.5">Replay edited intent</button><button disabled={busy || !pair.current} onClick={() => void replay()} className="ml-2 rounded-lg border px-3 py-1.5">Run loaded example</button></details>}
    </section>
    <div>
      {mode === "curation" && curationSource === "real_library" && <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Real Library posts</h2><p className="text-xs text-slate-600">Complete metadata-only view · no images or media identifiers are sent in selection requests.</p></div><button onClick={() => void loadRealLibraryCatalog()} disabled={realLibraryLoading || realLibraryBusy || busy} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">{realLibraryLoading ? "Loading…" : "Reload Library"}</button></div>
        <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Dates use Europe/London calendar days. Created means the stored Library record date, often an ingest or gallery-order timestamp, not artwork creation. Published means the latest version's publish date; drafts have no published date.</p>
        {realLibraryError && <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><p>{realLibraryError.message}</p>{realLibraryError.code === "stale_library_selection" && <p className="mt-1 text-xs">The catalog changed. Reload it, then start a new selection.</p>}{realLibraryCatalog && <button onClick={() => void resetRealLibrarySelection()} disabled={realLibraryBusy || busy} className="mt-2 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50">Start over</button>}</div>}
        {realLibraryLoading && <p className="mt-3 text-sm text-slate-600">Loading the complete Library catalog…</p>}
        {!realLibraryLoading && realLibraryCatalog && <>{realLibraryCatalog.posts.length === 0 ? <p className="mt-4 text-sm text-slate-600">No active Library posts were found.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{realLibraryCatalog.posts.map(post => {
          const isSelected = realLibrarySelectedIds.includes(post.postId), isExcluded = realLibrarySelection?.excludedPostIds.includes(post.postId) ?? false;
          return <button key={post.postId} type="button" aria-pressed={isSelected} disabled={busy || realLibraryBusy} onClick={() => void toggleRealLibraryPost(post.postId)} className={`rounded-xl border p-4 text-left disabled:opacity-60 ${isSelected ? "border-indigo-500 bg-indigo-50" : isExcluded ? "border-amber-300 bg-amber-50" : "bg-white"}`}>
            <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{post.title}</h3><span className="shrink-0 text-xs font-medium">{isSelected ? "Selected" : isExcluded ? "Excluded" : "Select"}</span></div>
            <p className="mt-1 text-xs text-slate-600">{[post.workTitle, post.seriesTitle].filter(Boolean).join(" · ") || "No work or series"}</p>
            <p className="mt-2 line-clamp-3 text-xs text-slate-700">{post.descriptionText || "No description"}</p>
            <p className="mt-2 text-xs text-slate-600">{post.publishState} · created {post.createdAt} · published {post.publishedAt ?? "not published"}</p>
            <p className="mt-1 text-xs text-slate-600">{post.collections.length ? `Collections: ${post.collections.map(collection => collection.title).join(", ")}` : "No collections"}</p>
            <p className="mt-1 text-xs text-slate-600">{post.tags.length ? `Tags: ${post.tags.join(", ")}` : "No tags"}</p>
            <p className="mt-2 rounded-md bg-slate-100 p-2 text-xs text-slate-600">Metadata only · {post.media.length ? `${post.media.length} current media item${post.media.length === 1 ? "" : "s"}` : "No current media"}</p>
          </button>;
        })}</div>}</>}
      </section>}
      {(mode === "curation" ? curationSource === "fixture" : sourceMode === "fixture") && <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Sample gallery <span className="text-sm font-normal text-slate-500">· {visibleSelected.length}/{visibleCards.length} posts · {visibleMedia.filter(item => visibleSelected.includes(item.postId)).length} files</span></h2>
        {visibleSelected.length > 0 && <p className="mb-2 text-xs text-slate-500">{visibleSelected.map(id => visibleCards.find(card => card.postId === id)?.title).filter(Boolean).join(", ")}</p>}
        <details className="mb-3 text-xs"><summary className="cursor-pointer text-slate-600">Metadata · {visibleCards.length} items</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {visibleCards.map(card => {
            const media = visibleMedia.filter(item => item.postId === card.postId);
            const labels = card.mediaLabels?.length ? card.mediaLabels : media.map(item => item.title);
            return <div key={card.postId} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <p className="font-medium text-slate-800">{card.title}</p>
              <p className="mt-1 text-slate-600">{[card.workTitle, card.seriesTitle].filter(Boolean).join(" · ") || "Standalone"}{card.stage ? ` · ${card.stage}` : ""}{card.publishState ? ` · ${card.publishState}` : ""}</p>
              {(card.tags?.length ?? 0) > 0 && <p className="mt-1 text-slate-500">Tags: {card.tags!.join(", ")}</p>}
              {labels.length > 0 && <p className="mt-1 text-slate-500">Media: {labels.join(", ")}</p>}
            </div>;
          })}
        </div>
        </details>
        <div className="flex h-[480px] min-h-0 flex-col overflow-hidden rounded-xl">
          <fieldset disabled={busy || previewOpen !== null || previewHandshakeInFlight.current} aria-busy={conversationMode && busy} className="min-w-0 border-0 p-0">
          <GalleryGrid
            groups={groups}
            tierTitleById={{}}
            selectedKeys={new Set(visibleSelected.flatMap(id => items.filter(item => item.post_id === id).map(item => `${item.post_id}::${item.media_id}`)))}
            gridDensity="lab2"
            creatorId="bench_creator"
            onToggleSelectGroup={values => {
              if (conversationMode) { const postId = values[0]?.post_id; if (postId) void toggleConversationPost(postId); return; }
              invalidate();
              const postId = values[0]?.post_id;
              if (postId && refinementState) {
                const isSelected = refinementState.selectedPostIds.includes(postId);
                const selectedIds = new Set(refinementState.selectedPostIds), excludedIds = new Set(refinementState.excludedPostIds);
                if (isSelected) { selectedIds.delete(postId); excludedIds.add(postId); }
                else { selectedIds.add(postId); excludedIds.delete(postId); }
                const orderedIds = (ids: Set<string>) => catalog.cards.map(card => card.postId).filter(id => ids.has(id));
                const nextState = { ...refinementState, selectedPostIds: orderedIds(selectedIds), excludedPostIds: orderedIds(excludedIds) };
                setRefinementState(nextState); setSelected(nextState.selectedPostIds);
              } else if (postId) setSelected(current => current.includes(postId) ? current.filter(id => id !== postId) : [...current, postId]);
            }}
            onFocusIndex={() => {}}
            onPresentClick={() => {}}
            onGhostClick={() => {}}
            onOpenLinkedSet={() => {}}
            onOpenPost={values => { if (conversationMode) { const postId = values[0]?.post_id; if (postId) void toggleConversationPost(postId); } }}
          />
          </fieldset>
        </div>
      </section>}
    </div>
    <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm">{requestError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{requestError}</p>}
      {scheduleBusy && <p className="mb-3 text-sm text-slate-600">{scheduleReview ? "Updating Schedule Rail review…" : "Preparing a Schedule Rail review…"}</p>}
      {scheduleError && <p role="alert" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Schedule review: {scheduleError}</p>}
      {scheduleError && canRetryScheduleReview && <button onClick={() => void requestScheduleReview(request, response!.interpreted, response!.selection!)} disabled={scheduleBusy} className="mb-3 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Review again</button>}
      {scheduleReview && isGroupedReview(scheduleReview) && <article className={`mb-4 rounded-xl border p-4 ${scheduleReview.reviewKind === "real_library_manual" ? "border-amber-300 bg-amber-50" : "border-indigo-200 bg-indigo-50"}`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Review manual posting events</h2>
          {scheduleReview.reviewKind === "real_library_manual" ? <button onClick={retryRealLibraryReview} disabled={scheduleBusy} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Review again</button> : canRetryScheduleReview && <button onClick={() => void requestScheduleReview(request, response!.interpreted, response!.selection!)} disabled={scheduleBusy} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Review again</button>}
        </div>
        <p className="mb-3 text-sm text-slate-700">{scheduleReview.reviewKind === "real_library_manual" ? "Real Library media attachment · each destination is a separate manual publishing cue. Confirm each event individually; nothing is automatically published." : "Each destination is a separate manual publishing cue. Confirm each event individually."}</p>
        <div className="space-y-3">{scheduleReview.items.map(item => {
          const saved = batchReceipts[item.destination];
          const real = scheduleReview.reviewKind === "real_library_manual";
          const attachmentLabels = real ? scheduleReview.source.mediaIds.map(id => libraryPost?.media.find(media => media.id === id)?.label ?? id) : [];
          const attachment = real ? item.review.attachment : undefined;
          const canOpenX = !!saved && item.destination === "x" && saved.event.destination === "x" && saved.event.event_type === "make_post" && saved.event.status === "pending" && saved.event.id.startsWith("bench_event_") && !!attachment && !!attachment.postId && !!attachment.versionId && attachment.mediaIds.length >= 1 && attachment.mediaIds.length <= 3;
          const handoffOutcome = saved && extensionOutcome?.eventId === saved.event.id ? extensionOutcome : null;
          return <section key={item.destination} className="rounded-lg border border-indigo-100 bg-white p-4">
            <h3 className="font-semibold">{destinationLabel(item.destination)} · {item.review.title}</h3>
            <p className="mt-1 text-sm">{item.review.dueAt.local} ({item.review.dueAt.timezone})</p>
            {real ? <><p className="text-sm">Library source: {item.review.source.title}</p><p className="text-sm">Attached files, in order: {attachmentLabels.join(" → ")}</p></> : <p className="text-sm">Sample source: {item.review.source.title} · {item.review.source.mediaLabel}</p>}
            <p className="mt-2 text-sm text-slate-700">{item.review.warning}</p>
            <p className="mt-1 text-xs text-slate-600">{real ? "Manual cue referencing the selected Library media · no automatic publishing." : "Manual publishing cue · sample media is not attached · no autopost or reminder."}</p>
            {saved ? <><p className="mt-3 rounded-md bg-emerald-50 p-2 text-sm text-emerald-800">Event saved · ID: {saved.event.id}{saved.reused ? " · existing matching event" : ""}</p>{real && <p className="mt-1 text-xs text-slate-600">Attached files: {attachmentLabels.join(" → ")}</p>}{canOpenX && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-sm">Open the saved title and selected images in X Compose, review them, then publish on X yourself.</p><button onClick={() => void openSavedXEvent(saved.event.id)} disabled={extensionBusy} className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{extensionBusy ? "Opening X…" : handoffOutcome?.kind === "error" ? "Retry: Open X with extension" : "Open X with extension"}</button>{handoffOutcome && <p role={handoffOutcome.kind === "error" ? "alert" : "status"} className={`mt-2 text-sm ${handoffOutcome.kind === "error" ? "text-red-800" : "text-emerald-800"}`}>{handoffOutcome.message}</p>}</div>}</> : <>
              {rowErrors[item.destination] && <p role="alert" className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-800">{rowErrors[item.destination]}</p>}
              <button onClick={() => void confirmSchedule(item.reviewToken, item.destination)} disabled={scheduleBusy} className="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{rowErrors[item.destination] ? "Retry confirmation" : "Confirm event"}</button>
            </>}
          </section>;
        })}</div>
        <div className="mt-3"><a className="rounded-lg border px-4 py-2 text-sm text-indigo-700 underline" href="/studio/lab2">Open schedule</a></div>
      </article>}
      {scheduleReview && !isGroupedReview(scheduleReview) && <article className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <h2 className="text-lg font-semibold">Review one Schedule Rail event</h2>
        <p className="mt-2 text-sm">Sample source: {scheduleReview.review.source.title} · {scheduleReview.review.source.mediaLabel}</p>
        <p className="text-sm">{destinationLabel(scheduleReview.review.destination)}{scheduleReview.review.destination !== "patreon" ? " manual posting event" : ""} · {scheduleReview.review.title}</p>
        <p className="text-sm">{scheduleReview.review.dueAt.local} ({scheduleReview.review.dueAt.timezone})</p>
        <p className="mt-2 text-sm text-slate-700">{scheduleReview.review.warning}</p>
        <p className="mt-1 text-xs text-slate-600">Sample media is not attached · no autopost · no reminder.</p>
        <div className="mt-3 flex gap-2"><button onClick={() => void confirmSchedule(scheduleReview.reviewToken)} disabled={scheduleBusy} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{scheduleBusy ? "Saving…" : "Confirm event"}</button><button onClick={() => { scheduleGeneration.current++; setScheduleReview(null); setScheduleError(""); }} disabled={scheduleBusy} className="rounded-lg border px-4 py-2 text-sm">Cancel</button></div>
      </article>}
      {showBatchProposal && <article className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><h2 className="font-semibold">Manual posting events proposed</h2><p className="mt-1 text-sm text-slate-700">Review confirmation before saving. Each item is a separate event; nothing is published.</p><div className="mt-3 space-y-2">{directProposals.map((proposal: any, index: number) => <div key={`${proposal.destination}-${index}`} className="rounded-lg border border-indigo-100 bg-white p-3"><p className="font-medium">{destinationLabel(proposal.destination)} · {proposal.title}</p><p className="text-sm">{proposal.dueAt.local} ({proposal.dueAt.timezone})</p><p className="text-sm">Sample source: {proposal.source.title} · {proposal.source.mediaLabel}</p><p className="mt-1 text-xs text-slate-600">{proposal.warning} Sample media is not attached.</p></div>)}</div></article>}
      {showDirectProposal && <article className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <h2 className="font-semibold">Manual posting event proposed</h2>
        <p className="mt-2 text-sm">Sample source: {directProposal.source.title} · {directProposal.source.mediaLabel}</p>
        <p className="text-sm">{destinationLabel(directProposal.destination)} · {directProposal.title}</p>
        <p className="text-sm">{directProposal.dueAt.local} ({directProposal.dueAt.timezone})</p>
        <p className="mt-2 text-sm text-slate-700">{directProposal.warning}</p>
        <p className="mt-1 text-xs text-slate-600">Sample media is not attached. Review confirmation before saving; nothing is published.</p>
      </article>}
      {receipt && <article className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h2 className="font-semibold">Schedule event saved</h2><p className="text-sm">{destinationLabel(receipt.event.destination)}{receipt.event.destination !== "patreon" ? " manual posting event" : ""} · {receipt.event.title} · {receipt.event.due_at}</p><p className="text-xs text-slate-600">Event ID: {receipt.event.id}{receipt.reused ? " · existing matching event" : ""}</p><a className="mt-2 inline-block text-sm text-indigo-700 underline" href="/studio/lab2">Open schedule</a></article>}
      {response && <><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{response.status.replaceAll("_", " ")} · {response.provenance.replaceAll("_", " ")}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {response.beforeAfter.map(change => {
            const before = readableFields(change.before);
            const after = readableFields(change.after);
            const keys = [...new Set([...before.map(([key]) => key), ...after.map(([key]) => key)])];
            const changedKeys = keys.filter(key => before.find(([name]) => name === key)?.[2] !== after.find(([name]) => name === key)?.[2]);
            if (changedKeys.length === 0) return null;
            return <article key={change.label} className="rounded-xl bg-slate-50 p-4">
              <h3 className="font-semibold">{change.label}</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {([ ["Before", before], ["After", after] ] as const).map(([heading, rows]) => <div key={heading}>
                  <b>{heading}</b>{rows.filter(([key]) => changedKeys.includes(key)).map(([key, value]) => <p key={key}><span className="text-slate-500">{key}:</span> {value}</p>)}
                </div>)}
              </div>
              <details className="mt-2 text-xs"><summary>Details</summary><pre>{JSON.stringify({ before: change.before, after: change.after }, null, 2)}</pre></details>
            </article>;
          })}
        </div>
        {response.mode === "mock_posting" && Array.isArray(response.result?.steps) && <div className="mt-4 space-y-2">
          {response.result.steps.map((step: any) => {
            const anchorTitle = response.result.steps.find((candidate: any) => candidate.id === step.time?.anchor_step_id)?.title;
            return <article key={step.id} className="rounded-xl border p-4">
            <b>{capabilityLabels[step.capability] || step.capability}</b> · {step.title || "Untitled"}
            <p className="text-sm">Destination: {step.destination || "Internal step"} · readiness: {step.destinationReadiness || "internal step"} · {step.enabled ? "enabled" : "paused"}</p>
            <p className="text-sm">Timing: {step.time?.local ? `${step.time.local} (${step.time.timezone}) · UTC ${step.time.at_utc}` : step.time?.kind === "after_publication_calendar_days" ? `${step.time.day_offset} days after verified publication of ${anchorTitle || "this plan item"} at ${step.time.local_time} (${step.time.timezone})` : step.time?.kind || "none"}</p>
            <details className="text-xs text-slate-500"><summary>Graph details</summary>{step.id} · depends on {(step.dependsOn || []).join(", ") || "nothing"} · verified publication anchor {step.time?.anchor_step_id ? response.result.steps.find((candidate: any) => candidate.id === step.time.anchor_step_id)?.title || step.time.anchor_step_id : "none"}</details>
          </article>;
          })}
        </div>}
        <details className="mt-4"><summary>Debug</summary><pre className="mt-2 overflow-auto rounded bg-slate-950 p-4 text-xs text-white">{JSON.stringify(response, null, 2)}</pre></details>
      </>}
    </section>
    {previewOpen && <PreviewizerOverlay
      open
      mode="bench"
      session={{ creatorId: previewOpen.creatorId, postId: previewOpen.attempt.postId, sourceMediaId: previewOpen.attempt.sourceMediaId, sourceImageUrl: previewOpen.sourceImageUrl, sourceLabel: previewOpen.sourceLabel, initialTemplateConfig: previewOpen.initialTemplate.config }}
      returnFocusTarget={previewReturnFocus.current}
      onUploadPreview={uploadConversationPreview}
      onComplete={completeConversationPreview}
      onCancel={() => void cancelConversationPreview()}
    />}
  </div></main>;
}
