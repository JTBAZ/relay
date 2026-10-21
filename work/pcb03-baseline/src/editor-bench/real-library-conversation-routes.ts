import { createHash, randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { errorEnvelope, successEnvelope } from '../contracts/api.js';
import { RelayAuthError } from '../identity/relay-auth-error.js';
import type { EditorProvider } from '../gallery-editor/provider.js';
import type { GalleryEditorService } from '../gallery-editor/service.js';
import { EditorError, type CommitReceipt, type EditorContext, type EditorSession } from '../gallery-editor/types.js';
import { RealLibraryCatalogError, realLibraryCatalogRevision, type LargeRealLibrarySnapshot, type RealLibraryPost } from './library-selection-catalog.js';
import { runBoundedLargeLibrarySelection } from './large-library-chat.js';
import { editActionDigest, reviewRealLibraryEdit, sourceEditDigest, type EditReviewAction } from './real-library-edit-review.js';
import type { RetrievalRefinementState } from './real-library-selection.js';

const MAX_REQUEST_LENGTH = 4000;

type Principal = { creatorId: string; accountId: string };
type Session = { editor: EditorSession; principal: Principal; runtime: RuntimeSession };

export type RealLibraryConversationView = {
  scope: 'real_library_conversation';
  sessionId: string;
  revision: number;
  catalogRevision: string;
  status: 'ready' | 'selected' | 'unchanged' | 'clarification';
  message: string;
  selection: { postIds: string[]; excludedPostIds: string[] };
  catalog: { complete: true; supportedFields: readonly string[]; timezone: 'Europe/London'; posts: RealLibraryPost[] };
  editReview?: { reviewId: string; revision: number; expiresAt: string; before: { title: string; tags: string[] }; after: { title: string; tags: string[] } };
  result?: { matchedPostIds: string[] };
  usage?: { calls: number; known: boolean; inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
};
function applyTagDelta(tags: string[], action: Extract<EditReviewAction, { kind: 'tags' }>): string[] {
  return [...new Set([...tags.filter(tag => !action.remove.includes(tag)), ...action.add])].sort();
}

type RuntimeSession = { generation: number; activeController: AbortController | null };
export function createRealLibraryConversationStore(editor: Pick<GalleryEditorService, 'create' | 'read'>) {
  const runtime = new Map<string, RuntimeSession>();
  const wrap = (principal: Principal, editorSession: EditorSession): Session => {
    let current = runtime.get(editorSession.id);
    if (!current) {
      if (runtime.size >= 96) {
        for (const [id, value] of runtime) if (!value.activeController) { runtime.delete(id); break; }
      }
      current = { generation: 0, activeController: null }; runtime.set(editorSession.id, current);
    }
    return { editor: editorSession, principal, runtime: current };
  };
  const create = async (principal: Principal, catalogRevision: string): Promise<Session> => {
    const editorSession = await editor.create(principal.creatorId, principal.accountId, { selectedPostIds: [], conversation: { catalogRevision, excludedPostIds: [], lastRequest: null, selectionInitialized: false } });
    return wrap(principal, editorSession);
  };
  const owned = async (principal: Principal, id: unknown): Promise<Session | null> => {
    if (typeof id !== 'string') return null;
    try {
      const editorSession = await editor.read(principal.creatorId, principal.accountId, id);
      if (!editorSession.context.conversation) { runtime.get(id)?.activeController?.abort(); runtime.delete(id); return null; }
      return wrap(principal, editorSession);
    } catch (error) { if (error instanceof EditorError && error.status === 404) return null; throw error; }
  };
  const contains = async (session: Session) => {
    try { const current = await editor.read(session.principal.creatorId, session.principal.accountId, session.editor.id); return current.revision === session.editor.revision; }
    catch { return false; }
  };
  return { create, owned, contains };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function state(session: Session): RetrievalRefinementState {
  const data = session.editor.context.conversation!;
  return { v: 2, scope: 'real_library_retrieval', catalogRevision: data.catalogRevision, selectedPostIds: session.editor.context.selectedPostIds, excludedPostIds: data.excludedPostIds };
}
function view(session: Session, snapshot: LargeRealLibrarySnapshot, status: RealLibraryConversationView['status'] = 'ready', message = 'Current owned Library metadata.', matchedPostIds?: string[], usage?: RealLibraryConversationView['usage']): RealLibraryConversationView {
  const selectedPostIds = session.editor.context.selectedPostIds;
  const excludedPostIds = session.editor.context.conversation!.excludedPostIds;
  const pending = session.editor.context.conversation!.pendingReview;
  const source = pending ? snapshot.posts.find(post => post.postId === pending.action.postId) : undefined;
  const before = source ? { title: source.title, tags: [...source.tags] } : undefined;
  let after: { title: string; tags: string[] } | undefined;
  if (source && pending) {
    if (pending.action.kind === 'rename_post') after = { title: pending.action.title, tags: [...source.tags] };
    else if (pending.action.kind === 'tags') {
      const action = pending.action;
      after = { title: source.title, tags: applyTagDelta(source.tags, action) };
    }
  }
  return {
    scope: 'real_library_conversation', sessionId: session.editor.id, revision: session.editor.revision,
    catalogRevision: snapshot.catalogRevision, status, message,
    selection: { postIds: [...selectedPostIds], excludedPostIds: [...excludedPostIds] },
    catalog: { complete: snapshot.complete, supportedFields: snapshot.supportedFields, timezone: snapshot.timezone, posts: snapshot.posts },
    ...(pending && before && after ? { editReview: { reviewId: pending.id, revision: pending.expectedRevision, expiresAt: new Date(pending.expiresAt).toISOString(), before, after } } : {}),
    ...(matchedPostIds ? { result: { matchedPostIds } } : {}), ...(usage ? { usage } : {})
  };
}
function invalid(res: Response, traceId: string, message: string) {
  return res.status(400).json(errorEnvelope('INVALID_REQUEST', message, traceId));
}

export function registerRealLibraryConversationRoutes(app: express.Application, options: {
  development: boolean;
  authenticateCreator: (req: Request, options: { readonlySession: true }) => Promise<Principal | null>;
  loadSnapshot: (accountId: string, creatorId: string, signal?: AbortSignal) => Promise<LargeRealLibrarySnapshot>;
  getProvider: () => Promise<EditorProvider | null>;
  editor: Pick<GalleryEditorService, 'create' | 'read' | 'revise' | 'apply' | 'readCommitReceiptByKey'>;
  authorizeMutation: (req: Request, res: Response) => Promise<Principal | null>;
  editorEnabled: (creatorId: string) => boolean;
  editorStoresReady: boolean;
  traceId: (req: Request) => string;
  now?: () => Date;
  nowMs?: () => number;
  store?: ReturnType<typeof createRealLibraryConversationStore>;
}): void {
  if (!options.development) return;
  const store = options.store ?? createRealLibraryConversationStore(options.editor);
  const clock = options.now ?? (() => new Date());
  const principalFor = async (req: Request, res: Response, traceId: string): Promise<Principal | null> => {
    try {
      const principal = await options.authenticateCreator(req, { readonlySession: true });
      if (!principal?.creatorId || !principal.accountId) {
        res.status(401).json(errorEnvelope('AUTH_ERROR', 'Authentication required.', traceId));
        return null;
      }
      return principal;
    } catch (error) {
      if (error instanceof RelayAuthError) res.status(error.status).json(error.toEnvelope(traceId));
      else res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The owned Library could not be loaded.', traceId));
      return null;
    }
  };
  const owned = async (principal: Principal, id: unknown, res: Response, traceId: string): Promise<Session | null> => {
    try { return await store.owned(principal, id); }
    catch { res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The durable conversation could not be loaded.', traceId)); return null; }
  };
  const load = async (principal: Principal, signal?: AbortSignal) => options.loadSnapshot(principal.accountId, principal.creatorId, signal);
  const stale = (res: Response, traceId: string, session: Session, snapshot: LargeRealLibrarySnapshot) => res.status(409).json(errorEnvelope('STALE_LIBRARY', 'The Library changed. Refresh this conversation to clear its selection and choose again.', traceId, [
    { field: 'sessionRevision', issue: String(session.editor.revision) },
    { field: 'currentCatalogRevision', issue: snapshot.catalogRevision },
    { field: 'refreshPath', issue: '/api/v1/editor-bench/real-library-conversation/session/:sessionId/refresh' }
  ]));
  const snapshotError = (res: Response, traceId: string, error: unknown) => {
    if (error instanceof RealLibraryCatalogError) return res.status(error.code === 'catalog_incomplete' ? 503 : 413).json(errorEnvelope(error.code.toUpperCase(), error.message, traceId));
    return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The complete owned Library snapshot is temporarily unavailable.', traceId));
  };
  const editorMutationPrincipal = async (req: Request, res: Response, traceId: string, principal: Principal) => {
    if (!options.editorEnabled(principal.creatorId) || !options.editorStoresReady) {
      res.status(403).json(errorEnvelope('EDITOR_DISABLED', 'Source edits are unavailable for this Library.', traceId));
      return null;
    }
    try {
      const authorized = await options.authorizeMutation(req, res);
      if (res.headersSent) return null;
      if (!authorized || authorized.creatorId !== principal.creatorId || authorized.accountId !== principal.accountId) {
        res.status(403).json(errorEnvelope('FORBIDDEN', 'The authenticated account cannot edit this Library.', traceId));
        return null;
      }
      return authorized;
    } catch (error) {
      if (error instanceof RelayAuthError) res.status(error.status).json(error.toEnvelope(traceId));
      else res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The Library edit could not be authorized.', traceId));
      return null;
    }
  };
  const confirmationKey = (sessionId: string, reviewId: string) => `real-library-conversation:${createHash('sha256').update(`${sessionId}\0${reviewId}`).digest('hex')}`;
  const basePath = '/api/v1/editor-bench/real-library-conversation';

  app.post(`${basePath}/session`, async (req, res) => {
    const traceId = options.traceId(req);
    res.setHeader('Cache-Control', 'private, no-store');
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, [])) return invalid(res, traceId, 'Start a Library conversation without sending catalog or selection data.');
    try {
      const snapshot = await load(principal);
      const session = await store.create(principal, snapshot.catalogRevision);
      return res.status(201).json(successEnvelope(view(session, snapshot), traceId));
    } catch (error) {
      if (error instanceof Error && error.message === 'conversation_capacity') return res.status(429).json(errorEnvelope('CONFLICT', 'Too many active Library conversations. Close an older session and retry.', traceId));
      return snapshotError(res, traceId, error);
    }
  });

  app.get(`${basePath}/session/:sessionId`, async (req, res) => {
    const traceId = options.traceId(req);
    res.setHeader('Cache-Control', 'private, no-store');
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    const session = await owned(principal, req.params.sessionId, res, traceId);
    if (!session) return res.headersSent ? undefined : res.status(404).json(errorEnvelope('NOT_FOUND', 'Library conversation not found. Start a new conversation.', traceId));
    try {
      const snapshot = await load(principal);
      if (!await store.contains(session)) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Library conversation not found. Start a new conversation.', traceId));
      if (snapshot.catalogRevision !== session.editor.context.conversation!.catalogRevision) return stale(res, traceId, session, snapshot);
      return res.status(200).json(successEnvelope(view(session, snapshot), traceId));
    } catch (error) { return snapshotError(res, traceId, error); }
  });

  app.post(`${basePath}/session/:sessionId/refresh`, async (req, res) => {
    const traceId = options.traceId(req);
    res.setHeader('Cache-Control', 'private, no-store');
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, ['expectedRevision']) || !Number.isSafeInteger(req.body.expectedRevision) || (req.body.expectedRevision as number) < 0) return invalid(res, traceId, 'Provide the current conversation revision to refresh and clear its selection.');
    const session = await owned(principal, req.params.sessionId, res, traceId);
    if (!session) return res.headersSent ? undefined : res.status(404).json(errorEnvelope('NOT_FOUND', 'Library conversation not found. Start a new conversation.', traceId));
    if (req.body.expectedRevision !== session.editor.revision) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed. Read it again before refreshing.', traceId));
    session.runtime.generation += 1;
    const generation = session.runtime.generation;
    session.runtime.activeController?.abort();
    session.runtime.activeController = null;
    try {
      const snapshot = await load(principal);
      if (!await store.contains(session) || session.runtime.generation !== generation) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed before it could be refreshed.', traceId));
      const context: EditorContext = { ...session.editor.context, selectedPostIds: [], conversation: { catalogRevision: snapshot.catalogRevision, excludedPostIds: [], lastRequest: null, selectionInitialized: false } };
      session.editor = await options.editor.revise(principal.creatorId, principal.accountId, session.editor.id, session.editor.revision, session.editor.cart.actions, context, session.editor.messages, 'manual', undefined, true);
      return res.status(200).json(successEnvelope(view(session, snapshot, 'ready', 'Library refreshed and selection cleared.'), traceId));
    } catch (error) { return snapshotError(res, traceId, error); }
  });

  app.post(`${basePath}/session/:sessionId/turn`, async (req, res) => {
    const traceId = options.traceId(req);
    res.setHeader('Cache-Control', 'private, no-store');
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, ['expectedRevision', 'latestRequest', 'sessionId']) || req.body.sessionId !== req.params.sessionId || !Number.isSafeInteger(req.body.expectedRevision) || (req.body.expectedRevision as number) < 0 || typeof req.body.latestRequest !== 'string' || !req.body.latestRequest.trim() || req.body.latestRequest.length > MAX_REQUEST_LENGTH) return invalid(res, traceId, 'Provide this conversation ID, its current revision, and one selection request.');
    const session = await owned(principal, req.body.sessionId, res, traceId);
    if (!session) return res.headersSent ? undefined : res.status(404).json(errorEnvelope('NOT_FOUND', 'Library conversation not found. Start a new conversation.', traceId));
    if (req.body.expectedRevision !== session.editor.revision) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed. Read it again before sending another request.', traceId));
    if (session.editor.context.conversation!.pendingReview) try {
      const pending = session.editor.context.conversation!.pendingReview!;
      const conversation = { ...session.editor.context.conversation! };
      delete conversation.pendingReview;
      const context: EditorContext = { ...session.editor.context, conversation };
      session.editor = await options.editor.revise(principal.creatorId, principal.accountId, session.editor.id, session.editor.revision, session.editor.cart.actions.filter(action => action.id !== pending.action.id || editActionDigest(action) !== pending.actionDigest), context, session.editor.messages, 'manual', undefined, true);
    } catch (error) {
      if (error instanceof EditorError) return res.status(error.status).json(errorEnvelope(error.code, error.message, traceId));
      return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The durable conversation could not be updated.', traceId));
    }
    const requestController = new AbortController();
    const abort = () => { if (!res.writableEnded) requestController.abort(); };
    req.once('aborted', abort);
    res.once('close', abort);
    session.runtime.generation += 1;
    const generation = session.runtime.generation;
    session.runtime.activeController?.abort();
    session.runtime.activeController = requestController;
    const revision = session.editor.revision;
    try {
      const snapshot = await load(principal, requestController.signal);
      if (requestController.signal.aborted) return res.status(499).json(errorEnvelope('REQUEST_CANCELLED', 'The selection request was cancelled.', traceId));
      if (!await store.contains(session) || session.runtime.generation !== generation) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed before selection could begin.', traceId));
      if (snapshot.catalogRevision !== session.editor.context.conversation!.catalogRevision) return stale(res, traceId, session, snapshot);
      const result = await runBoundedLargeLibrarySelection({
        latestRequest: req.body.latestRequest,
        state: session.editor.context.conversation!.selectionInitialized ? state(session) : null,
        snapshot,
        provider: await options.getProvider(),
        now: clock(),
        signal: requestController.signal
      });
      if (requestController.signal.aborted) return res.status(499).json(errorEnvelope('REQUEST_CANCELLED', 'The selection request was cancelled.', traceId));
      if (!await store.contains(session) || session.runtime.generation !== generation) return res.status(409).json(errorEnvelope('CONFLICT', 'A newer conversation request replaced this result.', traceId));
      const currentSnapshot = await load(principal, requestController.signal);
      if (requestController.signal.aborted) return res.status(499).json(errorEnvelope('REQUEST_CANCELLED', 'The selection request was cancelled.', traceId));
      if (!await store.contains(session) || session.runtime.generation !== generation) return res.status(409).json(errorEnvelope('CONFLICT', 'A newer conversation request replaced this result.', traceId));
      if (currentSnapshot.catalogRevision !== session.editor.context.conversation!.catalogRevision) return stale(res, traceId, session, currentSnapshot);
      if (result.status !== 200 || 'error' in result.body) return res.status(result.status).json(errorEnvelope(('error' in result.body ? result.body.error : 'selection_unavailable').toUpperCase(), 'message' in result.body ? result.body.message : 'Library selection is temporarily unavailable.', traceId));
      const interpreted = result.body;
      const nextState = interpreted.status !== 'clarification' && interpreted.result.selector !== null ? interpreted.refinementState : state(session);
      const conversation = { ...session.editor.context.conversation!, catalogRevision: currentSnapshot.catalogRevision, excludedPostIds: nextState.excludedPostIds, lastRequest: req.body.latestRequest, selectionInitialized: session.editor.context.conversation!.selectionInitialized || (interpreted.status !== 'clarification' && interpreted.result.selector !== null) };
      delete conversation.pendingReview;
      const context: EditorContext = { ...session.editor.context, selectedPostIds: nextState.selectedPostIds, conversation };
      const messages = [...session.editor.messages, { role: 'user' as const, text: req.body.latestRequest }, { role: 'assistant' as const, text: interpreted.message }].slice(-40);
      session.editor = await options.editor.revise(principal.creatorId, principal.accountId, session.editor.id, revision, session.editor.cart.actions, context, messages, 'manual', undefined, true);
      const responseView = view(session, currentSnapshot, interpreted.status, interpreted.message, interpreted.result.matchedPostIds, interpreted.usage);
      return res.status(200).json(successEnvelope(responseView, traceId));
    } catch (error) {
      if (requestController.signal.aborted) return res.status(499).json(errorEnvelope('REQUEST_CANCELLED', 'The selection request was cancelled.', traceId));
      if (error instanceof RealLibraryCatalogError) return snapshotError(res, traceId, error);
      return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'Library selection is temporarily unavailable.', traceId));
    } finally {
      req.off('aborted', abort);
      res.off('close', abort);
      if (session.runtime.activeController === requestController) session.runtime.activeController = null;
    }
  });

  app.post(`${basePath}/session/:sessionId/review`, async (req, res) => {
    const traceId = options.traceId(req); res.setHeader('Cache-Control', 'private, no-store');
    const principal = await principalFor(req, res, traceId); if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, ['expectedRevision', 'latestRequest', 'sessionId']) || req.body.sessionId !== req.params.sessionId || !Number.isSafeInteger(req.body.expectedRevision) || (req.body.expectedRevision as number) < 0 || typeof req.body.latestRequest !== 'string' || !req.body.latestRequest.trim() || req.body.latestRequest.length > MAX_REQUEST_LENGTH) return invalid(res, traceId, 'Provide this conversation ID, its current revision, and one source edit request.');
    const session = await owned(principal, req.body.sessionId, res, traceId);
    if (!session) return res.headersSent ? undefined : res.status(404).json(errorEnvelope('NOT_FOUND', 'Library conversation not found. Start a new conversation.', traceId));
    if (req.body.expectedRevision !== session.editor.revision) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed. Read it again before reviewing an edit.', traceId));
    if (session.editor.context.selectedPostIds.length !== 1) return res.status(409).json(errorEnvelope('EDIT_SELECTION_REQUIRED', 'Select exactly one Library post before reviewing a source edit.', traceId));
    const mutationPrincipal = await editorMutationPrincipal(req, res, traceId, principal); if (!mutationPrincipal) return;
    const reviewId = randomUUID();
    try {
      const snapshot = await load(principal);
      if (snapshot.catalogRevision !== session.editor.context.conversation!.catalogRevision) return stale(res, traceId, session, snapshot);
      const source = snapshot.posts.find(post => post.postId === session.editor.context.selectedPostIds[0]);
      if (!source) return res.status(409).json(errorEnvelope('EDIT_SELECTION_REQUIRED', 'The selected Library post is unavailable. Refresh the conversation and select it again.', traceId));
      const oldPending = session.editor.context.conversation!.pendingReview;
      const remainingActions = oldPending ? session.editor.cart.actions.filter(action => action.id !== oldPending.action.id || editActionDigest(action) !== oldPending.actionDigest) : session.editor.cart.actions;
      if (remainingActions.length) return res.status(409).json(errorEnvelope('CART_NOT_EMPTY', 'Resolve the existing editor cart before reviewing a conversation edit.', traceId));
      let working = session.editor;
      if (oldPending) {
        const conversation = { ...working.context.conversation!, lastRequest: req.body.latestRequest };
        delete conversation.pendingReview;
        const context: EditorContext = { ...working.context, conversation };
        working = await options.editor.revise(principal.creatorId, principal.accountId, working.id, working.revision, remainingActions, context, [...working.messages, { role: 'user' as const, text: req.body.latestRequest }].slice(-40), 'manual', undefined, true);
      }
      const provider = await options.getProvider();
      if (!provider) return res.status(503).json(errorEnvelope('EDIT_REVIEW_UNAVAILABLE', 'Source edit review is unavailable.', traceId));
      const result = await reviewRealLibraryEdit({ latestRequest: req.body.latestRequest, post: source, provider });
      const currentSnapshot = await load(principal);
      const currentSession = await owned(principal, working.id, res, traceId);
      if (!currentSession && res.headersSent) return;
      if (!currentSession || currentSession.editor.revision !== working.revision) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed during edit review. Read it again before continuing.', traceId));
      if (currentSnapshot.catalogRevision !== working.context.conversation!.catalogRevision || sourceEditDigest(currentSnapshot.posts.find(post => post.postId === source.postId) ?? source) !== sourceEditDigest(source)) return stale(res, traceId, currentSession, currentSnapshot);
      if ('clarification' in result) {
        const context: EditorContext = { ...working.context, conversation: { ...working.context.conversation!, lastRequest: req.body.latestRequest } };
        const messages = [...working.messages, ...(oldPending ? [] : [{ role: 'user' as const, text: req.body.latestRequest }]), { role: 'assistant' as const, text: result.clarification }].slice(-40);
        const updated = await options.editor.revise(principal.creatorId, principal.accountId, working.id, working.revision, working.cart.actions, context, messages, 'manual', undefined, true);
        return res.status(200).json(successEnvelope({ scope: 'real_library_edit_review', status: 'clarification', sessionId: updated.id, revision: updated.revision, message: result.clarification, selection: { postIds: updated.context.selectedPostIds, excludedPostIds: updated.context.conversation!.excludedPostIds }, ...(result.usage ? { usage: { calls: result.usage.calls ?? 1, known: true, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd: result.usage.costUsd ?? null } } : {}) }, traceId));
      }
      const actionDigest = editActionDigest(result.action);
      const pendingReview = { id: reviewId, action: result.action, actionDigest, sourceDigest: sourceEditDigest(source), expectedRevision: working.revision + 1, expiresAt: (options.nowMs ?? Date.now)() + 15 * 60 * 1000 };
      const context: EditorContext = { ...working.context, conversation: { ...working.context.conversation!, lastRequest: req.body.latestRequest, pendingReview } };
      const messages = [...working.messages, ...(oldPending ? [] : [{ role: 'user' as const, text: req.body.latestRequest }]), { role: 'assistant' as const, text: 'Review the source change and confirm it to apply.' }].slice(-40);
      const updated = await options.editor.revise(principal.creatorId, principal.accountId, working.id, working.revision, [result.action], context, messages, 'manual', undefined, true);
      return res.status(200).json(successEnvelope({ scope: 'real_library_edit_review', status: 'review', sessionId: updated.id, revision: updated.revision, reviewId, expiresAt: new Date(pendingReview.expiresAt).toISOString(), before: result.before, after: result.after, message: 'Review the source change and confirm it to apply.', ...(result.usage ? { usage: { calls: result.usage.calls ?? 1, known: true, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costUsd: result.usage.costUsd ?? null } } : {}) }, traceId));
    } catch (error) {
      if (error instanceof EditorError) return res.status(error.status).json(errorEnvelope(error.code, error.message, traceId));
      return snapshotError(res, traceId, error);
    }
  });

  app.post(`${basePath}/session/:sessionId/confirm`, async (req, res) => {
    const traceId = options.traceId(req); res.setHeader('Cache-Control', 'private, no-store');
    const principal = await principalFor(req, res, traceId); if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, ['expectedRevision', 'reviewId']) || typeof req.body.reviewId !== 'string' || !req.body.reviewId || !Number.isSafeInteger(req.body.expectedRevision) || (req.body.expectedRevision as number) < 0) return invalid(res, traceId, 'Provide the reviewed edit ID and current conversation revision to confirm.');
    const session = await owned(principal, req.params.sessionId, res, traceId);
    if (!session) return res.headersSent ? undefined : res.status(404).json(errorEnvelope('NOT_FOUND', 'Library conversation not found. Start a new conversation.', traceId));
    const mutationPrincipal = await editorMutationPrincipal(req, res, traceId, principal); if (!mutationPrincipal) return;
    const idempotencyKey = confirmationKey(session.editor.id, req.body.reviewId);
    try {
      const replay = await options.editor.readCommitReceiptByKey(principal.creatorId, principal.accountId, session.editor.id, idempotencyKey);
      if (replay) {
        const currentSnapshot = await load(principal);
        const current = await owned(principal, session.editor.id, res, traceId);
        if (!current && res.headersSent) return;
        const matchesDurableCatalog = current?.editor.context.conversation?.catalogRevision === currentSnapshot.catalogRevision;
        return res.status(200).json(successEnvelope({ scope: 'real_library_edit_confirmation', status: 'confirmed', receipt: replay, conversation: current && matchesDurableCatalog ? view(current, currentSnapshot) : null, ...(matchesDurableCatalog ? {} : { catalogChanged: true }) }, traceId));
      }
      if (req.body.expectedRevision !== session.editor.revision) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed. Read it again before confirming.', traceId));
      const pending = session.editor.context.conversation!.pendingReview;
      if (!pending || pending.id !== req.body.reviewId || pending.expectedRevision !== session.editor.revision || pending.expiresAt <= (options.nowMs ?? Date.now)()) return res.status(409).json(errorEnvelope('REVIEW_STALE', 'This edit review expired or was replaced. Review the source change again.', traceId));
      if (session.editor.cart.actions.length !== 1 || editActionDigest(session.editor.cart.actions[0]!) !== pending.actionDigest || editActionDigest(pending.action) !== pending.actionDigest) return res.status(409).json(errorEnvelope('REVIEW_STALE', 'The reviewed edit no longer matches the editor cart. Review it again.', traceId));
      const snapshot = await load(principal);
      if (snapshot.catalogRevision !== session.editor.context.conversation!.catalogRevision) return stale(res, traceId, session, snapshot);
      const source = snapshot.posts.find(post => post.postId === session.editor.context.selectedPostIds[0]);
      if (!source || source.postId !== pending.action.postId || sourceEditDigest(source) !== pending.sourceDigest) return res.status(409).json(errorEnvelope('REVIEW_STALE', 'The selected source changed after review. Review it again.', traceId));
      const expectedPosts = snapshot.posts.map(post => {
        if (post.postId !== pending.action.postId) return post;
        if (pending.action.kind === 'rename_post') return { ...post, title: pending.action.title };
        if (pending.action.kind === 'tags') {
          const action = pending.action;
          return { ...post, tags: applyTagDelta(post.tags, action) };
        }
        return post;
      });
      const expectedCatalogRevision = realLibraryCatalogRevision(principal.accountId, principal.creatorId, expectedPosts);
      const receipt = await options.editor.apply(principal.creatorId, principal.accountId, session.editor.id, session.editor.revision, idempotencyKey, 'manual', (committed: CommitReceipt, locked: EditorSession): EditorContext => {
        const lockedReview = locked.context.conversation?.pendingReview;
        if (!lockedReview || lockedReview.id !== pending.id || locked.revision !== pending.expectedRevision || locked.cart.actions.length !== 1 || editActionDigest(locked.cart.actions[0]!) !== pending.actionDigest) throw new EditorError('REVIEW_STALE', 'The reviewed edit changed before confirmation.', 409);
        const conversation = { ...locked.context.conversation!, catalogRevision: expectedCatalogRevision, lastConfirmation: { reviewId: pending.id, idempotencyKey, actionDigest: pending.actionDigest, commitId: committed.id } };
        delete conversation.pendingReview;
        return { ...locked.context, conversation };
      });
      const updatedSnapshot = await load(principal);
      const applied = await owned(principal, session.editor.id, res, traceId);
      if (!applied) return res.headersSent ? undefined : res.status(404).json(errorEnvelope('NOT_FOUND', 'Library conversation not found after applying the edit.', traceId));
      const matchesDurableCatalog = applied.editor.context.conversation?.catalogRevision === updatedSnapshot.catalogRevision;
      return res.status(200).json(successEnvelope({ scope: 'real_library_edit_confirmation', status: 'confirmed', receipt, conversation: matchesDurableCatalog ? view(applied, updatedSnapshot) : null, ...(matchesDurableCatalog ? {} : { catalogChanged: true }) }, traceId));
    } catch (error) {
      if (error instanceof EditorError) return res.status(error.status).json(errorEnvelope(error.code, error.message, traceId));
      return snapshotError(res, traceId, error);
    }
  });
}
