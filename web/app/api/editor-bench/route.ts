import { handleBenchGet, handleBenchPost, MAX_BENCH_BODY_BYTES } from '../../../../src/editor-bench/handler.js';
import { createEditorBenchRuntime } from '../../../../src/editor-bench/runtime.js';
import { resolve } from 'node:path';

export const runtime = 'nodejs';
const env = () => process.env.NODE_ENV;
const repoRoot = () => process.cwd().replace(/[\\/]web[\\/]?$/, '');
export async function GET() {
  const live = await createEditorBenchRuntime({ repoRoot: resolve(repoRoot()), env: process.env });
  const result = handleBenchGet(env(), live.status);
  return Response.json(result.body, { status: result.status });
}
export async function POST(request: Request) {
  if (env() !== 'development') return Response.json({ error: 'not_found' }, { status: 404 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'same_origin_required' }, { status: 403 });
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
    const value = JSON.parse(new TextDecoder().decode(bytes));
    const live = await createEditorBenchRuntime({ repoRoot: resolve(repoRoot()), env: process.env });
    const result = await handleBenchPost(value, env(), { runtime: live.status, editorProvider: live.editorProvider, planningProvider: live.planningProvider, signal: request.signal });
    let body = result.body;
    if (result.status === 200 && value?.replay?.kind === 'free_text') {
      try {
        const refreshed = await createEditorBenchRuntime({ repoRoot: resolve(repoRoot()), env: process.env });
        if (body && typeof body === 'object' && !Array.isArray(body)) body = { ...(body as Record<string, unknown>), runtime: refreshed.status };
      } catch { /* Keep the pre-turn status if balance refresh is unavailable. */ }
    }
    return Response.json(body, { status: result.status });
  } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
}
