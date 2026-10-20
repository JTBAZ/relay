import { relayFetch } from "@/lib/relay-api";
import type { PreviewTemplateConfigV1 } from "@/lib/previewizer-template-config";

export type BenchMode = 'curation' | 'mock_posting';
export type BenchRefinementState = { v: 1; fixtureRevision: number; selectedPostIds: string[]; excludedPostIds: string[] };
export type RealLibrarySelectionPost = {
  postId: string; title: string; descriptionText: string; tags: string[]; createdAt: string; publishedAt: string | null; publishState: string;
  workId: string | null; workTitle: string | null; seriesId: string | null; seriesTitle: string | null;
  collectionIds: string[]; collections: { id: string; title: string }[];
  media: { id: string; mimeType: string | null; role: string | null; processingStatus: string }[];
};
export type RealLibrarySelectionCatalog = { scope: "real_library"; catalogRevision: string; complete: true; supportedFields: string[]; timezone: "Europe/London"; posts: RealLibrarySelectionPost[] };
export type RealLibraryRefinementState = { v: 1; scope: "real_library"; catalogRevision: string; selectedPostIds: string[]; excludedPostIds: string[] };
export type RealLibrarySelectionResult = {
  scope: "real_library"; status: "selected" | "unchanged" | "clarification"; message: string;
  selection: { postIds: string[]; changed: boolean }; refinementState: RealLibraryRefinementState;
  result?: { selector: unknown; matchedPostIds: string[] };
  usage?: { calls: number; known: boolean; inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
};
export type RealLibrarySelectionRequest =
  | { kind: "select"; latestRequest: string; state: RealLibraryRefinementState | null }
  | { kind: "reset"; catalogRevision: string }
  | { kind: "toggle"; catalogRevision: string; postId: string; selected: boolean; state: RealLibraryRefinementState };
export type RealLibraryPost = { postId: string; versionId: string; title: string; media: { id: string; label: string; mime: string | null; processingStatus: string }[] };
export type RealLibrarySource = { postId: string; versionId: string; mediaIds: string[] };
export type BenchRuntime = { enabled: boolean; model: string | null; reasoningEffort: 'none' | null; remainingUsd: number | null; reason: string | null };
export type BenchSelection = { postIds: string[]; mediaIds: string[]; changed: boolean };
export type BenchUsage = { calls: number; known: boolean; inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
export type BenchResponse = { mode: BenchMode; provenance: string; status: string; interpreted: unknown; result: any; beforeAfter: {label:string;before:string|null;after:string|null}[]; diagnostics: string[]; message?: string; runtime?: BenchRuntime; selection?: BenchSelection; usage?: BenchUsage; refinementState?: BenchRefinementState };
export type BenchExample = { id:string; mode:BenchMode; title:string; latestRequest:string; selectedPostIds:string[]; selectedMediaIds:string[]; structuredIntent:Record<string,unknown> };
export type BenchCard = { postId:string; title:string; collectionIds:string[]; mediaIds:string[]; workTitle?:string|null; seriesTitle?:string|null; tags?:string[]; stage?:string; publishState?:'draft'|'published'; mediaLabels?:string[] };
export type BenchMedia = { id:string; postId:string; title:string; filename?:string; mimeType?:string; role?:string; orientation?:'portrait'|'landscape'|'square'|null; processingStatus?:string };
export type BenchCatalog = { cards:BenchCard[]; media:BenchMedia[]; manualActions:{id:string;kind:string;postId:string}[]; examples:BenchExample[]; runtime?: BenchRuntime; fixtureRevision?: number };

export type ScheduleReview = {
  source: { title: string; mediaLabel: string };
  destination: "patreon" | "x" | "deviantart";
  title: string;
  dueAt: { local: string; timezone: "Europe/London"; utc: string };
  warning: string;
  createPayload: {
    event_type: "make_post"; destination: "patreon" | "x" | "deviantart"; title: string; note: string; due_at: string;
    remind_me: false; target_mode: "new_post" | "existing_post"; post_id: string | null; external_url: null; create_relay_draft: false;
  };
  attachment?: { postId: string; versionId: string; mediaIds: string[] };
};
export type ScheduleEvent = { id: string; title: string; due_at: string; status: string; event_type: string; destination: "patreon" | "x" | "deviantart" };
export type ScheduleReviewItem = { destination: ScheduleReview["destination"]; review: ScheduleReview; reviewToken: string; expiresAt: string };
export type ScheduleReviewResult = { review: ScheduleReview; reviewToken: string; expiresAt: string; reviewKind?: "compiled_patreon" | "direct_manual" };
export type ScheduleBatchReviewResult = { reviewKind: "manual_batch"; items: ScheduleReviewItem[] };
export type RealLibraryReviewItem = { destination: ScheduleReview["destination"]; review: ScheduleReview; reviewToken: string; expiresAt: string };
export type RealLibraryReviewResult = { reviewKind: "real_library_manual"; source: RealLibrarySource; intent: unknown; items: RealLibraryReviewItem[] };
export type ScheduleReviewResponse = ScheduleReviewResult | ScheduleBatchReviewResult | RealLibraryReviewResult;
export type RealLibraryReviewResponse = RealLibraryReviewResult | { kind: "clarification"; question: string; usage?: unknown };
export type ScheduleConfirmResult = { event: ScheduleEvent; reused: boolean };
export type BenchConversationPreparation = { goal: "preview_first_x_drafts" | "preview_first_deviantart_drafts"; destination: "x" | "deviantart"; templateId: "bench_template_square" | null; copyChoice: null | { kind: "existing_titles" } | { kind: "literal"; text: string }; pendingRequirements: string[] };
export type BenchConversationPreviewReceipt = { postId: string; sourceMediaId: string; templateId: string; previewMediaId: string; exportHash: string; size: number; completionRevision: number; completedAt: string; initialTemplateId: string; initialTemplateConfigHash: string };
export type BenchConversationDraftReceipt = { identity: string; creatorId: string; sessionId: string; destination: "x" | "deviantart"; postId: string; sourceMediaId: string; previewMediaId: string; exportHash: string; copyText: string; createdAt: string; plan: Record<string, any>; variant: Record<string, any> };
export type BenchConversationConfirmedDraft = { variantId: string; planId: string; postId: string; destination: "x" | "deviantart"; sourceTitle: string; copyText: string; previewMediaId: string; previewUrl: string; scheduledFor: string | null; handoff?: { handoffId: string; confirmedAt: string } | null };
export type BenchConversationSnapshot = { sessionId: string; revision: number; selection: { postIds: string[]; excludedPostIds: string[] }; preparation: BenchConversationPreparation | null; cards: BenchCard[]; media: (BenchMedia & { label?: string })[]; previewStatus?: Record<string, { status: "pending" | "in_progress" | "complete"; attemptId?: string; receipt?: BenchConversationPreviewReceipt }>; draftStatus?: Record<string, { status: "created"; variantId: string; previewMediaId: string; createdAt: string; copyText: string }>; confirmedDrafts?: BenchConversationConfirmedDraft[]; draftReviewStatus?: { postId: string; expiresAt: string } | null; previewState?: "pending" | "mock_previews_ready"; pending: Record<string, unknown> | null };
export type BenchConversationPreviewOpen = BenchConversationSnapshot & { creatorId: string; attempt: { id: string; postId: string; sourceMediaId: string; sourceFingerprint: string; expiresAt: string }; initialTemplate: { id: string; config: PreviewTemplateConfigV1 }; sourceImageUrl: string; sourceLabel: string };
export type BenchConversationTurn = BenchConversationSnapshot & { status: "clarification" | "selected" | "preparation_updated" | "preparation_cancelled" | "review"; message?: string; operation?: string; preview?: Record<string, unknown>; reviewToken?: string; expiresAt?: string; usage?: unknown };
export type BenchConversationConfirm = { receipt: Record<string, any> } & BenchConversationSnapshot;

export class RealLibrarySelectionApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string | null) { super(message); }
}

