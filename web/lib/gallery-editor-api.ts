import { relayFetch } from "./relay-api";
import type { CommitReceipt, EditAction, EditorContext, EditorSession } from "../../src/gallery-editor/types";

export type { CartItem, CommitReceipt, EditAction, EditorContext, EditorSession, NamingProvenance } from "../../src/gallery-editor/types";
export interface LibraryEditorCapabilities { enabled: boolean; aiAvailable: boolean; notice: string }
const base = "/api/v1/gallery/editor";
export function fetchLibraryEditorCapabilities(creatorId: string, signal?: AbortSignal): Promise<LibraryEditorCapabilities> {
  return relayFetch(`${base}/capabilities?creator_id=${encodeURIComponent(creatorId)}`, { signal });
}
export function createLibraryEditorSession(creatorId: string, context: EditorContext): Promise<EditorSession> {
  return relayFetch(`${base}/sessions`, { method: "POST", body: JSON.stringify({ creator_id: creatorId, context }) });
}
export function fetchLibraryEditorSession(id: string): Promise<EditorSession> {
  return relayFetch(`${base}/sessions/${encodeURIComponent(id)}`);
}
export function reviseLibraryEditorSession(session: EditorSession, actions: EditAction[], context: EditorContext): Promise<EditorSession> {
  return relayFetch(`${base}/sessions/${encodeURIComponent(session.id)}`, { method: "PATCH", body: JSON.stringify({ revision: session.revision, actions, context }) });
}
export function sendLibraryEditorMessage(session: EditorSession, message: string, context: EditorContext): Promise<EditorSession> {
  return relayFetch(`${base}/sessions/${encodeURIComponent(session.id)}/turn`, { method: "POST", body: JSON.stringify({ revision: session.revision, message, context }) });
}
export function applyLibraryEditorSession(session: EditorSession, idempotencyKey: string): Promise<{ receipt: CommitReceipt }> {
  return relayFetch(`${base}/sessions/${encodeURIComponent(session.id)}/apply`, { method: "POST", body: JSON.stringify({ revision: session.revision, idempotencyKey }) });
}
export function undoLibraryEditorCommit(receiptId: string): Promise<{ receipt: CommitReceipt }> {
  return relayFetch(`${base}/commits/${encodeURIComponent(receiptId)}/undo`, { method: "POST", body: JSON.stringify({}) });
}
