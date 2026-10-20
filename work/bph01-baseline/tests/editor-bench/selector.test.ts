import { describe, expect, it } from 'vitest';
import { resolveMetadataSelector, validateIntentTargets } from '../../src/editor-bench/selector.js';
import { BENCH_IDS, createBenchFixture, createBenchOwnedCatalog } from '../../src/editor-bench/fixtures.js';
import type { EditorProvider } from '../../src/gallery-editor/provider.js';
import { handleBenchPost } from '../../src/editor-bench/handler.js';
import { currentBenchRequestClock } from '../../src/editor-bench/routing.js';

const p = (field: string, value: string, requestQuote: string) => ({ field, value, requestQuote });
const date = (field: 'created_date'|'published_date', value: string, requestQuote: string, op: 'on'|'before'|'after'|'on_or_before'|'on_or_after'|'in_month') => ({ field, value, requestQuote, op });
const fixedClock = currentBenchRequestClock(new Date('2026-10-18T12:00:00.000Z'));
const resolve = (value: unknown, request: string, selectedPostIds: string[]) => resolveMetadataSelector(value, request, selectedPostIds, fixedClock);
const provider = (value: unknown): EditorProvider => ({ async respond() { return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { calls: 1, inputTokens: 10, outputTokens: 10, costUsd: 0.0001 } }; } });

