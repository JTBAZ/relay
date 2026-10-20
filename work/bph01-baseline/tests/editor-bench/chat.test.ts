import { describe, expect, it } from 'vitest';
import type { EditorProvider, ProviderUsage } from '../../src/gallery-editor/provider.js';
import { handleBenchPost } from '../../src/editor-bench/handler.js';
import { BENCH_IDS } from '../../src/editor-bench/fixtures.js';
import { reviewBenchSchedule } from '../../src/editor-bench/schedule-review.js';
import { matchesSchema } from '../../src/gallery-editor/action-validation.js';

const usage: ProviderUsage = { calls: 1, inputTokens: 90, outputTokens: 45, costUsd: 0.0001 };
const named = (postId: string, title: string) => ({ field: 'post_id', value: postId, requestQuote: title });
const selectName = (mode: 'replace'|'add'|'remove', postId: string, title: string, requestQuote = title) => ({ mode, requestQuote, selector: { base: 'catalog', all: [], any: [named(postId, requestQuote)], none: [] } });
function provider(value: unknown, inspect?: (input: unknown, responseSchema?: unknown) => void): EditorProvider {
  return { async respond(request) {
    inspect?.(request.input, request.responseSchema);
    return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage };
  } };
}
function curationIntent(request: string, postId = BENCH_IDS.posts[0], title = 'Aurora Study Part 1') {
  return { revision: 7, outcome: 'proposal', question: null, unresolved: [], observations: [], operations: [{ operation: 'rename', scope: 'post', target: { source: 'ids', ids: [postId] }, excludeIds: [], unresolved: [], scopeBasis: 'explicit', requestQuote: request, change: 'add', actionId: null, value: title }] };
}
function envelope(selection: unknown, intent: unknown) { return { selection, intent }; }
const preserve = { mode: 'preserve', selector: null, requestQuote: null };
const post = (latestRequest: string, selectedPostIds: string[] = [], mode: 'curation' | 'mock_posting' = 'curation', selectedMediaIds: string[] = []) => ({ mode, selectedPostIds, selectedMediaIds, replay: { kind: 'free_text', latestRequest } });