async function realLibrarySelectionRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof value?.error === "string" ? value.error : null;
    const message = typeof value?.message === "string" ? value.message : `Library selection request failed (${response.status}).`;
    throw new RealLibrarySelectionApiError(message, response.status, code);
  }
  return value as T;
}

export function fetchRealLibrarySelectionCatalog(signal?: AbortSignal) {
  return realLibrarySelectionRequest<RealLibrarySelectionCatalog>("/api/editor-bench/library-selection", { method: "GET", signal, cache: "no-store" });
}
export function updateRealLibrarySelection(request: RealLibrarySelectionRequest, signal?: AbortSignal) {
  return realLibrarySelectionRequest<RealLibrarySelectionResult>("/api/editor-bench/library-selection", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal
  });
}

async function scheduleRequest<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  try {
    return await relayFetch<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Schedule request failed.");
  }
}

export function reviewBenchSchedule(input: { latestRequest: string; structuredIntent: unknown; selectedPostIds: string[]; selectedMediaIds: string[] }) {
  return scheduleRequest<ScheduleReviewResponse>("/api/v1/editor-bench/schedule/review", input);
}

export function confirmBenchSchedule(reviewToken: string) {
  return scheduleRequest<ScheduleConfirmResult>("/api/v1/editor-bench/schedule/confirm", { reviewToken });
}
export function startBenchConversation(signal?: AbortSignal) {
  return scheduleRequest<BenchConversationSnapshot>("/api/v1/editor-bench/schedule/conversation/session", {}, signal);
}
export function getBenchConversation(sessionId: string, signal?: AbortSignal) {
  return relayFetch<BenchConversationSnapshot>(`/api/v1/editor-bench/schedule/conversation/session/${encodeURIComponent(sessionId)}`, { method: "GET", signal, cache: "no-store" });
}
export function toggleBenchConversationSelection(input: { sessionId: string; revision: number; postId: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationSnapshot>("/api/v1/editor-bench/schedule/conversation/selection/toggle", input, signal);
}
export function sendBenchConversationTurn(input: { sessionId: string; revision: number; latestRequest: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationTurn>("/api/v1/editor-bench/schedule/conversation/turn", input, signal);
}
export function confirmBenchConversation(input: { sessionId: string; reviewToken: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationConfirm>("/api/v1/editor-bench/schedule/conversation/confirm", input, signal);
}
export type BenchConversationXDraftReview = BenchConversationSnapshot & { review: { postId: string; destination: "x" | "deviantart"; sourceTitle: string; copyText: string; variant: Record<string, any>; fieldDiff: Record<string, { before: unknown; after: unknown }>; previewUrl: string; label: string }; reviewToken: string; expiresAt: string };
export type BenchConversationXDraftConfirm = BenchConversationSnapshot & { receipt: BenchConversationDraftReceipt; reused: boolean };
export function reviewBenchConversationXDraft(input: { sessionId: string; revision: number; postId: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationXDraftReview>("/api/v1/editor-bench/schedule/conversation/x-draft/review", input, signal);
}
export function confirmBenchConversationXDraft(input: { sessionId: string; reviewToken: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationXDraftConfirm>("/api/v1/editor-bench/schedule/conversation/x-draft/confirm", input, signal);
}
export function reviewBenchConversationDeviantArtDraft(input: { sessionId: string; revision: number; postId: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationXDraftReview>("/api/v1/editor-bench/schedule/conversation/deviantart-draft/review", input, signal);
}
export function confirmBenchConversationDeviantArtDraft(input: { sessionId: string; reviewToken: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationXDraftConfirm>("/api/v1/editor-bench/schedule/conversation/deviantart-draft/confirm", input, signal);
}
export type BenchConversationXDraftScheduleReview = BenchConversationSnapshot & { review: { variantId: string; destination: "x" | "deviantart"; sourceTitle: string; copyText: string; variant?: Record<string, any>; previewUrl: string; dueAt: { local: string; timezone: "Europe/London"; utc: string }; label: string }; reviewToken: string; expiresAt: string };
export type BenchConversationXDraftScheduleConfirm = BenchConversationSnapshot & { receipt: { token: string; identity: string; variantId: string; planId: string; dueAt: { local: string; timezone: "Europe/London"; utc: string }; scheduledAt: string; event: Record<string, unknown> }; reused: boolean };
export function reviewBenchConversationXDraftSchedule(input: { sessionId: string; revision: number; variantId: string; localDate: string; localTime: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationXDraftScheduleReview>("/api/v1/editor-bench/schedule/conversation/x-draft/schedule/review", input, signal);
}
export function confirmBenchConversationXDraftSchedule(input: { sessionId: string; reviewToken: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationXDraftScheduleConfirm>("/api/v1/editor-bench/schedule/conversation/x-draft/schedule/confirm", input, signal);
}
export function reviewBenchConversationDeviantArtDraftSchedule(input: { sessionId: string; revision: number; variantId: string; localDate: string; localTime: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationXDraftScheduleReview>("/api/v1/editor-bench/schedule/conversation/deviantart-draft/schedule/review", input, signal);
}
export function confirmBenchConversationDeviantArtDraftSchedule(input: { sessionId: string; reviewToken: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationXDraftScheduleConfirm>("/api/v1/editor-bench/schedule/conversation/deviantart-draft/schedule/confirm", input, signal);
}
export type BenchConversationXHandoffReview = BenchConversationSnapshot & { review: { variantId: string; destination: "x" | "deviantart"; sourceTitle: string; copyText: string; variant?: Record<string, any>; previewUrl: string; dueAt: { local: string; timezone: "Europe/London"; utc: string }; label: string }; reviewToken: string; expiresAt: string };
export type BenchConversationXHandoffConfirm = BenchConversationSnapshot & { receipt: { token: string; handoffId: string; identity: string; variantId: string; planId: string; eventId: string; confirmedAt: string; postText: string; exportHash: string; dueAt: { local: string; timezone: "Europe/London"; utc: string }; sourceVersionKey: string; sourceFingerprint: string; variantHash: string }; reused: boolean };
export function reviewBenchConversationXHandoff(input: { sessionId: string; revision: number; variantId: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationXHandoffReview>("/api/v1/editor-bench/schedule/conversation/x-draft/handoff/review", input, signal);
}
export function confirmBenchConversationXHandoff(input: { sessionId: string; reviewToken: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationXHandoffConfirm>("/api/v1/editor-bench/schedule/conversation/x-draft/handoff/confirm", input, signal);
}
export function reviewBenchConversationDeviantArtHandoff(input: { sessionId: string; revision: number; variantId: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationXHandoffReview>("/api/v1/editor-bench/schedule/conversation/deviantart-draft/handoff/review", input, signal);
}
export type BenchConversationDeviantArtHandoffConfirm = BenchConversationSnapshot & { receipt: { token: string; handoffId: string; identity: string; variantId: string; planId: string; eventId: string; confirmedAt: string; title: string; bodyText: string; tags: string[]; exportHash: string; dueAt: { local: string; timezone: "Europe/London"; utc: string }; sourceVersionKey: string; sourceFingerprint: string; variantHash: string }; reused: boolean };
export function confirmBenchConversationDeviantArtHandoff(input: { sessionId: string; reviewToken: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationDeviantArtHandoffConfirm>("/api/v1/editor-bench/schedule/conversation/deviantart-draft/handoff/confirm", input, signal);
}
export function openBenchConversationPreview(input: { sessionId: string; revision: number; postId: string; mediaId: string }, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationPreviewOpen>("/api/v1/editor-bench/schedule/conversation/preview/open", input, signal);
}
export function uploadBenchConversationPreview(sessionId: string, attemptId: string, blob: Blob, signal?: AbortSignal) {
  return relayFetch<{ previewMediaId: string; exportHash: string; size: number }>(`/api/v1/editor-bench/schedule/conversation/session/${encodeURIComponent(sessionId)}/preview/${encodeURIComponent(attemptId)}/upload`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob, signal });
}
export function completeBenchConversationPreview(sessionId: string, attemptId: string, previewMediaId: string, signal?: AbortSignal) {
  return scheduleRequest<{ receipt: BenchConversationPreviewReceipt } & BenchConversationSnapshot>(`/api/v1/editor-bench/schedule/conversation/session/${encodeURIComponent(sessionId)}/preview/${encodeURIComponent(attemptId)}/complete`, { previewMediaId }, signal);
}
export function cancelBenchConversationPreview(sessionId: string, attemptId: string, signal?: AbortSignal) {
  return scheduleRequest<BenchConversationSnapshot>(`/api/v1/editor-bench/schedule/conversation/session/${encodeURIComponent(sessionId)}/preview/${encodeURIComponent(attemptId)}/cancel`, {}, signal);
}
export type BenchVariantEditChatResult = {
  decision: "clarification" | "unchanged" | "review";
  question?: string;
  unchanged?: boolean;
  variantId?: string;
  destination?: "x" | "deviantart";
  expectedRevision?: number;
  oldText?: string;
  newText?: string;
  fieldDiff?: { field: string; before: string; after: string };
  reviewToken?: string;
  expiresAt?: string;
};
export type BenchVariantEditConfirmResult = { reused: boolean; revision: number; receipt: { scope: "development_mock_only"; ephemeral: true; plan: Record<string, unknown>; variant: Record<string, any>; event: ScheduleEvent } };
export function chatBenchVariantEdit(latestRequest: string, signal?: AbortSignal) {
  return scheduleRequest<BenchVariantEditChatResult>("/api/v1/editor-bench/schedule/variant-edit/chat", { latestRequest }, signal);
}
export function confirmBenchVariantEdit(reviewToken: string, signal?: AbortSignal) {
  return scheduleRequest<BenchVariantEditConfirmResult>("/api/v1/editor-bench/schedule/variant-edit/confirm", { reviewToken }, signal);
}

export async function fetchRealLibraryPosts() {
  const out = await relayFetch<{ posts: { post_id: string; title: string }[] }>("/api/v1/creator/schedule-rail/library-posts");
  return out.posts;
}
export async function fetchRealLibraryPost(postId: string) {
  return relayFetch<RealLibraryPost>(`/api/v1/editor-bench/schedule/library-post/${encodeURIComponent(postId)}`);
}
export async function reviewRealLibrarySchedule(input: { latestRequest: string; postId: string; mediaIds: string[] }, signal?: AbortSignal): Promise<RealLibraryReviewResponse> {
  const response = await fetch("/api/editor-bench/library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal });
  const value = await response.json();
  if (!response.ok) {
    const detail = typeof value?.error === "string" ? value.error : typeof value?.error?.message === "string" ? value.error.message : null;
    throw new Error(detail ? `Request failed: ${detail}` : `Request failed (${response.status}).`);
  }
  return value;
}
export function reviewRealLibraryAgain(input: { latestRequest: string; source: RealLibrarySource; intent: unknown }) {
  return scheduleRequest<RealLibraryReviewResult>("/api/v1/editor-bench/schedule/library/review", input);
}