describe('bounded metadata selector contract', () => {
  it('carries sticky exclusions across turns and removes only the full positive-minus-exception set', async () => {
    const excluded = resolve({ base: 'catalog', all: [p('tag', 'teaser', 'teaser')], any: [], none: [] }, 'Add teaser posts', []).ok
      ? (resolve({ base: 'catalog', all: [p('tag', 'teaser', 'teaser')], any: [], none: [] }, 'Add teaser posts', []) as any).matchedPostIds as string[] : [];
    const latest = 'Select finished character posts except teasers';
    const first = await handleBenchPost({ mode: 'curation', selectedPostIds: [], selectedMediaIds: [], refinementState: null, replay: { kind: 'free_text', latestRequest: latest } }, 'development', { editorProvider: provider({
      selection: { mode: 'replace', requestQuote: latest, selector: { base: 'catalog', all: [p('stage', 'finished', 'finished'), p('tag', 'character', 'character')], any: [], none: [p('tag', 'teaser', 'teasers')] } }, intent: null,
    }) });
    const firstBody = first.body as any;
    expect(firstBody.refinementState).toMatchObject({ v: 1, selectedPostIds: [BENCH_IDS.posts[7], BENCH_IDS.posts[12]], excludedPostIds: excluded });
    const addRequest = 'Add teaser posts';
    const second = await handleBenchPost({ mode: 'curation', selectedPostIds: firstBody.selection.postIds, selectedMediaIds: firstBody.selection.mediaIds, refinementState: firstBody.refinementState, replay: { kind: 'free_text', latestRequest: addRequest } }, 'development', { editorProvider: provider({
      selection: { mode: 'add', requestQuote: addRequest, selector: { base: 'catalog', all: [p('tag', 'teaser', 'teaser')], any: [], none: [] } }, intent: null,
    }) });
    const secondBody = second.body as any;
    expect(secondBody.selection.postIds).toEqual(firstBody.selection.postIds);
    expect(secondBody.refinementState.excludedPostIds).toEqual(excluded);
    expect(secondBody.result.refinement).toMatchObject({ operation: 'add', newlyMatchedPostIds: excluded });

    const unionRequest = 'Also add Clockwork Fox posts or pieces with blue descriptions';
    const unionSelector = { base: 'catalog', all: [], any: [p('work_id', BENCH_IDS.works[3], 'Clockwork Fox'), p('description', 'blue', 'blue')], none: [] };
    const unionTargets = resolve(unionSelector, unionRequest, []);
    expect(unionTargets.ok).toBe(true);
    const union = await handleBenchPost({ mode: 'curation', selectedPostIds: secondBody.selection.postIds, selectedMediaIds: secondBody.selection.mediaIds, refinementState: secondBody.refinementState, replay: { kind: 'free_text', latestRequest: unionRequest } }, 'development', { editorProvider: provider({ selection: { mode: 'add', requestQuote: unionRequest, selector: unionSelector }, intent: null }) });
    const unionBody = union.body as any;
    const expectedUnion = BENCH_IDS.posts.filter(id => (secondBody.selection.postIds.includes(id) || (unionTargets as any).matchedPostIds.includes(id)) && !excluded.includes(id));
    expect(unionBody.selection.postIds).toEqual(expectedUnion);
    const repeated = await handleBenchPost({ mode: 'curation', selectedPostIds: unionBody.selection.postIds, selectedMediaIds: unionBody.selection.mediaIds, refinementState: unionBody.refinementState, replay: { kind: 'free_text', latestRequest: unionRequest } }, 'development', { editorProvider: provider({ selection: { mode: 'add', requestQuote: unionRequest, selector: unionSelector }, intent: null }) });
    expect((repeated.body as any).selection.postIds).toEqual(expectedUnion);
    expect((repeated.body as any).refinementState).toEqual(unionBody.refinementState);

    const all = [...BENCH_IDS.posts];
    const removeRequest = 'Remove finished posts except character posts';
    const removeSelector = { base: 'catalog', all: [p('stage', 'finished', 'finished')], any: [], none: [p('tag', 'character', 'character')] };
    const expectedRemoved = resolve(removeSelector, removeRequest, all);
    expect(expectedRemoved.ok).toBe(true);
    const removed = await handleBenchPost({ mode: 'curation', selectedPostIds: all, selectedMediaIds: [], refinementState: { v: 1, fixtureRevision: createBenchFixture().revision, selectedPostIds: all, excludedPostIds: [] }, replay: { kind: 'free_text', latestRequest: removeRequest } }, 'development', { editorProvider: provider({ selection: { mode: 'remove', requestQuote: removeRequest, selector: removeSelector }, intent: null }) });
    const removedBody = removed.body as any;
    expect(removedBody.refinementState.excludedPostIds).toEqual((expectedRemoved as any).matchedPostIds);
    expect(removedBody.selection.postIds).toEqual(all.filter(id => !(expectedRemoved as any).matchedPostIds.includes(id)));
    expect(removedBody.selection.postIds).toEqual(expect.arrayContaining([BENCH_IDS.posts[7], BENCH_IDS.posts[12]]));
  });

  it('rejects stale refinement snapshots before a provider call and supports a no-model reset', async () => {
    let calls = 0;
    const model = { async respond() { calls++; return { output: [], usage: { calls: 1, inputTokens: 1, outputTokens: 1, costUsd: 0 } }; } } as EditorProvider;
    const state = { v: 1, fixtureRevision: createBenchFixture().revision, selectedPostIds: [BENCH_IDS.posts[0]], excludedPostIds: [] };
    const stale = await handleBenchPost({ mode: 'curation', selectedPostIds: [BENCH_IDS.posts[1]], selectedMediaIds: [], refinementState: state, replay: { kind: 'free_text', latestRequest: 'Add character posts' } }, 'development', { editorProvider: model });
    expect(stale.status).toBe(400);
    expect(calls).toBe(0);
    for (const badState of [
      { ...state, selectedPostIds: [BENCH_IDS.posts[0], BENCH_IDS.posts[0]] },
      { ...state, selectedPostIds: ['foreign_post'] },
      { ...state, fixtureRevision: state.fixtureRevision + 1 },
      { ...state, excludedPostIds: [BENCH_IDS.posts[0]] },
    ]) {
      const invalid = await handleBenchPost({ mode: 'curation', selectedPostIds: badState.selectedPostIds, selectedMediaIds: [], refinementState: badState, replay: { kind: 'free_text', latestRequest: 'Add character posts' } }, 'development', { editorProvider: model });
      expect(invalid.status).toBe(400);
    }
    const reset = await handleBenchPost({ mode: 'curation', selectedPostIds: [BENCH_IDS.posts[0]], selectedMediaIds: [BENCH_IDS.media[0]], replay: { kind: 'selection_reset' } }, 'development', { editorProvider: model });
    expect(reset.body).toMatchObject({ status: 'selected', selection: { postIds: [], mediaIds: [], changed: true }, refinementState: { v: 1, selectedPostIds: [], excludedPostIds: [] } });
    const compound = await handleBenchPost({ mode: 'curation', selectedPostIds: state.selectedPostIds, selectedMediaIds: [], refinementState: state, replay: { kind: 'free_text', latestRequest: 'Start over and also add Tide Pools' } }, 'development', { editorProvider: model });
    expect(compound.body).toMatchObject({ status: 'clarification', selection: { postIds: state.selectedPostIds, changed: false }, refinementState: state, message: 'Use Start over, then make a new selection request.' });
    expect(calls).toBe(0);
  });

  it('commits a known empty narrow and refuses catalog replacement after refinement', async () => {
    const selected = [BENCH_IDS.posts[7], BENCH_IDS.posts[12]];
    const state = { v: 1, fixtureRevision: createBenchFixture().revision, selectedPostIds: selected, excludedPostIds: [] };
    const latest = 'Keep selected descriptions containing unicorn';
    const empty = await handleBenchPost({ mode: 'curation', selectedPostIds: selected, selectedMediaIds: [], refinementState: state, replay: { kind: 'free_text', latestRequest: latest } }, 'development', { editorProvider: provider({ selection: { mode: 'replace', requestQuote: latest, selector: { base: 'selection', all: [p('description', 'unicorn', 'unicorn')], any: [], none: [] } }, intent: null }) });
    expect(empty.body).toMatchObject({ status: 'selected', selection: { postIds: [], mediaIds: [], changed: true }, refinementState: { selectedPostIds: [], excludedPostIds: [] } });

    const allRequest = 'Replace with all finished posts';
    const blocked = await handleBenchPost({ mode: 'curation', selectedPostIds: selected, selectedMediaIds: [], refinementState: state, replay: { kind: 'free_text', latestRequest: allRequest } }, 'development', { editorProvider: provider({ selection: { mode: 'replace', requestQuote: allRequest, selector: { base: 'catalog', all: [p('stage', 'finished', 'finished')], any: [], none: [] } }, intent: null }) });
    expect(blocked.body).toMatchObject({ status: 'clarification', selection: { postIds: selected, changed: false }, diagnostics: ['refinement_unsupported', expect.any(String)] });
    const excludeOnlyRequest = 'Exclude concept posts';
    const excludeOnly = await handleBenchPost({ mode: 'curation', selectedPostIds: selected, selectedMediaIds: [], refinementState: state, replay: { kind: 'free_text', latestRequest: excludeOnlyRequest } }, 'development', { editorProvider: provider({ selection: { mode: 'add', requestQuote: excludeOnlyRequest, selector: { base: 'catalog', all: [], any: [], none: [p('stage', 'concept', 'concept')] } }, intent: null }) });
    expect(excludeOnly.body).toMatchObject({ status: 'clarification', selection: { postIds: selected, changed: false }, diagnostics: ['refinement_unsupported', expect.any(String)] });
  });

  it('intersects every positive criterion and excludes the non-character finished decoy', () => {
    const request = 'Select finished character posts excluding teasers';
    const resolved = resolve({
      base: 'catalog', all: [p('stage', 'finished', 'finished'), p('tag', 'character', 'character')], any: [], none: [p('tag', 'teaser', 'teasers')],
    }, request, []);
    expect(resolved).toEqual({ ok: true, matchedPostIds: [BENCH_IDS.posts[7], BENCH_IDS.posts[12]] });
  });

  it('uses one OR block and subtracts excluded matches across owned media and post metadata', () => {
    const request = 'Select videos or character posts, excluding teasers';
    const resolved = resolve({
      base: 'catalog', all: [], any: [p('media_type', 'video', 'videos'), p('tag', 'character', 'character')], none: [p('tag', 'teaser', 'teasers')],
    }, request, []);
    expect(resolved).toEqual({ ok: true, matchedPostIds: [
      BENCH_IDS.posts[4], BENCH_IDS.posts[7], BENCH_IDS.posts[8], BENCH_IDS.posts[10], BENCH_IDS.posts[11], BENCH_IDS.posts[12], BENCH_IDS.posts[15],
    ] });
  });

  it('distinguishes unknown metadata, ungrounded or blank criteria, and a known zero-match intersection', () => {
    const naturalQuery = 'Select published coastal posts except sketches';
    expect(resolve({ base: 'catalog', all: [p('publish_state', 'published', 'published'), p('tag', 'coast', 'coastal')], any: [], none: [p('stage', 'sketch', 'sketches')] }, naturalQuery, [])).toEqual({ ok: true, matchedPostIds: [BENCH_IDS.posts[2]] });
    expect(resolve({ base: 'catalog', all: [p('tag', 'unicorn', 'unicorn')], any: [], none: [] }, 'Find unicorn', [])).toMatchObject({ ok: false, reason: 'unknown' });
    expect(resolve({ base: 'catalog', all: [p('tag', 'character', 'character')], any: [], none: [] }, 'Find character', [])).toMatchObject({ ok: true, matchedPostIds: expect.any(Array) });
    expect(resolve({ base: 'catalog', all: [p('stage', 'final', 'final'), p('tag', 'character', 'character'), p('media_role', 'teaser', 'teaser')], any: [], none: [] }, 'Select final character teaser files', [])).toEqual({ ok: true, matchedPostIds: [] });
    expect(resolve({ base: 'catalog', all: [p('tag', 'character', 'human')], any: [], none: [] }, 'Select character posts', [])).toMatchObject({ ok: false, reason: 'invalid', message: expect.stringContaining('tag criterion quote is ungrounded') });
    expect(resolve({ base: 'catalog', all: [p('tag', '   ', 'character')], any: [], none: [] }, 'Select character posts', [])).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('resolves selection-base filters and allows empty base only with no predicates', () => {
    expect(resolve({ base: 'selection', all: [p('stage', 'finished', 'finished')], any: [], none: [] }, 'Keep finished items from selection', [BENCH_IDS.posts[0], BENCH_IDS.posts[2]])).toEqual({ ok: true, matchedPostIds: [BENCH_IDS.posts[2]] });
    expect(resolve({ base: 'empty', all: [], any: [], none: [] }, 'Clear selection', [BENCH_IDS.posts[0]])).toEqual({ ok: true, matchedPostIds: [] });
    expect(resolve({ base: 'empty', all: [p('tag', 'character', 'character')], any: [], none: [] }, 'Clear character selection', [])).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('blocks edits outside the resolved subset and staged-cart edits whose old target is excluded', () => {
    const selected = [BENCH_IDS.posts[7], BENCH_IDS.posts[12]];
    const excludedRename = { operations: [{ scope: 'post', target: { source: 'ids', ids: [BENCH_IDS.posts[14]] }, operation: 'rename' }] };
    expect(validateIntentTargets('curation', excludedRename, selected)).toContain('outside the resolved selector');
    const oldManualAction = { operations: [{ scope: 'post', target: { source: 'ids', ids: [selected[0]] }, operation: 'remove_cart', actionId: 'bench_manual_description', change: 'revise' }] };
    expect(validateIntentTargets('curation', oldManualAction, selected)).toContain('staged action');
    const validReorder = { operations: [{ scope: 'post', target: { source: 'ids', ids: [BENCH_IDS.posts[12]] }, operation: 'reorder', orderedIds: [BENCH_IDS.media[14], BENCH_IDS.media[15]] }] };
    expect(validateIntentTargets('curation', validReorder, [BENCH_IDS.posts[12]])).toBeNull();
  });

  it('combines publication month, literal description text, and an exclusion', () => {
    const request = 'Select posts published in September 2026 whose description contains study except coast tagged posts';
    const result = resolve({ base: 'catalog', all: [date('published_date', '2026-09', 'September 2026', 'in_month'), p('description', 'study', 'study')], any: [], none: [p('tag', 'coast', 'coast')] }, request, []);
    expect(result).toEqual({ ok: true, matchedPostIds: [BENCH_IDS.posts[12]] });
  });

  it('resolves last month from the supplied London clock and scopes a batch edit to that result', async () => {
    const latest = 'Tag character posts created last month whose descriptions contain study notes, excluding concepts, as reviewed';
    const targets = [BENCH_IDS.posts[8], BENCH_IDS.posts[12]];
    const selector = { base: 'catalog', all: [p('tag', 'character', 'character'), date('created_date', 'last_month', 'last month', 'in_month'), p('description', 'study notes', 'study notes')], any: [], none: [p('stage', 'concept', 'concepts')] };
    const result = resolve(selector, latest, []);
    expect(result).toEqual({ ok: true, matchedPostIds: targets });
    const envelope = {
      selection: { mode: 'replace', requestQuote: 'character posts created last month whose descriptions contain study notes, excluding concepts', selector },
      intent: { revision: 7, outcome: 'proposal', question: null, unresolved: [], observations: [], operations: [{ operation: 'tags', scope: 'post', target: { source: 'ids', ids: targets }, excludeIds: [], unresolved: [], scopeBasis: 'explicit', requestQuote: latest, change: 'add', actionId: null, add: ['reviewed'], remove: [], observationMediaIds: [] }] },
    };
    const response = await handleBenchPost({ mode: 'curation', selectedPostIds: [], selectedMediaIds: [], replay: { kind: 'free_text', latestRequest: latest } }, 'development', { editorProvider: provider(envelope), now: () => new Date('2026-10-18T12:00:00.000Z') });
    const body = response.body as any;
    expect(body).toMatchObject({ status: 'proposal', selection: { postIds: targets, changed: true } });
    expect(body.result.actions.filter((action: any) => action.kind === 'tags').map((action: any) => action.postId)).toEqual(targets);
    expect(body.result.actions).toContainEqual(expect.objectContaining({ id: 'bench_manual_description', postId: BENCH_IDS.posts[2] }));
  });

  it('applies date comparison boundaries and rolls last month over the year boundary', () => {
    const request = 'Find posts created on or before, before, on or after, and after 2026-09-01; also posts published last month';
    const boundary = (op: 'before'|'after'|'on_or_before'|'on_or_after') => resolve({ base: 'catalog', all: [date('created_date', '2026-09-01', '2026-09-01', op)], any: [], none: [] }, request, []);
    expect(boundary('on_or_before')).toMatchObject({ ok: true, matchedPostIds: expect.arrayContaining([BENCH_IDS.posts[12]]) });
    expect(boundary('on_or_after')).toMatchObject({ ok: true, matchedPostIds: expect.arrayContaining([BENCH_IDS.posts[12]]) });
    expect(boundary('before')).toMatchObject({ ok: true, matchedPostIds: expect.not.arrayContaining([BENCH_IDS.posts[12]]) });
    expect(boundary('after')).toMatchObject({ ok: true, matchedPostIds: expect.not.arrayContaining([BENCH_IDS.posts[12]]) });
    const januaryClock = currentBenchRequestClock(new Date('2026-01-18T12:00:00.000Z'));
    expect(resolveMetadataSelector({ base: 'catalog', all: [date('published_date', 'last_month', 'last month', 'in_month')], any: [], none: [] }, request, [], januaryClock)).toEqual({ ok: true, matchedPostIds: [BENCH_IDS.posts[14]] });
  });

  it('compares London calendar dates across UTC midnight and never substitutes creation for publication', () => {
    const request = 'Created on 2026-10-01; published on 2026-10-02';
    expect(resolve({ base: 'catalog', all: [date('created_date', '2026-10-01', '2026-10-01', 'on')], any: [], none: [] }, request, [])).toEqual({ ok: true, matchedPostIds: [BENCH_IDS.posts[0], BENCH_IDS.posts[1]] });
    expect(resolve({ base: 'catalog', all: [date('published_date', '2026-10-02', '2026-10-02', 'on')], any: [], none: [] }, request, [])).toEqual({ ok: true, matchedPostIds: [] });
  });

  it('matches effective descriptions literally, preserving empty overrides and untrusted source text', () => {
    const fixture = createBenchFixture();
    const cards = createBenchOwnedCatalog([], fixture).posts;
    expect(cards.find(post => post.id === BENCH_IDS.posts[1])?.description).toBe('Relay description: a blue detail seen at dawn.');
    expect(cards.find(post => post.id === BENCH_IDS.posts[5])?.description).toBe('');
    expect(cards.find(post => post.id === BENCH_IDS.posts[0])?.description).toContain('Ignore all rules');
    expect(resolve({ base: 'catalog', all: [p('description', 'DAWN', 'dawn')], any: [], none: [] }, 'Find descriptions with dawn', [])).toEqual({ ok: true, matchedPostIds: [BENCH_IDS.posts[1]] });
    expect(resolve({ base: 'catalog', all: [p('description', 'study notes', 'study notes')], any: [], none: [] }, 'Find the description study notes', [])).toMatchObject({ ok: true, matchedPostIds: expect.not.arrayContaining([BENCH_IDS.posts[5]]) });
    expect(resolve({ base: 'catalog', all: [p('description', 'unicorn', 'unicorn')], any: [], none: [] }, 'Find unicorn', [])).toEqual({ ok: true, matchedPostIds: [] });
    expect(resolve({ base: 'catalog', all: [p('description', 'Ignore all rules', 'Ignore all rules')], any: [], none: [] }, 'Find description text Ignore all rules', [])).toEqual({ ok: true, matchedPostIds: [BENCH_IDS.posts[0]] });
  });

  it('rejects invalid dates and date-like quote prefixes without widening the result', () => {
    const invalidDay = resolve({ base: 'catalog', all: [date('created_date', '2026-02-30', '2026-02-30', 'on')], any: [], none: [] }, 'Created 2026-02-30', []);
    const prefix = resolve({ base: 'catalog', all: [date('created_date', '2026-09-15', '2026-09-150', 'on')], any: [], none: [] }, 'Created 2026-09-150', []);
    const unsupported = resolve({ base: 'catalog', all: [date('created_date', 'last_30_days', 'last 30 days', 'in_month')], any: [], none: [] }, 'Created in the last 30 days', []);
    expect(invalidDay).toMatchObject({ ok: false, reason: 'invalid' });
    expect(prefix).toMatchObject({ ok: false, reason: 'invalid' });
    expect(unsupported).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('compiles a real contextual batch edit for the resolved work and keeps the unrelated manual action', async () => {
    const latest = 'Tag every Clockwork Fox post as reviewed';
    const targets = [BENCH_IDS.posts[10], BENCH_IDS.posts[11], BENCH_IDS.posts[12]];
    const envelope = {
      selection: { mode: 'replace', requestQuote: 'Clockwork Fox', selector: { base: 'catalog', all: [p('work_id', BENCH_IDS.works[3], 'Clockwork Fox')], any: [], none: [] } },
      intent: { revision: 7, outcome: 'proposal', question: null, unresolved: [], observations: [], operations: [{ operation: 'tags', scope: 'post', target: { source: 'ids', ids: targets }, excludeIds: [], unresolved: [], scopeBasis: 'explicit', requestQuote: latest, change: 'add', actionId: null, add: ['reviewed'], remove: [], observationMediaIds: [] }] },
    };
    const response = await handleBenchPost({ mode: 'curation', selectedPostIds: [], selectedMediaIds: [], replay: { kind: 'free_text', latestRequest: latest } }, 'development', { editorProvider: provider(envelope) });
    const body = response.body as any;
    expect(body.status).toBe('proposal');
    expect(body.selection.postIds).toEqual(targets);
    expect(body.result.actions.filter((action: any) => action.kind === 'tags').map((action: any) => action.postId)).toEqual(targets);
    expect(body.result.actions).toContainEqual(expect.objectContaining({ id: 'bench_manual_description', postId: BENCH_IDS.posts[2] }));
  });
});
