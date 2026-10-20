import express, { type NextFunction, type Request, type Response } from 'express';
import { errorEnvelope, successEnvelope } from '../contracts/api.js';
import { RelayAuthError } from '../identity/relay-auth-error.js';
import { RealLibraryCatalogError, type RealLibraryCatalog } from './library-selection-catalog.js';
import { handleGroundedRealLibrarySelection, validateGroundedRealLibrarySelectionRequest } from './real-library-selection.js';
import type { LargeRealLibrarySnapshot } from './library-selection-catalog.js';

type Principal = { creatorId: string; accountId: string };
export function registerRealLibrarySelectionCatalogRoute(app: express.Application, options: {
  development: boolean;
  authenticateCreator: (req: Request, options: { readonlySession: true }) => Promise<Principal | null>;
  loadCatalog: (accountId: string, creatorId: string) => Promise<RealLibraryCatalog>;
  traceId: (req: Request) => string;
}): void {
  app.get('/api/v1/editor-bench/library-selection/catalog', async (req, res) => {
    const traceId = options.traceId(req);
    res.setHeader('Cache-Control', 'private, no-store');
    if (!options.development) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Not found.', traceId));
    try {
      const principal = await options.authenticateCreator(req, { readonlySession: true });
      if (!principal?.creatorId || !principal.accountId) return res.status(401).json(errorEnvelope('AUTH_ERROR', 'Authentication required.', traceId));
      const catalog = await options.loadCatalog(principal.accountId, principal.creatorId);
      return res.status(200).json(successEnvelope(catalog, traceId));
    } catch (error) {
      if (error instanceof RelayAuthError) return res.status(error.status).json(error.toEnvelope(traceId));
      if (error instanceof RealLibraryCatalogError) return res.status(400).json(errorEnvelope(error.code, error.message, traceId));
      return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The complete Library catalog is temporarily unavailable.', traceId));
    }
  });
}

export const GROUNDED_LIBRARY_SELECTION_PATH = '/api/v1/editor-bench/library-selection/resolve-grounded';
/** Mount before the app-wide 100 KiB parser so this isolated connector can accept bounded state. */
export function mountGroundedLibrarySelectionBodyParser(app: express.Application): void {
  app.use(GROUNDED_LIBRARY_SELECTION_PATH, express.json({ limit: '256kb', strict: true }), (error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (!error) return next();
    const traceId = String(req.headers['x-trace-id'] ?? '');
    if ((error as { type?: string }).type === 'entity.too.large') return res.status(413).json(errorEnvelope('REQUEST_TOO_LARGE', 'The grounded Library selection request exceeds 256 KiB.', traceId));
    return res.status(400).json(errorEnvelope('INVALID_REQUEST', 'The grounded Library selection request must contain valid JSON.', traceId));
  });
}

export function registerGroundedLibrarySelectionRoute(app: express.Application, options: {
  development: boolean;
  authenticateCreator: (req: Request, options: { readonlySession: true }) => Promise<Principal | null>;
  loadSnapshot: (accountId: string, creatorId: string, signal?: AbortSignal) => Promise<LargeRealLibrarySnapshot>;
  traceId: (req: Request) => string;
  now?: () => Date;
}): void {
  app.post(GROUNDED_LIBRARY_SELECTION_PATH, async (req, res) => {
    const traceId = options.traceId(req);
    res.setHeader('Cache-Control', 'private, no-store');
    if (!options.development) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Not found.', traceId));
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once('aborted', abort);
    try {
      const principal = await options.authenticateCreator(req, { readonlySession: true });
      if (!principal?.creatorId || !principal.accountId) return res.status(401).json(errorEnvelope('AUTH_ERROR', 'Authentication required.', traceId));
      const invalid = validateGroundedRealLibrarySelectionRequest(req.body);
      if (invalid) return res.status(400).json(errorEnvelope('INVALID_REQUEST', invalid, traceId));
      const snapshot = await options.loadSnapshot(principal.accountId, principal.creatorId, controller.signal);
      if (controller.signal.aborted) return res.status(499).json(errorEnvelope('REQUEST_CANCELLED', 'The grounded selection request was cancelled.', traceId));
      const result = handleGroundedRealLibrarySelection(snapshot, req.body, options.now?.() ?? new Date());
      if (result.status !== 200) {
        const body = result.body as { error: string; message: string };
        return res.status(result.status).json(errorEnvelope(body.error.toUpperCase(), body.message, traceId));
      }
      return res.status(200).json(successEnvelope(result.body, traceId));
    } catch (error) {
      if (controller.signal.aborted) return res.status(499).json(errorEnvelope('REQUEST_CANCELLED', 'The grounded selection request was cancelled.', traceId));
      if (error instanceof RelayAuthError) return res.status(error.status).json(error.toEnvelope(traceId));
      if (error instanceof RealLibraryCatalogError) return res.status(error.code === 'catalog_incomplete' ? 503 : 413).json(errorEnvelope(error.code, error.message, traceId));
      return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The complete Library snapshot is temporarily unavailable.', traceId));
    } finally {
      req.off('aborted', abort);
    }
  });
}
