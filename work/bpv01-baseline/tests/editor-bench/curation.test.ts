import { describe, expect, it } from 'vitest';
import { BENCH_IDS, CURATION_EXAMPLES } from '../../src/editor-bench/fixtures.js';
import { runCurationBench, type BenchRequest } from '../../src/editor-bench/curation.js';

const example = (id: string) => CURATION_EXAMPLES.find(item => item.id === id)!;
function edited(exampleId: string, mutate: (intent: Record<string, any>, request: BenchRequest) => void): BenchRequest {
  const source = example(exampleId);
  const request: BenchRequest = {
    mode: 'curation', selectedPostIds: [...source.selectedPostIds], selectedMediaIds: [...source.selectedMediaIds],
    replay: { kind: 'edited', latestRequest: source.latestRequest, structuredIntent: structuredClone(source.structuredIntent) },
  };
  mutate(request.replay.kind === 'edited' ? request.replay.structuredIntent as Record<string, any> : {}, request);
  return request;
}

describe('editor bench curation core', () => {
  it('compiles a grounded post rename using fixture evidence, not caption authority', async () => {
    const source = example('rename-aurora-post');
    const response = await runCurationBench({ mode: 'curation', selectedPostIds: source.selectedPostIds, selectedMediaIds: [], replay: { kind: 'example', exampleId: source.id } });
    expect(response.status).toBe('proposal');
    expect(response.provenance).toBe('example_replay');
    expect((response.result as any).actions).toContainEqual(expect.objectContaining({ kind: 'rename_post', postId: BENCH_IDS.posts[0], title: 'Aurora at dawn' }));
    expect((response.result as any).factualPreview).toContain('No Library changes have been applied');
  });

  it('adds collection membership and preserves a separate manual cart action', async () => {
    const source = example('add-to-field-notes');
    const response = await runCurationBench({ mode: 'curation', selectedPostIds: source.selectedPostIds, selectedMediaIds: [], replay: { kind: 'example', exampleId: source.id } });
    expect(response.status).toBe('proposal');
    const result = response.result as any;
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'collection_membership', collectionId: BENCH_IDS.collections[0], postIds: [BENCH_IDS.posts[1]], operation: 'add' }));
    expect(result.actions).toContainEqual(expect.objectContaining({ id: 'bench_manual_description', kind: 'set_description', postId: BENCH_IDS.posts[2], description: 'Manual note kept as-is.' }));
    expect(result.cart.actions).toHaveLength(2);
    const collection = result.cart.items.find((item: any) => item.targetId === BENCH_IDS.collections[0]);
    expect(collection.before.postIds).toEqual([BENCH_IDS.posts[0], BENCH_IDS.posts[2]]);
    expect(collection.after.postIds).toEqual([BENCH_IDS.posts[0], BENCH_IDS.posts[2], BENCH_IDS.posts[1]]);
  });

  it('preserves a custom post-title exception during a grounded whole-work rename', async () => {
    const request = edited('rename-aurora-post', (intent, wire) => {
      wire.replay = { kind: 'edited', latestRequest: 'Rename the whole work to Polar lights.', structuredIntent: intent };
      intent.operations[0] = { ...intent.operations[0], scope: 'work', target: { source: 'ids', ids: [BENCH_IDS.works[0]] }, requestQuote: 'Rename the whole work to Polar lights.', value: 'Polar lights' };
    });
    const response = await runCurationBench(request);
    expect(response.status).toBe('proposal');
    const result = response.result as any;
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'rename_work', workId: BENCH_IDS.works[0], title: 'Polar lights' }));
    const exception = result.cart.items.find((item: any) => item.targetId === BENCH_IDS.posts[1]);
    expect(exception.exception).toBe(true);
    expect(exception.before.title).toBe('Blue fragment');
    expect(exception.after.title).toBe('Blue fragment');
  });

  it('rejects a stale cart revision before compiling the edit', async () => {
    const request = edited('rename-aurora-post', intent => { intent.revision = 6; });
    const response = await runCurationBench(request);
    expect(response.status).toBe('rejected');
    expect(response.diagnostics.join(' ')).toContain('STALE_CART');
  });

  it('rejects foreign selections and invented target IDs', async () => {
    const foreign = await runCurationBench({ mode: 'curation', selectedPostIds: ['creator_other_post'], selectedMediaIds: [], replay: { kind: 'free_text', latestRequest: 'Rename it.' } });
    expect(foreign.status).toBe('rejected');
    expect(foreign.diagnostics.join(' ')).toContain('foreign_selection');
    const forgedSource = await runCurationBench({ mode: 'curation', selectedPostIds: [], selectedMediaIds: [], replay: { kind: 'free_text', latestRequest: 'Rename it.' }, provenance: 'example_replay' } as any);
    expect(forgedSource.status).toBe('rejected');
    expect(forgedSource.diagnostics.join(' ')).toContain('invalid_request');
    const request = edited('rename-aurora-post', intent => { intent.operations[0].target = { source: 'ids', ids: ['bench_post_invented'] }; });
    const invented = await runCurationBench(request);
    expect(invented.status).toBe('rejected');
    expect(invented.diagnostics.join(' ')).toContain('intent_contract');
  });

  it('returns a visible metadata-only limitation for visual claims', async () => {
    const request = edited('rename-aurora-post', (intent, wire) => {
      const latestRequest = 'Make it red based on the image.';
      wire.replay = { kind: 'edited', latestRequest, structuredIntent: intent };
      intent.outcome = 'proposal';
      intent.operations[0] = { operation: 'tags', scope: 'post', target: { source: 'selection', ids: [] }, excludeIds: [], unresolved: [], scopeBasis: 'explicit', requestQuote: latestRequest, change: 'add', actionId: null, add: ['red'], remove: [], observationMediaIds: [BENCH_IDS.media[0]] };
    });
    const response = await runCurationBench(request);
    expect(response.status).toBe('limitation');
    expect(response.result).toEqual({ simulationOnly: true, preservedManualActionCount: 1 });
    expect(response.beforeAfter).toEqual([]);
  });
});
