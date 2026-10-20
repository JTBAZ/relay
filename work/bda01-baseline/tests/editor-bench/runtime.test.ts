import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileProviderBudget } from '../../src/gallery-editor/budget.js';
import { handleBenchGet, handleBenchPost } from '../../src/editor-bench/handler.js';
import { createEditorBenchRuntime } from '../../src/editor-bench/runtime.js';
import { BENCH_IDS, CURATION_EXAMPLES } from '../../src/editor-bench/fixtures.js';
import { POSTING_EXAMPLES } from '../../src/editor-bench/routing.js';

const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), 'relay-editor-bench-')); roots.push(path); return path; }
async function seedLedger(path: string, rows: unknown[] = []) { const ledger = join(path, '.relay-data', 'gallery-editor-budget.json'); await mkdir(join(path, '.relay-data'), { recursive: true }); await writeFile(ledger, JSON.stringify(rows)); return ledger; }
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

const enabledEnv = { NODE_ENV: 'development', RELAY_EDITOR_BENCH_LIVE: '1', OPENAI_API_KEY: 'test-only-key' } as NodeJS.ProcessEnv;
const request = { mode: 'mock_posting', selectedPostIds: [BENCH_IDS.posts[0]], selectedMediaIds: [BENCH_IDS.media[0]], replay: { kind: 'free_text', latestRequest: 'Prepare a Patreon draft titled Aurora' } };
function responseFetch(interpreted: unknown, onBody?: (body: any) => void): typeof globalThis.fetch {
  return vi.fn(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    onBody?.(body);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(interpreted) }] }], usage: { input_tokens: 100, output_tokens: 100, input_tokens_details: { cached_tokens: 0 } } });
  }) as unknown as typeof globalThis.fetch;
}

