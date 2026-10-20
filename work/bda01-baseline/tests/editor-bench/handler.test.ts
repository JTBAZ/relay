import { describe, expect, it } from 'vitest';
import { handleBenchGet, handleBenchPost } from '../../src/editor-bench/handler.js';
import { BENCH_IDS, CURATION_EXAMPLES } from '../../src/editor-bench/fixtures.js';

describe('editor bench local handler', () => {
  it('hides the catalog and replay endpoint in production', async () => {
    expect(handleBenchGet('production').status).toBe(404);
    expect((await handleBenchPost({}, 'production')).status).toBe(404);
  });

  it('rejects oversized and authority-bearing requests before dispatch', async () => {
    expect((await handleBenchPost({ mode:'curation', selectedPostIds:[], selectedMediaIds:[], replay:{kind:'free_text',latestRequest:'x'.repeat(140_000)} }, 'development')).status).toBe(413);
    expect((await handleBenchPost({ mode:'curation', selectedPostIds:[], selectedMediaIds:[], replay:{kind:'free_text',latestRequest:'rename'}, provenance:'example_replay' }, 'development')).status).toBe(400);
    expect((await handleBenchPost({ mode:'curation', selectedPostIds:[], selectedMediaIds:[], replay:{kind:'free_text',latestRequest:'rename',source:'production',provenance:'example_replay'} }, 'development')).status).toBe(400);
  });

  it('reports free-text interpretation unavailable and returns isolated baseline replays', async () => {
    const free = await handleBenchPost({ mode:'curation', selectedPostIds:[BENCH_IDS.posts[0]], selectedMediaIds:[], replay:{kind:'free_text',latestRequest:'Rename it'} }, 'development');
    expect((free.body as any).status).toBe('unavailable');
    const example = CURATION_EXAMPLES[0];
    const replay = { mode:'curation', selectedPostIds:example.selectedPostIds, selectedMediaIds:example.selectedMediaIds, replay:{kind:'example',exampleId:example.id} };
    const [first, second] = await Promise.all([handleBenchPost(replay,'development'),handleBenchPost(replay,'development')]);
    expect((first.body as any).status).toBe('proposal');
    expect((second.body as any).status).toBe('proposal');
    expect((first.body as any).beforeAfter).toEqual((second.body as any).beforeAfter);
    expect((first.body as any).result.cart.actions[0].id).toBe('bench_manual_description');
    expect((second.body as any).result.cart.actions[0].id).toBe('bench_manual_description');
  });
});
