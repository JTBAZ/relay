/** Shared contract for the Library editor. The model proposes; authenticated services commit. */
import type { PiecePerformanceAnswer } from "../analytics/piece-performance-findings.js";
export const RENAME_NOTICE = "Changes titles in Relay. Existing Patreon posts are unchanged.";
export type PostTitleMode = "source" | "inherit_work" | "custom";
export type WorkTitleMode = "independent" | "inherit_series";
export type EditAction =
  | { id: string; kind: "rename_post"; postId: string; title: string }
  | { id: string; kind: "inherit_post_title"; postId: string }
  | { id: string; kind: "source_post_title"; postId: string }
  | { id: string; kind: "rename_work"; workId: string; title: string }
  | { id: string; kind: "rename_series"; seriesId: string; title: string }
  | { id: string; kind: "set_description"; postId: string; description: string | null }
  | { id: string; kind: "tags"; postId: string; mediaId?: string; add: string[]; remove: string[] }
  | { id: string; kind: "create_collection"; collectionId: string; title: string }
  | { id: string; kind: "rename_collection"; collectionId: string; title: string }
  | { id: string; kind: "collection_membership"; collectionId: string; postIds: string[]; operation: "add" | "remove" }
  | { id: string; kind: "reorder_collection"; collectionId: string; postIds: string[] }
  | { id: string; kind: "reorder_media"; postId: string; mediaIds: string[] }
  | { id: string; kind: "create_series"; seriesId: string; title: string }
  | { id: string; kind: "link_series_work"; seriesId: string; workId: string; partLabel: string; titleMode: WorkTitleMode; sortOrder: number }
  | { id: string; kind: "unlink_series_work"; workId: string; title: string }
  | { id: string; kind: "link_work_post"; workId: string; postId: string; titleMode: PostTitleMode; customTitle?: string; memberLabel?: string; sortOrder: number };