describe('one-call editor bench chat', () => {
  it('keeps first-turn null state compatible with a named edit that selects its target', async () => {
    const latest = 'Rename Aurora Study to Aurora Study Part 1';
    const result = await handleBenchPost({ mode: 'curation', selectedPostIds: [], selectedMediaIds: [], refinementState: null, replay: { kind: 'free_text', latestRequest: latest } }, 'development', { editorProvider: provider(envelope(selectName('replace', BENCH_IDS.posts[0], 'Aurora Study'), curationIntent(latest))) });
    expect(result.body).toMatchObject({ status: 'proposal', selection: { postIds: [BENCH_IDS.posts[0]], changed: true }, refinementState: null });
  });

  it('keeps refinement state through a preserve edit and refuses a combined selection change', async () => {
    const selected = [BENCH_IDS.posts[0]];
    const state = { v: 1, fixtureRevision: 7, selectedPostIds: selected, excludedPostIds: [] };
    const latest = 'Rename Aurora Study to Aurora Study Part 1';
    const keep = await handleBenchPost({ mode: 'curation', selectedPostIds: selected, selectedMediaIds: [BENCH_IDS.media[0]], refinementState: state, replay: { kind: 'free_text', latestRequest: latest } }, 'development', { editorProvider: provider(envelope(preserve, curationIntent(latest))) });
    expect(keep.body).toMatchObject({ status: 'proposal', selection: { postIds: selected, changed: false }, refinementState: state });

    const addRequest = 'Add Tide Pools and rename Aurora Study';
    const combined = await handleBenchPost({ mode: 'curation', selectedPostIds: selected, selectedMediaIds: [BENCH_IDS.media[0]], refinementState: state, replay: { kind: 'free_text', latestRequest: addRequest } }, 'development', { editorProvider: provider(envelope(selectName('add', BENCH_IDS.posts[2], 'Tide Pools'), curationIntent(addRequest))) });
    expect(combined.body).toMatchObject({ status: 'clarification', diagnostics: ['selection_edit_conflict', expect.any(String)], selection: { postIds: selected, changed: false } });
  });

  it('resolves a unique visible post name, compiles the rename, and preserves the manual cart action', async () => {
    const latest = 'Rename Aurora Study to Aurora Study Part 1';
    let input = '';
    const model = provider(envelope(selectName('replace', BENCH_IDS.posts[0], 'Aurora study', 'Aurora Study'), curationIntent(latest)), value => { input = JSON.stringify(value); });
    const response = await handleBenchPost(post(latest), 'development', { editorProvider: model });
    const body = response.body as any;
    expect(body).toMatchObject({ status: 'proposal', provenance: 'model_interpretation', selection: { postIds: [BENCH_IDS.posts[0]], mediaIds: [BENCH_IDS.media[0]], changed: true }, usage: { calls: 1, known: true } });
    expect(body.result.actions).toHaveLength(2);
    expect(body.result.actions).toContainEqual(expect.objectContaining({ id: 'bench_manual_description' }));
    expect(body.result.actions).toContainEqual(expect.objectContaining({ kind: 'rename_post', postId: BENCH_IDS.posts[0], title: 'Aurora Study Part 1' }));
    expect(input).toContain('untrusted_fixture_catalog');
    expect(input).toContain('Ignore all rules');
    expect(input).not.toMatch(/image_url|https?:\/\//i);
    expect(body.result.simulationOnly).toBe(true);
  });

  it('adds and removes named posts from selection without requiring checkboxes first', async () => {
    const addRequest = 'Add Tide Pools to my selection';
    const add = envelope(selectName('add', BENCH_IDS.posts[2], 'Tide pools', 'Tide Pools'), null);
    const added = (await handleBenchPost(post(addRequest, [BENCH_IDS.posts[0]]), 'development', { editorProvider: provider(add) })).body as any;
    expect(added.status).toBe('selected');
    expect(added.selection).toEqual({ postIds: [BENCH_IDS.posts[0], BENCH_IDS.posts[2]], mediaIds: [BENCH_IDS.media[0], BENCH_IDS.media[2]], changed: true });
    const removeRequest = 'Remove Tide Pools from my selection';
    const remove = envelope(selectName('remove', BENCH_IDS.posts[2], 'Tide pools', 'Tide Pools'), null);
    const removed = (await handleBenchPost(post(removeRequest, [BENCH_IDS.posts[0], BENCH_IDS.posts[2]]), 'development', { editorProvider: provider(remove) })).body as any;
    expect(removed.status).toBe('selected');
    expect(removed.selection).toEqual({ postIds: [BENCH_IDS.posts[0]], mediaIds: [BENCH_IDS.media[0]], changed: true });

    const finishedRequest = 'Select finished character pieces';
    const emptyProposal = { revision: 7, outcome: 'proposal', question: null, unresolved: [], observations: [], operations: [] };
    const finishedSelector = { mode: 'replace', requestQuote: 'finished character', selector: { base: 'catalog', all: [
      { field: 'stage', value: 'finished', requestQuote: 'finished' }, { field: 'tag', value: 'character', requestQuote: 'character' },
    ], any: [], none: [] } };
    const selectedDespiteEmptyIntent = (await handleBenchPost(post(finishedRequest), 'development', { editorProvider: provider(envelope(finishedSelector, emptyProposal)) })).body as any;
    expect(selectedDespiteEmptyIntent).toMatchObject({ status: 'selected', interpreted: emptyProposal, selection: { postIds: [BENCH_IDS.posts[7], BENCH_IDS.posts[12]], changed: true }, result: { matchedPostIds: [BENCH_IDS.posts[7], BENCH_IDS.posts[12]] } });

    const zeroRequest = 'Select finished character teaser assets';
    const zeroSelector = { mode: 'replace', requestQuote: 'finished character', selector: { base: 'catalog', all: [
      { field: 'stage', value: 'finished', requestQuote: 'finished' }, { field: 'tag', value: 'character', requestQuote: 'character' }, { field: 'media_role', value: 'teaser', requestQuote: 'teaser' },
    ], any: [], none: [] } };
    const zeroMatch = (await handleBenchPost(post(zeroRequest, [BENCH_IDS.posts[0]]), 'development', { editorProvider: provider(envelope(zeroSelector, emptyProposal)) })).body as any;
    expect(zeroMatch).toMatchObject({ status: 'clarification', interpreted: emptyProposal, selection: { postIds: [BENCH_IDS.posts[0]], changed: false }, result: { selector: zeroSelector.selector, matchedPostIds: [] } });
  });

  it('requires relative date values to remain symbolic and preserves selection on a precomputed month', async () => {
    const latest = 'Tag character posts created last month whose descriptions contain "study notes", excluding concept posts, with "reviewed"';
    const badSelector = { base: 'catalog', all: [
      { field: 'created_date', op: 'in_month', value: '2026-09', requestQuote: 'last month' },
      { field: 'tag', value: 'character', requestQuote: 'character' },
      { field: 'description', value: 'study notes', requestQuote: 'study notes' },
    ], any: [], none: [{ field: 'stage', value: 'concept', requestQuote: 'concept posts' }] };
    let modelInput = '';
    const response = await handleBenchPost(post(latest, [BENCH_IDS.posts[0]]), 'development', {
      editorProvider: provider(envelope({ mode: 'replace', requestQuote: latest, selector: badSelector }, curationIntent(latest)), input => { modelInput = JSON.stringify(input); }),
      now: () => new Date('2026-10-18T12:00:00.000Z'),
    });
    const body = response.body as any;
    expect(body).toMatchObject({ status: 'rejected', selection: { postIds: [BENCH_IDS.posts[0]], mediaIds: [BENCH_IDS.media[0]], changed: false } });
    expect(body.diagnostics).toContain('invalid_selector');
    const inputMessages = JSON.parse(modelInput) as Array<{ content: Array<{ text: string }> }>;
    const systemInstruction = inputMessages[0]!.content[0]!.text;
    expect(systemInstruction).toContain('never calculate or substitute a canonical date or month yourself');
    expect(systemInstruction).toContain('{field: "created_date", op: "in_month", value: "last_month", requestQuote: "last month"}');
  });

  it('compiles mock posting for a visible post name as a proposal graph only', async () => {
    const latest = 'Prepare a Patreon draft for Aurora Study titled "Aurora Study Part 1"';
    const exampleIntent = { base_revision: null, outcome: 'proposal', question: null, requests: [{
      command: 'add', target_handle: null, changed_fields: [], kind: 'primary_draft', source_ref: { mode: 'selection', id: null }, destination: 'patreon', title_mode: 'literal', title_text: 'Aurora Study Part 1', template_ref: { mode: 'none', value: null }, enabled: true, delivery_intent: 'prepare_for_creator_handoff', social_action: null, time_kind: 'none', local_date: null, weekday: null, weekday_qualifier: null, timezone: null, day_offset: null, target_destination: null, local_time: null, time_text: null, request_quote: latest,
    }] };
    const result = await handleBenchPost(post(latest, [], 'mock_posting'), 'development', { editorProvider: provider(envelope(selectName('replace', BENCH_IDS.posts[0], 'Aurora study', 'Aurora Study'), exampleIntent)), now: () => new Date('2026-10-17T12:34:56.000Z') });
    const body = result.body as any;
    expect(body.status).toBe('proposal');
    expect(body.selection).toMatchObject({ postIds: [BENCH_IDS.posts[0]], mediaIds: [BENCH_IDS.media[0]], changed: true });
    expect(body.result.steps).toContainEqual(expect.objectContaining({ capability: 'prepare_post_draft', title: 'Aurora Study Part 1', destination: 'patreon' }));
    expect(body.result.note).toContain('No draft');
    expect(body.result.requestClock).toMatchObject({ receivedAtUtc: '2026-10-17T12:34:56.000Z', localDate: '2026-10-17' });
  });

  it('interprets a scheduled selected-art post and maps the real compiler graph to review', async () => {
    const latest = 'Prepare a Patreon post from the selected artwork titled "Aurora Calendar Demo" on 2026-10-25 at 10:00 Europe/London.';
    const selected = { ...preserve };
    const requestQuote = latest;
    const timeText = '2026-10-25 at 10:00 Europe/London';
    const interpreted = {
      base_revision: null, outcome: 'proposal', question: null,
      requests: [{
        command: 'add', target_handle: null, changed_fields: [], kind: 'primary_draft',
        source_ref: { mode: 'selection', id: null }, destination: 'patreon', title_mode: 'literal', title_text: 'Aurora Calendar Demo',
        template_ref: { mode: 'none', value: null }, enabled: true, delivery_intent: 'prepare_for_creator_handoff', social_action: null,
        time_kind: 'absolute_local', local_date: '2026-10-25', weekday: null, weekday_qualifier: null, timezone: 'Europe/London',
        day_offset: null, target_destination: null, local_time: '10:00', time_text: timeText, request_quote: requestQuote,
      }],
    };
    let modelInput = '';
    let responseSchema: unknown;
    const chat = await handleBenchPost(post(latest, [BENCH_IDS.posts[0]], 'mock_posting'), 'development', {
      editorProvider: provider(envelope(selected, interpreted), (input, schema) => { modelInput = JSON.stringify(input); responseSchema = schema; }), now: () => new Date('2026-10-17T12:00:00.000Z'),
    });
    const body = chat.body as any;
    expect(body).toMatchObject({ status: 'proposal', selection: { postIds: [BENCH_IDS.posts[0]], mediaIds: [BENCH_IDS.media[0]] } });
    const inputMessages = JSON.parse(modelInput) as Array<{ content: Array<{ text: string }> }>;
    const modelContext = JSON.parse(inputMessages[1]!.content[0]!.text) as Record<string, unknown>;
    expect(modelContext).not.toHaveProperty('fixture_revision');
    expect(matchesSchema(envelope(selected, { ...interpreted, base_revision: 7 }), responseSchema as never)).toBe(false);
    expect(body.interpreted.requests[0]).toMatchObject({ command: 'add', target_handle: null, changed_fields: [], enabled: true, delivery_intent: 'prepare_for_creator_handoff' });
    const review = await reviewBenchSchedule({
      latestRequest: latest, structuredIntent: body.interpreted,
      selectedPostIds: body.selection.postIds, selectedMediaIds: body.selection.mediaIds,
    }, { now: () => new Date('2026-10-17T12:00:00.000Z') });
    expect(review).toMatchObject({
      kind: 'review', review: { title: 'Aurora Calendar Demo', destination: 'patreon', dueAt: { local: '2026-10-25T10:00', timezone: 'Europe/London', utc: '2026-10-25T10:00:00.000Z' } },
    });
  });

  it('reviews an X cue from current selection and rejects a deictic phrase as a post name', async () => {
    const latest = 'Create one manual X posting cue from Aurora Study titled "Aurora cue" on 2026-10-24 at 10:00 Europe/London';
    const manual = { kind: 'manual_posting_event', destination: 'x', source_ref: { mode: 'post_id', id: BENCH_IDS.posts[0] }, title_text: 'Aurora cue', time_kind: 'absolute_local', local_date: '2026-10-24', weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: '2026-10-24 at 10:00 Europe/London' };
    let responseSchema: unknown;
    const chat = await handleBenchPost(post(latest, [], 'mock_posting'), 'development', { editorProvider: provider(envelope(selectName('replace', BENCH_IDS.posts[0], 'Aurora Study'), manual), (_input, schema) => { responseSchema = schema; }), now: () => new Date('2026-10-17T12:00:00.000Z') });
    expect(matchesSchema(envelope(preserve, manual), responseSchema as never)).toBe(true);
    expect(matchesSchema(envelope(selectName('replace', BENCH_IDS.posts[0], 'Aurora Study'), manual), responseSchema as never)).toBe(true);
    expect(matchesSchema(envelope({ ...preserve, selector: { base: 'catalog', all: [], any: [], none: [] } }, manual), responseSchema as never)).toBe(false);
    expect(matchesSchema(envelope({ ...selectName('replace', BENCH_IDS.posts[0], 'Aurora Study'), selector: null }, manual), responseSchema as never)).toBe(false);
    expect(chat.body).toMatchObject({ status: 'proposal', interpreted: manual, selection: { postIds: [BENCH_IDS.posts[0]], changed: true }, result: { manualPostingEvent: { destination: 'x', title: 'Aurora cue' } } });
    const result = chat.body as any;
    const review = await reviewBenchSchedule({ latestRequest: latest, structuredIntent: result.interpreted, selectedPostIds: result.selection.postIds, selectedMediaIds: result.selection.mediaIds }, { now: () => new Date('2026-10-17T12:00:00.000Z') });
    expect(review).toMatchObject({ kind: 'review', reviewKind: 'direct_manual', review: { destination: 'x', title: 'Aurora cue', createPayload: { destination: 'x', post_id: null, external_url: null, create_relay_draft: false } } });

    const currentRequest = 'Create an X cue from the selected artwork titled "Aurora cue" on 2026-10-24 at 10:00 Europe/London';
    const currentIntent = { ...manual, source_ref: { mode: 'selection', id: null } };
    const currentChat = await handleBenchPost(post(currentRequest, [BENCH_IDS.posts[0]], 'mock_posting'), 'development', { editorProvider: provider(envelope(preserve, currentIntent)), now: () => new Date('2026-10-17T12:00:00.000Z') });
    expect(currentChat.body).toMatchObject({ status: 'proposal', selection: { postIds: [BENCH_IDS.posts[0]], mediaIds: [BENCH_IDS.media[0]], changed: false }, result: { manualPostingEvent: { destination: 'x' } } });
    const currentResult = currentChat.body as any;
    const currentReview = await reviewBenchSchedule({ latestRequest: currentRequest, structuredIntent: currentResult.interpreted, selectedPostIds: currentResult.selection.postIds, selectedMediaIds: currentResult.selection.mediaIds }, { now: () => new Date('2026-10-17T12:00:00.000Z') });
    expect(currentReview).toMatchObject({ kind: 'review', reviewKind: 'direct_manual', review: { destination: 'x', title: 'Aurora cue' } });

    const deicticPostId = selectName('replace', BENCH_IDS.posts[0], 'Aurora Study', 'selected artwork');
    const rejected = await handleBenchPost(post(currentRequest, [BENCH_IDS.posts[0]], 'mock_posting'), 'development', { editorProvider: provider(envelope(deicticPostId, currentIntent)), now: () => new Date('2026-10-17T12:00:00.000Z') });
    expect(rejected.body).toMatchObject({ status: 'clarification', selection: { postIds: [BENCH_IDS.posts[0]], mediaIds: [BENCH_IDS.media[0]], changed: false }, message: expect.stringContaining('unique visible name') });
  });

  it('proposes a complete three-destination batch from one named source', async () => {
    const latest = 'Schedule Aurora Study on X titled Aurora thread on 2026-10-24 at 10:00 Europe/London, Patreon titled Aurora supporter on 2026-10-24 at 11:00 Europe/London, and DeviantArt titled Aurora gallery on 2026-10-24 at 12:00 Europe/London.';
    const time = (hour: string) => ({ time_kind: 'absolute_local', local_date: '2026-10-24', weekday: null, weekday_qualifier: null, local_time: `${hour}:00`, timezone: 'Europe/London', time_text: `2026-10-24 at ${hour}:00 Europe/London` });
    const batch = { kind: 'manual_posting_batch', source_ref: { mode: 'post_id', id: BENCH_IDS.posts[0] }, events: [
      { destination: 'x', title_text: 'Aurora thread', ...time('10') },
      { destination: 'patreon', title_text: 'Aurora supporter', ...time('11') },
      { destination: 'deviantart', title_text: 'Aurora gallery', ...time('12') },
    ] };
    const chat = await handleBenchPost(post(latest, [], 'mock_posting'), 'development', {
      editorProvider: provider(envelope(selectName('replace', BENCH_IDS.posts[0], 'Aurora Study'), batch)), now: () => new Date('2026-10-17T12:00:00.000Z'),
    });
    expect(chat.body).toMatchObject({ status: 'proposal', interpreted: batch, selection: { postIds: [BENCH_IDS.posts[0]], mediaIds: [BENCH_IDS.media[0]], changed: true }, result: { manualPostingEvents: [
      { destination: 'x', title: 'Aurora thread' }, { destination: 'patreon', title: 'Aurora supporter' }, { destination: 'deviantart', title: 'Aurora gallery' },
    ] } });
    const result = chat.body as any;
    const review = await reviewBenchSchedule({ latestRequest: latest, structuredIntent: result.interpreted, selectedPostIds: result.selection.postIds, selectedMediaIds: result.selection.mediaIds }, { now: () => new Date('2026-10-17T12:00:00.000Z') });
    expect(review).toMatchObject({ kind: 'batch_review', reviews: [
      { destination: 'x', title: 'Aurora thread' }, { destination: 'patreon', title: 'Aurora supporter' }, { destination: 'deviantart', title: 'Aurora gallery' },
    ] });
  });

  it('returns a concrete clarification for ambiguous source language without changing selection', async () => {
    const latest = 'Rename the Aurora piece';
    const intent = { revision: 7, outcome: 'clarification', question: 'Do you mean Aurora Study or the separate blue fragment in the same work?', unresolved: [], observations: [], operations: [] };
    const response = await handleBenchPost(post(latest, [BENCH_IDS.posts[1]]), 'development', { editorProvider: provider(envelope(preserve, intent)) });
    expect(response.body).toMatchObject({ status: 'clarification', provenance: 'model_interpretation', message: expect.stringContaining('Aurora Study'), selection: { postIds: [BENCH_IDS.posts[1]], changed: false } });
  });

  it('rejects invented fixture identifiers and ungrounded selection quotes without selecting anything', async () => {
    const latest = 'Select Aurora Study';
    const bad = envelope({ mode: 'replace', requestQuote: 'Aurora Study', selector: { base: 'catalog', all: [], any: [named('post_from_my_account', 'Aurora Study')], none: [] } }, null);
    const response = await handleBenchPost(post(latest), 'development', { editorProvider: provider(bad) });
    expect(response.body).toMatchObject({ status: 'clarification', provenance: 'model_interpretation' });
    expect((response.body as any).diagnostics).toContain('unknown_selector_value');
    expect((response.body as any).selection).toEqual({ postIds: [], mediaIds: [], changed: false });
    const ungrounded = envelope(selectName('replace', BENCH_IDS.posts[0], 'Aurora study', 'Blue fragment'), null);
    const second = await handleBenchPost(post(latest), 'development', { editorProvider: provider(ungrounded) });
    expect(second.body).toMatchObject({ status: 'rejected', diagnostics: [expect.stringContaining('invalid_model_output')] });
    expect((second.body as any).result).toMatchObject({ rejectionDebug: { selectionMode: 'replace', selectorIsNull: false, requestQuoteIsNull: false, requestQuoteGrounded: false } });

    const criterionRequest = 'Select published coastal posts except sketches';
    const invalidCriterion = envelope({ mode: 'replace', requestQuote: 'coastal', selector: { base: 'catalog', all: [
      { field: 'publish_state', value: 'published', requestQuote: 'published' },
      { field: 'tag', value: 'coast', requestQuote: 'shoreline' },
    ], any: [], none: [{ field: 'stage', value: 'sketch', requestQuote: 'sketches' }] } }, null);
    const third = (await handleBenchPost(post(criterionRequest), 'development', { editorProvider: provider(invalidCriterion) })).body as any;
    expect(third).toMatchObject({ status: 'rejected', result: { matchedPostIds: [], selector: invalidCriterion.selection.selector }, selection: { postIds: [], changed: false } });
    expect(third.message).toContain('tag criterion quote is ungrounded');
  });
});
