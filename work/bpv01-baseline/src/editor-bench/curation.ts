import { runCompiledIntent } from '../gallery-editor/compiled-intent.js';
import { IntentEvidence } from '../gallery-editor/intent-evidence.js';
import type { EditorProvider } from '../gallery-editor/provider.js';
import type { EditorError, EditAction } from '../gallery-editor/types.js';
import { compileIntent, type StructuredIntent } from '../gallery-editor/structured-intent.js';
import { buildChangeCart, effectivePostTitle, simulateEditorActions } from '../gallery-editor/state.js';
import { previewCopy } from '../gallery-editor/factual-copy.js';
import { BENCH_IDS, createBenchFixture, createBenchReadTools, createBenchSession, CURATION_EXAMPLES, type BenchFixture } from './fixtures.js';
import type { BenchRuntimeStatus } from './runtime.js';

export type BenchRequest = {
  mode: 'curation' | 'mock_posting';
  selectedPostIds: string[];
  selectedMediaIds: string[];
  refinementState?: BenchRefinementState | null;
} & (
  | { replay: { kind: 'example'; exampleId: string } }
  | { replay: { kind: 'edited'; latestRequest: string; structuredIntent: unknown } }
  | { replay: { kind: 'free_text'; latestRequest: string } }
);
export interface BenchRefinementState { v: 1; fixtureRevision: number; selectedPostIds: string[]; excludedPostIds: string[] }
export type BenchProvenance = 'example_replay' | 'edited_replay' | 'model_interpretation' | 'none';
export type BenchStatus = 'proposal' | 'clarification' | 'limitation' | 'unchanged' | 'selected' | 'rejected' | 'unavailable';
export interface BenchResponse {
  mode: BenchRequest['mode'];
  provenance: BenchProvenance;
  status: BenchStatus;
  interpreted: unknown | null;
  result: unknown | null;
  beforeAfter: Array<{ label: string; before: string | null; after: string | null }>;
  diagnostics: string[];
  message?: string;
  runtime?: BenchRuntimeStatus;
  selection?: { postIds: string[]; mediaIds: string[]; changed: boolean };
  refinementState?: BenchRefinementState | null;
  usage?: { calls: number; known: boolean; inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
}
export interface RunCurationOptions { provider?: EditorProvider; signal?: AbortSignal; fullFixtureEvidence?: boolean; fixture?: BenchFixture }

const fail = (request: BenchRequest['mode'], message: string): BenchResponse => ({ mode: request, provenance: 'none', status: 'rejected', interpreted: null, result: null, beforeAfter: [], diagnostics: [message] });
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const sortedEqual = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
function validRequest(value: unknown): value is BenchRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  const keys = Object.keys(r);
  if (!(['mode', 'selectedPostIds', 'selectedMediaIds', 'replay'].every(key => keys.includes(key)) && keys.every(key => ['mode', 'selectedPostIds', 'selectedMediaIds', 'replay', 'refinementState'].includes(key)))) return false;
  if (!['curation', 'mock_posting'].includes(String(r.mode)) || !Array.isArray(r.selectedPostIds) || !Array.isArray(r.selectedMediaIds) || r.selectedPostIds.length > 16 || r.selectedMediaIds.length > 32) return false;
  if ([...r.selectedPostIds, ...r.selectedMediaIds].some(id => typeof id !== 'string' || !id || id.length > 200)) return false;
  const replay = r.replay;
  if (!replay || typeof replay !== 'object' || Array.isArray(replay)) return false;
  const x = replay as Record<string, unknown>;
  if (x.kind === 'example') return exactKeys(x, ['kind', 'exampleId']) && typeof x.exampleId === 'string' && x.exampleId.length <= 100;
  if (x.kind === 'edited') return exactKeys(x, ['kind', 'latestRequest', 'structuredIntent']) && typeof x.latestRequest === 'string' && x.latestRequest.trim().length > 0 && x.latestRequest.length <= 20000;
  if (x.kind === 'free_text') return exactKeys(x, ['kind', 'latestRequest']) && typeof x.latestRequest === 'string' && x.latestRequest.trim().length > 0 && x.latestRequest.length <= 20000;
  if (x.kind === 'selection_reset') return exactKeys(x, ['kind']);
  return false;
}
function metadataEvidence(readTools: ReturnType<typeof createBenchReadTools>, session: ReturnType<typeof createBenchSession>, selectedPostIds: string[], selectedMediaIds: string[], targetCollectionIds: string[], fullFixtureEvidence = false, fixture?: BenchFixture) {
  const evidence = new IntentEvidence();
  const record = async (name: 'expandLibraryFamily' | 'resolveLibraryPosts' | 'readLibraryMedia' | 'readLibraryCollections', args: Record<string, unknown>) => {
    const result = await readTools(name, args, { signal: new AbortController().signal });
    evidence.record(name, args, result);
  };
  return (async () => {
    if (fullFixtureEvidence) {
      const evidenceFixture = fixture ?? createBenchFixture();
      await record('resolveLibraryPosts', { postIds: [...BENCH_IDS.posts] });
      for (const work of evidenceFixture.state.tables.works) await record('expandLibraryFamily', { kind: 'work', id: String(work.id), cursor: null, limit: 100 });
      for (const series of evidenceFixture.state.tables.series) await record('expandLibraryFamily', { kind: 'series', id: String(series.id), cursor: null, limit: 100 });
      await record('readLibraryCollections', { collectionId: null, cursor: null, limit: 100 });
      await record('readLibraryMedia', { mediaIds: [...BENCH_IDS.media] });
      return evidence;
    }
    if (selectedPostIds.length === 1) await record('expandLibraryFamily', { kind: 'post', id: selectedPostIds[0], cursor: null, limit: 100 });
    else if (selectedPostIds.length) await record('resolveLibraryPosts', { postIds: selectedPostIds });
    if (selectedMediaIds.length) await record('readLibraryMedia', { mediaIds: selectedMediaIds });
    for (const collectionId of targetCollectionIds) await record('readLibraryCollections', { collectionId, cursor: null, limit: 100 });
    return evidence;
  })();
}
function readBeforeAfter(cart: ReturnType<typeof buildChangeCart>) {
  return cart.items.map(item => ({
    label: `${item.targetType}: ${item.title}`,
    before: item.before === null ? null : JSON.stringify(item.before),
    after: item.after === null ? null : JSON.stringify(item.after),
  })).slice(0, 100);
}
function errorMessage(error: unknown): string {
  const err = error as Partial<EditorError>;
  const code = typeof err.code === 'string' ? err.code : 'curation_error';
  const message = error instanceof Error ? error.message : 'The curation request could not be compiled.';
  return `${code}: ${message}`.slice(0, 500);
}