describe('editor bench live runtime', () => {
  it('fails closed when disabled, the ledger is absent or malformed, or the key is missing', async () => {
    const disabledRoot = await root(); await seedLedger(disabledRoot);
    const disabled = await createEditorBenchRuntime({ repoRoot: disabledRoot, env: { NODE_ENV: 'development' } as NodeJS.ProcessEnv });
    expect(disabled.status).toMatchObject({ enabled: false, model: null, reasoningEffort: null, reason: 'live_flag_off' });
    const missingRoot = await root();
    expect((await createEditorBenchRuntime({ repoRoot: missingRoot, env: enabledEnv })).status.reason).toBe('ledger_unavailable');
    expect(await readFile(join(missingRoot, '.relay-data', 'gallery-editor-budget.json'), 'utf8').catch(() => null)).toBeNull();
    const malformedRoot = await root(); await seedLedger(malformedRoot, [{ phase: 'development', reservedUsd: 'broken' }]);
    expect((await createEditorBenchRuntime({ repoRoot: malformedRoot, env: enabledEnv })).status.reason).toBe('ledger_unavailable');
    const noKeyRoot = await root(); await seedLedger(noKeyRoot);
    expect((await createEditorBenchRuntime({ repoRoot: noKeyRoot, env: { NODE_ENV: 'development', RELAY_EDITOR_BENCH_LIVE: '1' } as NodeJS.ProcessEnv })).status.reason).toBe('missing_api_key');
    const dotenvRoot = await root(); await seedLedger(dotenvRoot); await writeFile(join(dotenvRoot, '.env'), 'OPENAI_API_KEY=fixture-key\n');
    expect((await createEditorBenchRuntime({ repoRoot: dotenvRoot, env: { NODE_ENV: 'development', RELAY_EDITOR_BENCH_LIVE: '1' } as NodeJS.ProcessEnv })).status.enabled).toBe(true);
  });

  it('keeps GET and example/edited replays offline even when live runtime is enabled', async () => {
    const repoRoot = await root(); await seedLedger(repoRoot);
    const fetch = vi.fn();
    const runtime = await createEditorBenchRuntime({ repoRoot, env: enabledEnv, fetch });
    expect(handleBenchGet('development', runtime.status).body).toMatchObject({ runtime: { enabled: true, model: 'gpt-5.6-luna' } });
    const example = POSTING_EXAMPLES[0];
    const replay = await handleBenchPost({ mode: 'mock_posting', selectedPostIds: example.selectedPostIds, selectedMediaIds: example.selectedMediaIds, replay: { kind: 'example', exampleId: example.id } }, 'development', { runtime: runtime.status, planningProvider: runtime.planningProvider });
    expect((replay.body as any).provenance).toBe('example_replay');
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(join(repoRoot, '.relay-data', 'gallery-editor-budget.json'), 'utf8'))).toEqual([]);
  });

  it('dispatches free text through the exact priced runtime, compiles it, and settles the durable ledger', async () => {
    const repoRoot = await root(); const ledger = await seedLedger(repoRoot);
    const intent = POSTING_EXAMPLES[0].structuredIntent as any;
    const interpreted = { base_revision: null, outcome: 'proposal', question: null, requests: [intent.requests[0]] };
    let observed: any, planningPayload: any;
    const curationIntent = CURATION_EXAMPLES[0].structuredIntent;
    let call = 0;
    const fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      observed = body;
      const result = { selection: { mode: 'preserve', selector: null, requestQuote: null }, intent: ++call === 1 ? interpreted : curationIntent };
      if (call === 1) planningPayload = body;
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }], usage: { input_tokens: 100, output_tokens: 100, input_tokens_details: { cached_tokens: 0 } } });
    }) as unknown as typeof globalThis.fetch;
    const runtime = await createEditorBenchRuntime({ repoRoot, env: enabledEnv, fetch });
    const result = await handleBenchPost(request, 'development', { runtime: runtime.status, editorProvider: runtime.editorProvider, now: () => new Date('2026-10-17T12:34:56.000Z') });
    const body = result.body as any;
    expect(body.status).toBe('proposal');
    expect(body.provenance).toBe('model_interpretation');
    expect(body.result.steps).toContainEqual(expect.objectContaining({ capability: 'prepare_post_draft', title: 'Aurora', destination: 'patreon' }));
    expect(body.result.note).toContain('No draft');
    expect(body.result.requestClock).toMatchObject({ receivedAtUtc: '2026-10-17T12:34:56.000Z', localDate: '2026-10-17' });
    expect(JSON.stringify(planningPayload)).toContain('2026-10-17');
    expect(observed).toMatchObject({ model: 'gpt-5.6-luna', max_output_tokens: 3000, reasoning: { effort: 'none' } });
    const curation = CURATION_EXAMPLES[0];
    const curationResult = await handleBenchPost({ mode: 'curation', selectedPostIds: curation.selectedPostIds, selectedMediaIds: curation.selectedMediaIds, replay: { kind: 'free_text', latestRequest: curation.latestRequest } }, 'development', { editorProvider: runtime.editorProvider });
    expect((curationResult.body as any).status).toBe('proposal');
    expect((curationResult.body as any).message).toEqual(expect.any(String));
    expect((curationResult.body as any).result.actions).toContainEqual(expect.objectContaining({ kind: 'rename_post', postId: BENCH_IDS.posts[0], title: 'Aurora at dawn' }));
    expect(fetch).toHaveBeenCalledTimes(2);
    const rows = JSON.parse(await readFile(ledger, 'utf8'));
    expect(rows).toHaveLength(2);
    expect(rows.every((row: any) => row.phase === 'development' && row.model === 'gpt-5.6-luna' && row.settled && typeof row.actualUsd === 'number')).toBe(true);
    const refreshed = await createEditorBenchRuntime({ repoRoot, env: enabledEnv, fetch });
    expect(refreshed.status.remainingUsd).toBeLessThan(runtime.status.remainingUsd!);
  });

  it('holds an unknown provider charge and refuses to treat the failed call as free', async () => {
    const repoRoot = await root(); const ledger = await seedLedger(repoRoot);
    const fetch = vi.fn(async () => { throw new Error('private transport detail'); }) as unknown as typeof globalThis.fetch;
    const runtime = await createEditorBenchRuntime({ repoRoot, env: enabledEnv, fetch });
    const result = await handleBenchPost(request, 'development', { planningProvider: runtime.planningProvider });
    expect((result.body as any).status).toBe('rejected');
    expect((result.body as any).provenance).toBe('none');
    const rows = JSON.parse(await readFile(ledger, 'utf8'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ settled: true, actualUsd: null });
    const refreshed = await createEditorBenchRuntime({ repoRoot, env: enabledEnv, fetch });
    expect(refreshed.status.remainingUsd).toBeLessThan(runtime.status.remainingUsd!);
  });

  it('enforces shared development limits across concurrent durable reservations', async () => {
    const repoRoot = await root();
    const ledger = await seedLedger(repoRoot, [{ id: 'prior', model: 'gpt-5.6-luna', phase: 'development', reservedUsd: 14.97, actualUsd: 14.97, settled: true, createdAt: new Date().toISOString() }]);
    const budget = new FileProviderBudget(ledger);
    const reserve = () => budget.reserve({ model: 'gpt-5.6-luna', phase: 'development', amountUsd: 0.02, signal: new AbortController().signal });
    const outcomes = await Promise.allSettled([reserve(), reserve()]);
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(x => x.status === 'rejected')).toHaveLength(1);
    const rows = JSON.parse(await readFile(ledger, 'utf8'));
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum: number, row: any) => sum + (row.settled && row.actualUsd !== null ? row.actualUsd : row.reservedUsd), 0)).toBeCloseTo(14.99, 8);
  });
});
