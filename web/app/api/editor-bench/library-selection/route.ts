import { MAX_BENCH_BODY_BYTES } from '../../../../../src/editor-bench/handler.js';
import { handleRealLibrarySelection } from '../../../../../src/editor-bench/real-library-selection.js';
import type { RealLibraryCatalog } from '../../../../../src/editor-bench/library-selection-catalog.js';
import { createEditorBenchRuntime } from '../../../../../src/editor-bench/runtime.js';
import { RELAY_API_BASE } from '../../../../lib/relay-api.js';

export const runtime = 'nodejs';
const API_TIMEOUT_MS = 15_000;
const repoRoot = () => process.cwd().replace(/[\\/]web[\\/]?$/, '');
const CATALOG_PATH = '/api/v1/editor-bench/library-selection/catalog';

async function readBoundedJson(request: Request): Promise<unknown | Response> {
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'invalid_json' }, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BENCH_BODY_BYTES) { await reader.cancel(); return Response.json({ error: 'body_too_large' }, { status: 413 }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
}

async function upstreamCatalog(cookie: string, signal?: AbortSignal): Promise<{ response: Response; json: unknown }> {
  if (signal?.aborted) throw new Error('request_cancelled');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('api_timeout')), API_TIMEOUT_MS);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${RELAY_API_BASE}${CATALOG_PATH}`, { method: 'GET', headers: { accept: 'application/json', cookie }, cache: 'no-store', signal: controller.signal });
    let json: unknown; try { json = await response.json(); } catch { json = null; }
    return { response, json };
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
function envelopeData(value: unknown): unknown {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).data ?? null : null;
}
function safeApiError(value: unknown): { error: string; message: string } {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const item = (value as Record<string, unknown>).error;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      return { error: typeof row.code === 'string' ? row.code.toLowerCase() : 'api_error', message: typeof row.message === 'string' ? row.message : 'Library selection is unavailable.' };
    }
    if (typeof item === 'string') return { error: item, message: typeof (value as Record<string, unknown>).message === 'string' ? (value as Record<string, unknown>).message as string : item };
  }
  return { error: 'library_selection_unavailable', message: 'Library selection is unavailable.' };
}
function noStore(response: Response): Response { response.headers.set('Cache-Control', 'private, no-store'); return response; }

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') return noStore(Response.json({ error: 'not_found' }, { status: 404 }));
  try {
    const read = await upstreamCatalog(request.headers.get('cookie') ?? '', request.signal);
    if (!read.response.ok) return noStore(Response.json(safeApiError(read.json), { status: read.response.status }));
    const catalog = envelopeData(read.json);
    if (!catalog || typeof catalog !== 'object' || (catalog as Record<string, unknown>).scope !== 'real_library') return noStore(Response.json({ error: 'invalid_library_catalog' }, { status: 502 }));
    return noStore(Response.json(catalog, { status: 200 }));
  } catch {
    return noStore(Response.json({ error: request.signal.aborted ? 'request_cancelled' : 'library_catalog_unavailable' }, { status: request.signal.aborted ? 499 : 503 }));
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') return noStore(Response.json({ error: 'not_found' }, { status: 404 }));
  if (request.headers.get('origin') !== new URL(request.url).origin) return noStore(Response.json({ error: 'same_origin_required' }, { status: 403 }));
  const parsed = await readBoundedJson(request);
  if (parsed instanceof Response) return noStore(parsed);
  try {
    const read = await upstreamCatalog(request.headers.get('cookie') ?? '', request.signal);
    if (!read.response.ok) return noStore(Response.json(safeApiError(read.json), { status: read.response.status }));
    const catalog = envelopeData(read.json) as RealLibraryCatalog | null;
    if (!catalog || catalog.scope !== 'real_library' || !Array.isArray(catalog.posts) || typeof catalog.catalogRevision !== 'string') return noStore(Response.json({ error: 'invalid_library_catalog' }, { status: 502 }));
    const result = await handleRealLibrarySelection(catalog, parsed, async () => {
      const live = await createEditorBenchRuntime({ repoRoot: repoRoot(), env: process.env });
      return live.status.enabled ? live.editorProvider ?? null : null;
    }, new Date(), request.signal);
    return noStore(Response.json(result.body, { status: result.status }));
  } catch {
    return noStore(Response.json({ error: request.signal.aborted ? 'request_cancelled' : 'library_selection_unavailable' }, { status: request.signal.aborted ? 499 : 503 }));
  }
}
