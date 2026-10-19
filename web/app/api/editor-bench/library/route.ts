import { MAX_BENCH_BODY_BYTES } from '../../../../../src/editor-bench/handler.js';
import { interpretRealLibraryManualRequest } from '../../../../../src/editor-bench/real-library-chat.js';
import type { LibraryScheduleSource } from '../../../../../src/distribution/library-schedule-source.js';
import { createEditorBenchRuntime } from '../../../../../src/editor-bench/runtime.js';
import { RELAY_API_BASE } from '../../../../lib/relay-api.js';

export const runtime = 'nodejs';
const API_TIMEOUT_MS = 15_000;
const MODEL_TIMEOUT_MS = 90_000;
const repoRoot = () => process.cwd().replace(/[\\/]web[\\/]?$/, '');

async function readBoundedJson(request: Request): Promise<unknown | Response> {
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'invalid_json' }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BENCH_BODY_BYTES) {
        await reader.cancel();
        return Response.json({ error: 'body_too_large' }, { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
}

function exactRequest(value: unknown): value is { latestRequest: string; postId: string; mediaIds: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 3 && ['latestRequest', 'postId', 'mediaIds'].every(key => Object.hasOwn(record, key)) &&
    typeof record.latestRequest === 'string' && !!record.latestRequest.trim() && record.latestRequest.length <= 4000 &&
    typeof record.postId === 'string' && !!record.postId.trim() && record.postId.length <= 200 && !record.postId.startsWith('bench_') &&
    Array.isArray(record.mediaIds) && record.mediaIds.length >= 1 && record.mediaIds.length <= 3 &&
    record.mediaIds.every(id => typeof id === 'string' && !!id.trim() && id.length <= 200 && !id.startsWith('bench_')) && new Set(record.mediaIds).size === record.mediaIds.length;
}

async function upstreamJson(path: string, cookie: string, method: 'GET' | 'POST', body?: unknown, signal?: AbortSignal): Promise<{ response: Response; json: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('api_timeout')), API_TIMEOUT_MS);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${RELAY_API_BASE}${path}`, {
      method, headers: { accept: 'application/json', cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', signal: controller.signal,
    });
    let json: unknown;
    try { json = await response.json(); } catch { json = null; }
    return { response, json };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function envelopeData(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return (value as Record<string, unknown>).data ?? null;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') return Response.json({ error: 'not_found' }, { status: 404 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'same_origin_required' }, { status: 403 });
  const parsed = await readBoundedJson(request);
  if (parsed instanceof Response) return parsed;
  if (!exactRequest(parsed)) return Response.json({ error: 'invalid_request' }, { status: 400 });
  const cookie = request.headers.get('cookie') ?? '';
  if (!cookie) return Response.json({ error: 'authentication_required' }, { status: 401 });
  try {
    const sourceRead = await upstreamJson(`/api/v1/editor-bench/schedule/library-post/${encodeURIComponent(parsed.postId)}`, cookie, 'GET', undefined, request.signal);
    if (!sourceRead.response.ok) return Response.json(sourceRead.json ?? { error: 'library_source_unavailable' }, { status: sourceRead.response.status });
    const rawSource = envelopeData(sourceRead.json) as LibraryScheduleSource | null;
    if (!rawSource || rawSource.postId !== parsed.postId || typeof rawSource.versionId !== 'string' || typeof rawSource.title !== 'string' || !Array.isArray(rawSource.media)) return Response.json({ error: 'invalid_library_source' }, { status: 502 });
    const byId = new Map(rawSource.media.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
    const selectedMedia = parsed.mediaIds.map(id => byId.get(id));
    if (selectedMedia.some(item => !item || item.processingStatus !== 'READY')) return Response.json({ error: 'selected_media_unavailable' }, { status: 400 });
    const source: LibraryScheduleSource = { postId: rawSource.postId, versionId: rawSource.versionId, title: rawSource.title, media: selectedMedia as NonNullable<(typeof selectedMedia)[number]>[] };

    const live = await createEditorBenchRuntime({ repoRoot: repoRoot(), env: process.env });
    if (!live.status.enabled || !live.editorProvider) return Response.json({ error: 'editor_bench_unavailable', runtime: live.status }, { status: 503 });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('model_timeout')), MODEL_TIMEOUT_MS);
    const abortFromRequest = () => controller.abort(request.signal.reason);
    request.signal.addEventListener('abort', abortFromRequest, { once: true });
    try {
      const interpreted = await interpretRealLibraryManualRequest(parsed.latestRequest, source, live.editorProvider, new Date(), controller.signal);
      if (interpreted.response.kind === 'clarification') {
        return Response.json({ kind: 'clarification', question: interpreted.response.question, ...(interpreted.usage ? { usage: { calls: interpreted.usage.calls ?? 1, known: true, inputTokens: interpreted.usage.inputTokens, outputTokens: interpreted.usage.outputTokens, costUsd: interpreted.usage.costUsd ?? null } } : {}) });
      }
      const reviewed = await upstreamJson('/api/v1/editor-bench/schedule/library/review', cookie, 'POST', {
        latestRequest: parsed.latestRequest,
        source: { postId: source.postId, versionId: source.versionId, mediaIds: parsed.mediaIds },
        intent: interpreted.response,
      }, request.signal);
      const data = envelopeData(reviewed.json);
      if (!reviewed.response.ok) return Response.json(reviewed.json ?? { error: 'schedule_review_unavailable' }, { status: reviewed.response.status });
      if (!data) return Response.json({ error: 'invalid_schedule_review' }, { status: 502 });
      return Response.json(data, { status: reviewed.response.status });
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', abortFromRequest);
    }
  } catch {
    if (request.signal.aborted) return Response.json({ error: 'request_cancelled' }, { status: 499 });
    return Response.json({ error: 'library_review_unavailable' }, { status: 503 });
  }
}
