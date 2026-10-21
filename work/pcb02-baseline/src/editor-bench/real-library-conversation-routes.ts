import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { errorEnvelope, successEnvelope } from '../contracts/api.js';
import { RelayAuthError } from '../identity/relay-auth-error.js';
import type { EditorProvider } from '../gallery-editor/provider.js';
import { RealLibraryCatalogError, type LargeRealLibrarySnapshot, type RealLibraryPost } from './library-selection-catalog.js';
import { runBoundedLargeLibrarySelection } from './large-library-chat.js';
import type { RetrievalRefinementState } from './real-library-selection.js';

const IDLE_MS = 2 * 60 * 60 * 1000;
const MAX_PER_CREATOR = 12;
const MAX_TOTAL = 96;
const MAX_REQUEST_LENGTH = 4000;

type Principal = { creatorId: string; accountId: string };
type Session = {
  id: string;
  creatorId: string;
  accountId: string;
  catalogRevision: string;
  selectionState: RetrievalRefinementState | null;
  lastRequest: string | null;
  revision: number;
  generation: number;
  activeController: AbortController | null;
  touchedAt: number;
};

export type RealLibraryConversationView = {
  scope: 'real_library_conversation';
  sessionId: string;
  revision: number;
  catalogRevision: string;
  status: 'ready' | 'selected' | 'unchanged' | 'clarification';
  message: string;
  selection: { postIds: string[]; excludedPostIds: string[] };
  catalog: { complete: true; supportedFields: readonly string[]; timezone: 'Europe/London'; posts: RealLibraryPost[] };
  result?: { matchedPostIds: string[] };
  usage?: { calls: number; known: boolean; inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
};

export function createRealLibraryConversationStore(now: () => number = Date.now) {
  const sessions = new Map<string, Session>();
  const prune = () => {
    const time = now();
    for (const [id, session] of sessions) if (time - session.touchedAt > IDLE_MS) {
      session.generation += 1;
      session.activeController?.abort();
      sessions.delete(id);
    }
  };
  const create = (principal: Principal, catalogRevision: string): Session => {
    prune();
    if (sessions.size >= MAX_TOTAL || [...sessions.values()].filter(session => session.creatorId === principal.creatorId && session.accountId === principal.accountId).length >= MAX_PER_CREATOR) throw new Error('conversation_capacity');
    const session: Session = {
      id: randomUUID(), creatorId: principal.creatorId, accountId: principal.accountId,
      catalogRevision, selectionState: null, lastRequest: null, revision: 0,
      generation: 0, activeController: null, touchedAt: now()
    };
    sessions.set(session.id, session);
    return session;
  };
  const owned = (principal: Principal, id: unknown): Session | null => {
    if (typeof id !== 'string') return null;
    prune();
    const session = sessions.get(id);
    if (!session || session.creatorId !== principal.creatorId || session.accountId !== principal.accountId) return null;
    session.touchedAt = now();
    return session;
  };
  const contains = (session: Session) => sessions.get(session.id) === session;
  return { create, owned, contains, size: () => { prune(); return sessions.size; } };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function view(session: Session, snapshot: LargeRealLibrarySnapshot, status: RealLibraryConversationView['status'] = 'ready', message = 'Current owned Library metadata.', matchedPostIds?: string[], usage?: RealLibraryConversationView['usage']): RealLibraryConversationView {
  const selectedPostIds = session.selectionState?.selectedPostIds ?? [];
  const excludedPostIds = session.selectionState?.excludedPostIds ?? [];
  return {
    scope: 'real_library_conversation', sessionId: session.id, revision: session.revision,
    catalogRevision: snapshot.catalogRevision, status, message,
    selection: { postIds: [...selectedPostIds], excludedPostIds: [...excludedPostIds] },
    catalog: { complete: snapshot.complete, supportedFields: snapshot.supportedFields, timezone: snapshot.timezone, posts: snapshot.posts },
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
  traceId: (req: Request) => string;
  now?: () => Date;
  nowMs?: () => number;
  store?: ReturnType<typeof createRealLibraryConversationStore>;
}): void {
  if (!options.development) return;
  const store = options.store ?? createRealLibraryConversationStore(options.nowMs);
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
  const load = async (principal: Principal, signal?: AbortSignal) => options.loadSnapshot(principal.accountId, principal.creatorId, signal);
  const stale = (res: Response, traceId: string, session: Session, snapshot: LargeRealLibrarySnapshot) => res.status(409).json(errorEnvelope('STALE_LIBRARY', 'The Library changed. Refresh this conversation to clear its selection and choose again.', traceId, [
    { field: 'sessionRevision', issue: String(session.revision) },
    { field: 'currentCatalogRevision', issue: snapshot.catalogRevision },
    { field: 'refreshPath', issue: '/api/v1/editor-bench/real-library-conversation/session/:sessionId/refresh' }
  ]));
  const snapshotError = (res: Response, traceId: string, error: unknown) => {
    if (error instanceof RealLibraryCatalogError) return res.status(error.code === 'catalog_incomplete' ? 503 : 413).json(errorEnvelope(error.code.toUpperCase(), error.message, traceId));
    return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The complete owned Library snapshot is temporarily unavailable.', traceId));
  };
  const basePath = '/api/v1/editor-bench/real-library-conversation';

  app.post(`${basePath}/session`, async (req, res) => {
    const traceId = options.traceId(req);
    res.setHeader('Cache-Control', 'private, no-store');
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, [])) return invalid(res, traceId, 'Start a Library conversation without sending catalog or selection data.');
    try {
      const snapshot = await load(principal);
      const session = store.create(principal, snapshot.catalogRevision);
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
    const session = store.owned(principal, req.params.sessionId);
    if (!session) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Library conversation not found. Start a new conversation.', traceId));
    try {
      const snapshot = await load(principal);
      if (!store.contains(session)) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Library conversation not found. Start a new conversation.', traceId));
      if (snapshot.catalogRevision !== session.catalogRevision) return stale(res, traceId, session, snapshot);
      return res.status(200).json(successEnvelope(view(session, snapshot), traceId));
    } catch (error) { return snapshotError(res, traceId, error); }
  });

  app.post(`${basePath}/session/:sessionId/refresh`, async (req, res) => {
    const traceId = options.traceId(req);
    res.setHeader('Cache-Control', 'private, no-store');
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, ['expectedRevision']) || !Number.isSafeInteger(req.body.expectedRevision) || (req.body.expectedRevision as number) < 0) return invalid(res, traceId, 'Provide the current conversation revision to refresh and clear its selection.');
    const session = store.owned(principal, req.params.sessionId);
    if (!session) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Library conversation not found. Start a new conversation.', traceId));
    if (req.body.expectedRevision !== session.revision) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed. Read it again before refreshing.', traceId));
    session.generation += 1;
    const generation = session.generation;
    session.activeController?.abort();
    session.activeController = null;
    try {
      const snapshot = await load(principal);
      if (!store.contains(session) || session.revision !== req.body.expectedRevision || session.generation !== generation) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed before it could be refreshed.', traceId));
      session.catalogRevision = snapshot.catalogRevision;
      session.selectionState = null;
      session.lastRequest = null;
      session.revision += 1;
      session.touchedAt = (options.nowMs ?? Date.now)();
      return res.status(200).json(successEnvelope(view(session, snapshot, 'ready', 'Library refreshed and selection cleared.'), traceId));
    } catch (error) { return snapshotError(res, traceId, error); }
  });

  app.post(`${basePath}/session/:sessionId/turn`, async (req, res) => {
    const traceId = options.traceId(req);
    res.setHeader('Cache-Control', 'private, no-store');
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, ['expectedRevision', 'latestRequest', 'sessionId']) || req.body.sessionId !== req.params.sessionId || !Number.isSafeInteger(req.body.expectedRevision) || (req.body.expectedRevision as number) < 0 || typeof req.body.latestRequest !== 'string' || !req.body.latestRequest.trim() || req.body.latestRequest.length > MAX_REQUEST_LENGTH) return invalid(res, traceId, 'Provide this conversation ID, its current revision, and one selection request.');
    const session = store.owned(principal, req.body.sessionId);
    if (!session) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Library conversation not found. Start a new conversation.', traceId));
    if (req.body.expectedRevision !== session.revision) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed. Read it again before sending another request.', traceId));
    const requestController = new AbortController();
    const abort = () => { if (!res.writableEnded) requestController.abort(); };
    req.once('aborted', abort);
    res.once('close', abort);
    session.generation += 1;
    const generation = session.generation;
    session.activeController?.abort();
    session.activeController = requestController;
    const revision = session.revision;
    try {
      const snapshot = await load(principal, requestController.signal);
      if (requestController.signal.aborted) return res.status(499).json(errorEnvelope('REQUEST_CANCELLED', 'The selection request was cancelled.', traceId));
      if (!store.contains(session) || session.generation !== generation || session.revision !== revision) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed before selection could begin.', traceId));
      if (snapshot.catalogRevision !== session.catalogRevision) return stale(res, traceId, session, snapshot);
      const result = await runBoundedLargeLibrarySelection({
        latestRequest: req.body.latestRequest,
        state: session.selectionState,
        snapshot,
        provider: await options.getProvider(),
        now: clock(),
        signal: requestController.signal
      });
      if (requestController.signal.aborted) return res.status(499).json(errorEnvelope('REQUEST_CANCELLED', 'The selection request was cancelled.', traceId));
      if (!store.contains(session) || session.generation !== generation || session.revision !== revision) return res.status(409).json(errorEnvelope('CONFLICT', 'A newer conversation request replaced this result.', traceId));
      const currentSnapshot = await load(principal, requestController.signal);
      if (requestController.signal.aborted) return res.status(499).json(errorEnvelope('REQUEST_CANCELLED', 'The selection request was cancelled.', traceId));
      if (!store.contains(session) || session.generation !== generation || session.revision !== revision) return res.status(409).json(errorEnvelope('CONFLICT', 'A newer conversation request replaced this result.', traceId));
      if (currentSnapshot.catalogRevision !== session.catalogRevision) return stale(res, traceId, session, currentSnapshot);
      if (result.status !== 200 || 'error' in result.body) return res.status(result.status).json(errorEnvelope(('error' in result.body ? result.body.error : 'selection_unavailable').toUpperCase(), 'message' in result.body ? result.body.message : 'Library selection is temporarily unavailable.', traceId));
      const interpreted = result.body;
      if (interpreted.status !== 'clarification' && interpreted.result.selector !== null) session.selectionState = interpreted.refinementState;
      session.lastRequest = req.body.latestRequest;
      session.revision += 1;
      session.touchedAt = (options.nowMs ?? Date.now)();
      const responseView = view(session, currentSnapshot, interpreted.status, interpreted.message, interpreted.result.matchedPostIds, interpreted.usage);
      return res.status(200).json(successEnvelope(responseView, traceId));
    } catch (error) {
      if (requestController.signal.aborted) return res.status(499).json(errorEnvelope('REQUEST_CANCELLED', 'The selection request was cancelled.', traceId));
      if (error instanceof RealLibraryCatalogError) return snapshotError(res, traceId, error);
      return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'Library selection is temporarily unavailable.', traceId));
    } finally {
      req.off('aborted', abort);
      res.off('close', abort);
      if (session.activeController === requestController) session.activeController = null;
    }
  });
}