export interface EditorContext {
  selectedPostIds: string[];
  /** Trusted server-owned state for the development real-Library conversation adapter. */
  conversation?: {
    catalogRevision: string;
    excludedPostIds: string[];
    lastRequest: string | null;
    selectionInitialized: boolean;
    pendingPreviewReview?: {
      id: string;
      expectedRevision: number;
      expiresAt: number;
      sourcePostId: string;
      sourceVersionId: string;
      sourceMediaId: string;
      sourceMediaFingerprint: string;
      templateId: string;
      templateUpdatedAt: string;
      templateConfig: Record<string, unknown>;
      templateConfigHash: string;
      stagedMediaId: string;
      stagedStorageKey: string;
      exportHash: string;
      size: number;
    };
    previewReceipts?: Array<{
      reviewId: string;
      sourcePostId: string;
      sourceVersionId: string;
      sourceMediaId: string;
      sourceMediaFingerprint: string;
      mediaId: string;
      exportHash: string;
      size: number;
      templateId: string;
      templateUpdatedAt: string;
      templateConfigHash: string;
      confirmedAt: string;
    }>;
    pendingDraftReview?: {
      id: string;
      kind: 'create' | 'edit';
      expectedRevision: number;
      expectedVariantRevision?: number;
      expiresAt: number;
      sourcePostId: string;
      sourceVersionId: string;
      previewMediaId: string;
      exportHash: string;
      sourceDigest: string;
      destination: 'x' | 'deviantart';
      variantId?: string;
      before: Record<string, unknown> | null;
      after: Record<string, unknown>;
    };
    draftReceipts?: Array<{
      reviewId: string;
      planId: string;
      variantId: string;
      destination: 'x' | 'deviantart';
      sourcePostId: string;
      sourceVersionId: string;
      previewMediaId: string;
      revision: number;
      confirmedAt: string;
    }>;
    pendingScheduleReview?: {
      id: string;
      expectedRevision: number;
      expectedVariantRevision: number;
      expiresAt: number;
      variantId: string;
      planId: string;
      destination: 'x' | 'deviantart';
      sourcePostId: string;
      sourceVersionId: string;
      previewMediaId: string;
      exportHash: string;
      scheduledLocal: string;
      timezone: string;
      scheduledFor: string;
    };
    scheduleReceipts?: Array<{
      reviewId: string;
      planId: string;
      variantId: string;
      taskId: string;
      destination: 'x' | 'deviantart';
      sourcePostId: string;
      sourceVersionId: string;
      previewMediaId: string;
      scheduledLocal: string;
      timezone: string;
      scheduledFor: string;
      confirmedAt: string;
    }>;
    pendingHandoffReview?: {
      id: string;
      expectedRevision: number;
      expectedVariantRevision: number;
      expiresAt: number;
      variantId: string;
      planId: string;
      destination: 'x' | 'deviantart';
      sourcePostId: string;
      sourceVersionId: string;
      previewMediaId: string;
      exportHash: string;
      copyHash: string;
      taskId: string;
      scheduledFor: string;
      copy: { postText: string } | { title: string; bodyText: string; tags: string[] };
    };
    handoffReceipts?: Array<{
      reviewId: string;
      attemptId: string;
      planId: string;
      variantId: string;
      destination: 'x' | 'deviantart';
      sourcePostId: string;
      sourceVersionId: string;
      previewMediaId: string;
      exportHash: string;
      copyHash: string;
      revision: number;
      taskId: string;
      scheduledFor: string;
      confirmedAt: string;
    }>;
    pendingReview?: {
      id: string;
      action: Extract<EditAction, { kind: "rename_post" | "tags" }>;
      actionDigest: string;
      sourceDigest: string;
      expectedRevision: number;
      expiresAt: number;
    };
    lastConfirmation?: { reviewId: string; idempotencyKey: string; actionDigest: string; commitId: string };
  };
  /** Visible posts in the current Library page, in display order; distinct from selection. */
  loadedPostIds?: string[];
  selectedMediaIds?: string[];
  activeCollectionId?: string;
  filters?: Record<string, string | boolean>;
}
export interface NamingProvenance {
  mode: PostTitleMode;
  effectiveTitle: string;
  sourceTitle: string;
  workId?: string;
  workTitle?: string;
  workTitleMode?: WorkTitleMode;
  seriesId?: string;
  seriesTitle?: string;
  partLabel?: string;
  exception: boolean;
}
export interface ResolvedPost {
  postId: string;
  title: string;
  description: string | null;
  mediaIds: string[];
  tags: string[];
  naming: NamingProvenance;
  thumbnailUrl?: string;
}
export interface CartItem {
  targetId: string;
  targetType: "post" | "work" | "series" | "collection";
  title: string;
  thumbnailUrl?: string;
  before: unknown;
  after: unknown;
  actionIds: string[];
  inherited?: boolean;
  exception?: boolean;
  related?: boolean;
  preservedReason?: "source_post_title" | "independent_work";
}
export interface ChangeCart {
  /** Server-captured last editor for each staged action; old sessions may omit this. */
  actionOrigins?: Record<string, 'manual'|'ai'>;
  origin?: "manual" | "ai" | "mixed";
  revision: number;
  actions: EditAction[];
  items: CartItem[];
  /** Server-captured dependency fingerprints, never trusted from the browser/model. */
  dependencies: Record<string, string>;
  conflicts: string[];
  notice: string;
}
export type EditorPerformanceSubjectRef = { kind: "post" | "work"; id: string };
export type EditorMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; performanceAnswer?: PiecePerformanceAnswer };
export interface EditorSession {
  id: string;
  creatorId: string;
  revision: number;
  context: EditorContext;
  messages: EditorMessage[];
  cart: ChangeCart;
  lastReceipt?: CommitReceipt;
}
export interface CommitReceipt {
  summary?: string;
  titleModeCounts?: Partial<Record<'source'|'inherit_work'|'custom'|'independent'|'inherit_series',number>>;
  id: string;
  sessionId: string;
  committedAt: string;
  actionCount: number;
  affectedPostIds: string[];
  preservedExceptions: string[];
  notice: string;
  reversedAt?: string;
}
export class EditorError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