/** Runs the real metadata-only compiler and pure state/cart preview on owned fixtures. */
export async function runCurationBench(value: unknown, options: RunCurationOptions = {}): Promise<BenchResponse> {
  if (!validRequest(value)) return fail('curation', 'invalid_request: Request shape or selection bound is invalid.');
  const request = value;
  if (request.mode !== 'curation') return { mode: request.mode, provenance: 'none', status: 'unavailable', interpreted: null, result: null, beforeAfter: [], diagnostics: ['mock_posting_pending: Mock-posting compilation is handled by a separate bench core.'] };
  if (new Set(request.selectedPostIds).size !== request.selectedPostIds.length || new Set(request.selectedMediaIds).size !== request.selectedMediaIds.length) return fail(request.mode, 'invalid_selection: Select distinct fixture IDs.');
  if (request.selectedPostIds.some(id => !(BENCH_IDS.posts as readonly string[]).includes(id)) || request.selectedMediaIds.some(id => !(BENCH_IDS.media as readonly string[]).includes(id))) return fail(request.mode, 'foreign_selection: Selection must use owned synthetic fixture IDs.');

  const fixture = options.fixture ?? createBenchFixture();
  const replay = request.replay;
  let latestRequest: string;
  let structuredIntent: unknown;
  let provenance: BenchProvenance;
  if (replay.kind === 'example') {
    const example = CURATION_EXAMPLES.find(item => item.id === replay.exampleId);
    if (!example) return fail(request.mode, 'unknown_example: Choose a known curation example.');
    if (!sortedEqual(request.selectedPostIds, example.selectedPostIds) || !sortedEqual(request.selectedMediaIds, example.selectedMediaIds)) return fail(request.mode, 'example_selection_mismatch: Load the example with its paired fixture selection.');
    latestRequest = example.latestRequest;
    structuredIntent = structuredClone(example.structuredIntent);
    provenance = 'example_replay';
  } else if (replay.kind === 'edited') {
    latestRequest = replay.latestRequest;
    structuredIntent = replay.structuredIntent;
    provenance = 'edited_replay';
    let intentBytes = 0;
    try { intentBytes = Buffer.byteLength(JSON.stringify(structuredIntent) ?? ''); } catch { return fail(request.mode, 'invalid_intent: Structured intent must be JSON data.'); }
    if (intentBytes > 100_000) return fail(request.mode, 'intent_limit: Structured intent must be at most 100,000 UTF-8 bytes.');
  } else {
    if (!options.provider) return { mode: request.mode, provenance: 'none', status: 'unavailable', interpreted: null, result: null, beforeAfter: [], diagnostics: ['model_interpretation_unavailable: Free text is not interpreted in offline replay mode. Edit a strict structured intent or load an example.'], message: 'Model interpretation is unavailable. Edit structured intent or load a paired example.' };
    latestRequest = replay.latestRequest;
    provenance = 'model_interpretation';
  }

  const session = createBenchSession(fixture, request.selectedPostIds, request.selectedMediaIds);
  const reads = createBenchReadTools(fixture);
  try {
    let actions: EditAction[];
    let disposition: 'proposal' | 'clarification' | 'limitation' | 'no_change';
    let interpreted: unknown;
    let message: string | undefined;
    if (provenance === 'model_interpretation') {
      const intentResult = await runCompiledIntent(session, latestRequest, options.provider!, reads, { timeoutMs: 90000, signal: options.signal });
      actions = intentResult.actions;
      disposition = intentResult.disposition ?? 'no_change';
      message = intentResult.message;
      interpreted = { disposition, actions, usage: intentResult.usage, routing: intentResult.routing, uninspectedMediaCount: intentResult.uninspectedMediaCount };
    } else {
      const intentObject = structuredIntent && typeof structuredIntent === 'object' ? structuredIntent as Record<string, unknown> : {};
      const operations = Array.isArray(intentObject.operations) ? intentObject.operations as Array<Record<string, unknown>> : [];
      const targetCollectionIds = operations.filter(op => op.scope === 'collection' && op.target && typeof op.target === 'object')
        .flatMap(op => { const target = op.target as Record<string, unknown>; return target.source === 'ids' && Array.isArray(target.ids) ? target.ids.filter((id): id is string => typeof id === 'string' && (BENCH_IDS.collections as readonly string[]).includes(id)) : []; });
      const evidence = await metadataEvidence(reads, session, request.selectedPostIds, request.selectedMediaIds, [...new Set(targetCollectionIds)], options.fullFixtureEvidence, fixture);
      const compiled = compileIntent(structuredIntent, session, latestRequest, evidence, { metadataOnly: true });
      actions = compiled.actions;
      disposition = compiled.disposition;
      if (typeof intentObject.question === 'string' && intentObject.question) message = intentObject.question;
      else message = compiled.message;
      interpreted = structuredIntent as StructuredIntent;
    }
    if (disposition === 'clarification' || disposition === 'limitation') return {
      mode: request.mode, provenance, status: disposition, interpreted,
      result: { simulationOnly: true, preservedManualActionCount: fixture.manualActions.length }, beforeAfter: [],
      diagnostics: [disposition, 'The existing manual fixture edit is preserved; no executable proposal was returned.'],
      ...(message ? { message } : {}),
    };
    const after = simulateEditorActions(fixture.state, fixture.creatorId, actions);
    const cart = buildChangeCart(fixture.state, after, actions, fixture.revision);
    return {
      mode: request.mode, provenance,
      status: disposition === 'no_change' ? 'unchanged' : 'proposal',
      interpreted,
      result: { actions, cart, factualPreview: previewCopy(cart), simulationOnly: true },
      beforeAfter: readBeforeAfter(cart),
      diagnostics: disposition === 'proposal' ? ['simulation_only: Nothing has been applied.'] : ['unchanged', 'simulation_only: The fixture cart is unchanged.'],
      ...(message ? { message } : {}),
    };
  } catch (error) {
    const safe = errorMessage(error);
    return { mode: request.mode, provenance: provenance === 'model_interpretation' ? 'none' : provenance, status: 'rejected', interpreted: provenance === 'edited_replay' ? structuredIntent : null, result: null, beforeAfter: [], diagnostics: [safe], message: safe };
  }
}

/** Tiny helper for consumers displaying a fixture title from the same owned state authority. */
export function fixturePostTitle(postId: string): string | null {
  if (!(BENCH_IDS.posts as readonly string[]).includes(postId)) return null;
  return effectivePostTitle(createBenchFixture().state, postId);
}
