/** Shared contract for the Library editor. The model proposes; authenticated services commit. */
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
  origin?: "manual" | "ai" | "mixed";
  revision: number;
  actions: EditAction[];
  items: CartItem[];
  /** Server-captured dependency fingerprints, never trusted from the browser/model. */
  dependencies: Record<string, string>;
  conflicts: string[];
  notice: string;
}
export interface EditorMessage { role: "user" | "assistant"; text: string }
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
