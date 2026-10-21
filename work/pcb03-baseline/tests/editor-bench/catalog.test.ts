import { describe, expect, it } from 'vitest';
import type { EditorProvider } from '../../src/gallery-editor/provider.js';
import { handleBenchGet, handleBenchPost } from '../../src/editor-bench/handler.js';
import { BENCH_IDS } from '../../src/editor-bench/fixtures.js';

function provider(value: unknown, inspect?: (input: unknown) => void): EditorProvider {
  return { async respond(request) {
    inspect?.(request.input);
    return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { calls: 1, inputTokens: 100, outputTokens: 50, costUsd: 0.0002 } };
  } };
}
function predicate(field: string, value: string, requestQuote: string) { return { field, value, requestQuote }; }
function envelope(mode: string, selector: unknown, requestQuote: string, intent: unknown = null) { return { selection: { mode, selector, requestQuote }, intent }; }

describe('expanded editor bench fixture', () => {
  it('publishes the 16-card metadata catalogue with canonical multi-asset ownership', () => {
    const response = handleBenchGet('development').body as any;
    expect(response.cards).toHaveLength(16);
    expect(response.cards.slice(0, 3).map((card: any) => [card.postId, card.title])).toEqual([
      [BENCH_IDS.posts[0], 'Aurora study'], [BENCH_IDS.posts[1], 'Blue fragment'], [BENCH_IDS.posts[2], 'Tide pools'],
    ]);
    expect(response.cards).toEqual(expect.arrayContaining([expect.objectContaining({ workTitle: 'Clockwork Fox', stage: 'final', publishState: 'published', tags: expect.arrayContaining(['character', 'finished']) })]));
    expect(response.media).toHaveLength(20);
    expect(response.cards.map((card: any) => card.postId)).toContain(BENCH_IDS.posts[15]);
    const cityAssets = response.media.filter((media: any) => media.postId === BENCH_IDS.posts[15]);
    expect(cityAssets).toHaveLength(2);
    expect(cityAssets.map((media: any) => media.filename)).toContain('city-rain-loop.mp4');
    expect(cityAssets.find((media: any) => media.filename === 'city-rain-poster.jpg')).toMatchObject({ mimeType: 'image/jpeg', role: 'poster', orientation: 'portrait', processingStatus: 'processing' });
    expect(response.cards[0].collectionIds).toContain(BENCH_IDS.collections[0]);
    expect(response.cards[2].collectionIds).toContain(BENCH_IDS.collections[0]);
    expect(response.cards[1].collectionIds).not.toContain(BENCH_IDS.collections[0]);
    expect(BENCH_IDS.works).toHaveLength(6);
    expect(BENCH_IDS.series).toHaveLength(2);
    expect(BENCH_IDS.collections).toHaveLength(4);
  });

  it('uses tags and stage metadata for an AND selector with an explicit exclusion', async () => {
    const latest = 'Select finished character posts excluding teasers';
    let context: any;
    const targets = [BENCH_IDS.posts[7], BENCH_IDS.posts[12]];
    const selector = { base: 'catalog', all: [predicate('stage', 'final', 'finished'), predicate('tag', 'character', 'character')], any: [], none: [predicate('tag', 'teaser', 'teasers')] };
    const response = await handleBenchPost({ mode: 'curation', selectedPostIds: [], selectedMediaIds: [], replay: { kind: 'free_text', latestRequest: latest } }, 'development', {
      editorProvider: provider(envelope('replace', selector, latest), input => { context = JSON.parse((input as any[])[1].content[0].text).untrusted_fixture_catalog; }),
    });
    expect(response.body).toMatchObject({ status: 'selected', selection: { postIds: targets, changed: true }, message: expect.stringContaining('Ember Court poster') });
    expect((response.body as any).result).toMatchObject({ matchedPostIds: targets, selector: { all: [predicate('stage', 'final', 'finished'), predicate('tag', 'character', 'character')], none: [predicate('tag', 'teaser', 'teasers')] } });
    expect(context.posts.find((post: any) => post.id === BENCH_IDS.posts[7])).toMatchObject({ tags: expect.arrayContaining(['character', 'finished']), stage: 'final' });
    expect(context.posts.find((post: any) => post.id === BENCH_IDS.posts[9]).tags).toContain('teaser');
    expect(context.posts.find((post: any) => post.id === BENCH_IDS.posts[12]).media).toEqual(expect.arrayContaining([expect.objectContaining({ filename: 'Clockwork Fox crop.avif', mime: 'image/avif', orientation: 'square' })]));
  });

  it('compiles a batch family-to-collection edit and preserves the unrelated manual cart action', async () => {
    const latest = 'Add every Clockwork Fox post to Studio studies';
    const foxPosts = [BENCH_IDS.posts[10], BENCH_IDS.posts[11], BENCH_IDS.posts[12]];
    const intent = { revision: 7, outcome: 'proposal', question: null, unresolved: [], observations: [], operations: [{
      operation: 'membership', scope: 'collection', target: { source: 'ids', ids: [BENCH_IDS.collections[1]] }, excludeIds: [], unresolved: [], scopeBasis: 'explicit', requestQuote: latest, change: 'add', actionId: null, postIds: foxPosts, mode: 'add',
    }] };
    const selector = { base: 'catalog', all: [predicate('work_id', BENCH_IDS.works[3], 'Clockwork Fox')], any: [], none: [] };
    const response = await handleBenchPost({ mode: 'curation', selectedPostIds: [], selectedMediaIds: [], replay: { kind: 'free_text', latestRequest: latest } }, 'development', { editorProvider: provider(envelope('replace', selector, latest, intent)) });
    const body = response.body as any;
    expect(body.status).toBe('proposal');
    expect(body.selection.postIds).toEqual(foxPosts);
    expect(body.result.actions).toContainEqual(expect.objectContaining({ kind: 'collection_membership', collectionId: BENCH_IDS.collections[1], postIds: foxPosts, operation: 'add' }));
    expect(body.result.actions).toContainEqual(expect.objectContaining({ id: 'bench_manual_description', postId: BENCH_IDS.posts[2] }));
    expect(body.result.simulationOnly).toBe(true);
  });

  it('rejects an invalid second operation atomically and leaves the prior selection and manual cart intact', async () => {
    const latest = 'Tag the Tide line sketch as rough, then rename the outside post to Unknown';
    const sketch = BENCH_IDS.posts[5];
    const tagQuote = 'Tag the Tide line sketch as rough';
    const renameQuote = 'rename the outside post to Unknown';
    const intent = { revision: 7, outcome: 'proposal', question: null, unresolved: [], observations: [], operations: [
      { operation: 'tags', scope: 'post', target: { source: 'ids', ids: [sketch] }, excludeIds: [], unresolved: [], scopeBasis: 'explicit', requestQuote: tagQuote, change: 'add', actionId: null, add: ['rough'], remove: [], observationMediaIds: [] },
      { operation: 'rename', scope: 'post', target: { source: 'ids', ids: ['bench_post_outside'] }, excludeIds: [], unresolved: [], scopeBasis: 'explicit', requestQuote: renameQuote, change: 'add', actionId: null, value: 'Unknown' },
    ] };
    const original = BENCH_IDS.posts[2];
    const response = await handleBenchPost({ mode: 'curation', selectedPostIds: [original], selectedMediaIds: [BENCH_IDS.media[2]], replay: { kind: 'free_text', latestRequest: latest } }, 'development', {
      editorProvider: provider(envelope('replace', { base: 'catalog', all: [predicate('post_id', sketch, 'Tide line sketch')], any: [], none: [] }, 'Tide line sketch', intent)),
    });
    expect(response.body).toMatchObject({ status: 'clarification', beforeAfter: [], selection: { postIds: [original], mediaIds: [BENCH_IDS.media[2]], changed: false } });
    const body = response.body as any;
    expect(Object.keys(body.result).sort()).toEqual(['matchedPostIds', 'selector']);
    expect(body.result).toEqual({ selector: { base: 'catalog', all: [predicate('post_id', sketch, 'Tide line sketch')], any: [], none: [] }, matchedPostIds: [sketch] });
    expect(body.result).not.toHaveProperty('actions');
    expect(body.result).not.toHaveProperty('manualActions');
    expect((response.body as any).diagnostics.join(' ')).toContain('outside the resolved selector');
    const baseline = (handleBenchGet('development').body as any).manualActions;
    expect(baseline).toEqual([expect.objectContaining({ id: 'bench_manual_description', postId: BENCH_IDS.posts[2], description: 'Manual note kept as-is.' })]);
  });
});
