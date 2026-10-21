import { BENCH_IDS, CURATION_EXAMPLES, createBenchFixture, createBenchMediaDescriptors, createBenchPostCards } from './fixtures.js';
import { runCurationBench, type BenchRequest, type BenchResponse } from './curation.js';
import { POSTING_EXAMPLES, runPostingBench } from './routing.js';
import { runEditorBenchChat } from './chat.js';
import type { EditorProvider } from '../gallery-editor/provider.js';
import type { PlanningProvider } from '../conversational-planning/intent.js';
import type { BenchRuntimeStatus } from './runtime.js';

export const MAX_BENCH_BODY_BYTES = 128 * 1024;
export type BenchHandlerResponse = { status: number; body: unknown };

export function handleBenchGet(env: string | undefined, runtime?: BenchRuntimeStatus): BenchHandlerResponse {
  if (env !== 'development') return { status: 404, body: { error: 'not_found' } };
  const fixture = createBenchFixture();
  return { status: 200, body: { fixtureRevision: fixture.revision, cards: createBenchPostCards(fixture), manualActions: fixture.manualActions, media: createBenchMediaDescriptors(fixture), examples: [...CURATION_EXAMPLES, ...POSTING_EXAMPLES], ...(runtime ? { runtime } : {}) } };
}

export type BenchPostOptions = { runtime?: BenchRuntimeStatus; editorProvider?: EditorProvider | null; planningProvider?: PlanningProvider | null; signal?: AbortSignal; now?: () => Date };
function validRefinementState(value: unknown, selectedPostIds: string[]): boolean {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 4 || !['v','fixtureRevision','selectedPostIds','excludedPostIds'].every(key => Object.hasOwn(row, key))) return false;
  const fixture = createBenchFixture();
  if (row.v !== 1 || row.fixtureRevision !== fixture.revision || !Array.isArray(row.selectedPostIds) || !Array.isArray(row.excludedPostIds)) return false;
  const selected = row.selectedPostIds as unknown[];
  const excluded = row.excludedPostIds as unknown[];
  const order = (ids: unknown[]) => BENCH_IDS.posts.filter(id => ids.includes(id));
  const isCanonical = (ids: unknown[]) => ids.length <= BENCH_IDS.posts.length && ids.every(id => typeof id === 'string' && (BENCH_IDS.posts as readonly string[]).includes(id)) && new Set(ids).size === ids.length && JSON.stringify(ids) === JSON.stringify(order(ids));
  return isCanonical(selected) && isCanonical(excluded) && !selected.some(id => excluded.includes(id)) && JSON.stringify(selected) === JSON.stringify(order(selectedPostIds));
}
export async function handleBenchPost(value: unknown, env: string | undefined, options: BenchPostOptions = {}): Promise<BenchHandlerResponse> {
  if (env !== 'development') return { status: 404, body: { error: 'not_found' } };
  let bytes = Infinity;
  try { bytes = Buffer.byteLength(JSON.stringify(value) ?? ''); } catch { /* rejected below */ }
  if (bytes > MAX_BENCH_BODY_BYTES) return { status: 413, body: { error: 'body_too_large' } };
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['mode','selectedPostIds','selectedMediaIds','replay','refinementState'].includes(k)) || !['mode','selectedPostIds','selectedMediaIds','replay'].every(k => Object.hasOwn(value, k))) {
    return { status: 400, body: { error: 'invalid_request' } };
  }
  const request = value as BenchRequest;
  if (!['curation', 'mock_posting'].includes(String(request.mode)) || !Array.isArray(request.selectedPostIds) || request.selectedPostIds.length > 16 || request.selectedPostIds.some(id => typeof id !== 'string' || !id || id.length > 200) || !Array.isArray(request.selectedMediaIds) || request.selectedMediaIds.length > 32 || request.selectedMediaIds.some(id => typeof id !== 'string' || !id || id.length > 200)) return { status: 400, body: { error: 'invalid_request' } };
  if (!request.replay || typeof request.replay !== 'object' || Array.isArray(request.replay)) return { status: 400, body: { error: 'invalid_request' } };
  if ((request.replay as { kind?: string }).kind === 'selection_reset') {
    const replay = request.replay as unknown as Record<string, unknown>;
    if (request.mode !== 'curation' || Object.keys(replay).length !== 1 || !Object.hasOwn(replay, 'kind') || Object.hasOwn(value, 'refinementState')) return { status: 400, body: { error: 'invalid_request' } };
    const fixture = createBenchFixture();
    return { status: 200, body: { mode: 'curation', provenance: 'none', status: 'selected', interpreted: null, result: { reset: true }, beforeAfter: [], diagnostics: ['selection_reset: Selection and exclusions were cleared.'], selection: { postIds: [], mediaIds: [], changed: request.selectedPostIds.length > 0 || request.selectedMediaIds.length > 0 }, refinementState: { v: 1, fixtureRevision: fixture.revision, selectedPostIds: [], excludedPostIds: [] }, message: 'Selection cleared. Start a new selection request when ready.', ...(options.runtime ? { runtime: options.runtime } : {}) } };
  }
  const hasRefinementState = Object.hasOwn(value, 'refinementState');
  if (hasRefinementState && (request.mode !== 'curation' || request.replay.kind !== 'free_text' || !validRefinementState(request.refinementState, request.selectedPostIds))) return { status: 400, body: { error: 'invalid_refinement_state', message: 'Selection state is stale or inconsistent. Start over before continuing.' } };
  const replayKeys = Object.keys(request.replay);
  const allowedReplayKeys = request.replay.kind === 'example' ? ['kind', 'exampleId']
    : request.replay.kind === 'edited' ? ['kind', 'latestRequest', 'structuredIntent']
      : request.replay.kind === 'free_text' ? ['kind', 'latestRequest'] : [];
  if (!allowedReplayKeys.length || replayKeys.length !== allowedReplayKeys.length || replayKeys.some(key => !allowedReplayKeys.includes(key))) {
    return { status: 400, body: { error: 'invalid_request' } };
  }
  if (request.replay.kind === 'free_text' && (typeof request.replay.latestRequest !== 'string' || !request.replay.latestRequest.trim() || request.replay.latestRequest.length > (request.mode === 'curation' ? 20000 : 4000))) return { status: 400, body: { error: 'invalid_request' } };
  if (request.replay.kind === 'edited' && (typeof request.replay.latestRequest !== 'string' || !request.replay.latestRequest.trim() || request.replay.latestRequest.length > (request.mode === 'curation' ? 20000 : 4000))) return { status: 400, body: { error: 'invalid_request' } };
  if (hasRefinementState && request.mode === 'curation' && request.replay.kind === 'free_text' && /^\s*(?:start over|reset selection)\b/i.test(request.replay.latestRequest)) return { status: 200, body: { mode: 'curation', provenance: 'none', status: 'clarification', interpreted: null, result: null, beforeAfter: [], diagnostics: ['selection_reset_conflict'], selection: { postIds: [...request.selectedPostIds], mediaIds: [...request.selectedMediaIds], changed: false }, refinementState: request.refinementState ?? null, message: 'Use Start over, then make a new selection request.' } };
  let result: BenchResponse;
  if ((request.replay as { kind?: string }).kind === 'free_text' && options.editorProvider) {
    result = await runEditorBenchChat(request as Extract<BenchRequest, { replay: { kind: 'free_text'; latestRequest: string } }>, options.editorProvider, { signal: options.signal, now: options.now });
  } else if (request.mode === 'curation') result = await runCurationBench(request, { provider: options.editorProvider ?? undefined, signal: options.signal });
  else if (request.mode === 'mock_posting') result = await runPostingBench(request, { provider: options.planningProvider ?? undefined, signal: options.signal, now: options.now });
  else return { status: 400, body: { error: 'invalid_request' } };
  return { status: 200, body: { ...result, ...(options.runtime ? { runtime: options.runtime } : {}) } };
}
