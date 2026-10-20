import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { BENCH_IDS, createBenchFixture } from '../../src/editor-bench/fixtures.js';
import { createBenchDistributionVariantAdapter } from '../../src/editor-bench/distribution-variant-adapter.js';
import { registerBenchScheduleRoutes } from '../../src/editor-bench/schedule-routes.js';

function providerFor(actions: unknown[]) {
  let index = 0;
  return { respond: vi.fn(async (_input: unknown) => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: actions[Math.min(index++, actions.length - 1)] }) }] }], usage: { calls: 1, inputTokens: 30, outputTokens: 20 } })) };
}
function setup(actions: unknown[], options: Record<string, unknown> = {}) {
  const provider = options.provider ?? providerFor(actions);
  const adapter = createBenchDistributionVariantAdapter(options.adapterOptions as any);
  const app = express(); app.use(express.json());
  registerBenchScheduleRoutes(app, {
    development: true, signingSecret: Buffer.alloc(32, 9), traceId: () => 'conversation-test',
    authenticateCreator: vi.fn(async () => options.principal ?? { creatorId: 'creator-a', accountId: 'account-a' }),
    guardMutation: vi.fn(async () => true), createEvent: vi.fn(), readEvent: vi.fn(), distributionVariantAdapter: adapter,
    loadBenchVariantSource: async (_creator, postId, mediaIds) => (await import('../../src/editor-bench/distribution-variant-adapter.js')).loadBenchVariantSource(postId, mediaIds),
    getVariantEditProvider: async () => options.provider === false ? null : provider as any,
  });
  return { app, adapter, provider };
}
async function start(app: express.Express) {
  const response = await request(app).post('/api/v1/editor-bench/schedule/conversation/session').send({});
  expect(response.status).toBe(201); return response.body.data;
}
async function turn(app: express.Express, session: any, latestRequest: string) {
  return request(app).post('/api/v1/editor-bench/schedule/conversation/turn').send({ sessionId: session.sessionId, revision: session.revision, latestRequest });
}
const selectAurora = { kind: 'selection', preparation: null, selection: { mode: 'replace', requestQuote: 'Select Aurora study and exclude posts tagged sketch.', selector: { base: 'catalog', all: [{ field: 'title', value: 'Aurora study', requestQuote: 'Aurora study' }], any: [], none: [{ field: 'tag', value: 'sketch', requestQuote: 'tagged sketch' }] } } };
const rename = { kind: 'rename', targetQuote: 'selected post', title: 'Aurora Study Part 1' };

describe('mock editor-bench conversation', () => {
  it('records a preview-first X preparation goal, binds choices, and retains them after exclusion', async () => {
    const requestText = 'Find all my sketches and prepare them for posting to Twitter. Run them through the Previewizer first.';
    const compound = { kind: 'selection', preparation: { destination: 'x', destinationQuote: 'Twitter', previewFirst: true, previewQuote: 'Run them through the Previewizer first.' }, selection: { mode: 'replace', requestQuote: requestText, selector: { base: 'catalog', all: [{ field: 'stage', value: 'sketch', requestQuote: 'sketches' }], any: [], none: [] } } };
    const choices = { kind: 'preparation_update', templateQuote: 'Square teaser', copyChoice: { kind: 'existing_titles', quote: 'keep their existing titles' } };
    const exclusionRequest = 'Exclude Autumn Orchard.';
    const exclusion = { kind: 'selection', preparation: null, selection: { mode: 'remove', requestQuote: exclusionRequest, selector: { base: 'catalog', all: [{ field: 'title', value: 'Autumn Orchard sketch', requestQuote: 'Autumn Orchard' }], any: [], none: [] } } };
    const state = setup([compound, choices, exclusion]);
    const session = await start(state.app);
    const selected = await turn(state.app, session, requestText);
    expect(Buffer.byteLength(JSON.stringify((state.provider.respond as any).mock.calls[0][0]), 'utf8')).toBeLessThanOrEqual(24 * 1024);
    expect(selected.body.data).toMatchObject({ status: 'selected', selection: { postIds: ['bench_post_tide_sketch', 'bench_post_orchard_sketch'] }, preparation: { goal: 'preview_first_x_drafts', destination: 'x', templateId: null, copyChoice: null, pendingRequirements: ['template', 'copy_choice', 'previewizer', 'source_media_review'] } });
    expect(selected.body.data.cards.filter((card: any) => selected.body.data.selection.postIds.includes(card.postId)).map((card: any) => card.title)).toEqual(['Tide line sketch', 'Autumn Orchard sketch']);
    expect(selected.body.data.message).toContain('no draft exists');
    expect(state.adapter.size()).toBe(0);
    const updated = await turn(state.app, selected.body.data, 'Use Square teaser for both, and keep their existing titles.');
    expect(Buffer.byteLength(JSON.stringify((state.provider.respond as any).mock.calls[1][0]), 'utf8')).toBeLessThanOrEqual(24 * 1024);
    expect(JSON.parse((state.provider.respond as any).mock.calls[1][0].input[1].content[0].text).currentPreparation).toMatchObject({ goal: 'preview_first_x_drafts', destination: 'x', template: null, copyChoice: null });
    expect(updated.body.data).toMatchObject({ status: 'preparation_updated', revision: 2, preparation: { templateId: 'bench_template_square', copyChoice: { kind: 'existing_titles' }, pendingRequirements: ['previewizer', 'source_media_review'] } });
    const excluded = await turn(state.app, updated.body.data, exclusionRequest);
    expect(JSON.parse((state.provider.respond as any).mock.calls[2][0].input[1].content[0].text).currentPreparation).toMatchObject({ template: 'Square teaser', copyChoice: { kind: 'existing_titles' } });
    expect(excluded.body.data).toMatchObject({ status: 'selected', revision: 3, selection: { postIds: ['bench_post_tide_sketch'], excludedPostIds: ['bench_post_orchard_sketch'] }, preparation: { templateId: 'bench_template_square', copyChoice: { kind: 'existing_titles' } } });
    expect([0, 1, 2].map(index => Buffer.byteLength(JSON.stringify((state.provider.respond as any).mock.calls[index][0]), 'utf8'))).toEqual([22575, 22682, 22685]);
    expect(state.adapter.size()).toBe(0);
  });

  it('preserves preparation facts on ambiguous input and blocks dated posting until explicit cancellation', async () => {
    const requestText = 'Find all my sketches and prepare them for posting to Twitter. Run them through the Previewizer first.';
    const compound = { kind: 'selection', preparation: { destination: 'x', destinationQuote: 'Twitter', previewFirst: true, previewQuote: 'Run them through the Previewizer first.' }, selection: { mode: 'replace', requestQuote: requestText, selector: { base: 'catalog', all: [{ field: 'stage', value: 'sketch', requestQuote: 'sketches' }], any: [], none: [] } } };
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const datedRequest = `Schedule the selected artwork for X with title "Sketch teaser" on ${day} at 10:00 Europe/London.`;
    const posting = { kind: 'posting', event: { kind: 'manual_posting_event', destination: 'x', source_ref: { mode: 'selection', id: null }, title_text: 'Sketch teaser', time_kind: 'absolute_local', local_date: day, weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: `on ${day} at 10:00 Europe/London` } };
    const excludeAutumn = { kind: 'selection', preparation: null, selection: { mode: 'remove', requestQuote: 'Exclude Autumn Orchard.', selector: { base: 'catalog', all: [{ field: 'title', value: 'Autumn Orchard sketch', requestQuote: 'Autumn Orchard' }], any: [], none: [] } } };
    const state = setup([compound, { kind: 'clarification', question: 'Which template?' }, posting, { kind: 'preparation_cancel', requestQuote: 'Cancel the preview-first preparation goal.' }, excludeAutumn, posting]);
    const session = await start(state.app);
    const selected = await turn(state.app, session, requestText);
    const ambiguous = await turn(state.app, selected.body.data, 'Maybe use the template?');
    expect(ambiguous.body.data).toMatchObject({ status: 'clarification', revision: selected.body.data.revision, selection: selected.body.data.selection, preparation: selected.body.data.preparation });
    const blocked = await turn(state.app, ambiguous.body.data, datedRequest);
    expect(blocked.body.data).toMatchObject({ status: 'clarification', preparation: selected.body.data.preparation });
    expect(blocked.body.data.message).toContain('preview-first preparation goal is still pending');
    const cancelled = await turn(state.app, blocked.body.data, 'Cancel the preview-first preparation goal.');
    expect(cancelled.body.data).toMatchObject({ status: 'preparation_cancelled', revision: selected.body.data.revision + 1, preparation: null });
    expect(state.adapter.size()).toBe(0);
    const narrowed = await turn(state.app, cancelled.body.data, 'Exclude Autumn Orchard.');
    expect(narrowed.body.data.selection.postIds).toEqual(['bench_post_tide_sketch']);
    const resumed = await turn(state.app, narrowed.body.data, datedRequest);
    expect(resumed.body.data.status).toBe('review');
    expect(state.adapter.size()).toBe(0);
  });

  it('rejects an unknown owned template and an ungrounded copy quote without changing preparation', async () => {
    const requestText = 'Find all my sketches and prepare them for posting to Twitter. Run them through the Previewizer first.';
    const compound = { kind: 'selection', preparation: { destination: 'x', destinationQuote: 'Twitter', previewFirst: true, previewQuote: 'Run them through the Previewizer first.' }, selection: { mode: 'replace', requestQuote: requestText, selector: { base: 'catalog', all: [{ field: 'stage', value: 'sketch', requestQuote: 'sketches' }], any: [], none: [] } } };
    const state = setup([compound, { kind: 'preparation_update', templateQuote: 'Custom Square', copyChoice: null }, { kind: 'preparation_update', templateQuote: null, copyChoice: { kind: 'literal', quote: '“A calm garden”' } }, { kind: 'preparation_update', templateQuote: null, copyChoice: { kind: 'literal', quote: '"A calm garden"' } }]);
    const session = await start(state.app);
    const selected = await turn(state.app, session, requestText);
    const unknown = await turn(state.app, selected.body.data, 'Use Custom Square for both.');
    expect(unknown.body.data).toMatchObject({ status: 'clarification', revision: 1, preparation: selected.body.data.preparation });
    const forged = await turn(state.app, unknown.body.data, 'Use "A calm garden" as the title for both.');
    expect(forged.body.data).toMatchObject({ status: 'clarification', revision: 1, preparation: selected.body.data.preparation });
    const literal = await turn(state.app, forged.body.data, 'Use "A calm garden" as the title for both.');
    expect(literal.body.data).toMatchObject({ status: 'preparation_updated', revision: 2, preparation: { copyChoice: { kind: 'literal', text: 'A calm garden' } } });
    expect(state.adapter.size()).toBe(0);
  });

  it('keeps selection and confirmed rename in one session while preserving the baseline staged description', async () => {
    const state = setup([selectAurora, rename, { kind: 'selection', preparation: null, selection: { mode: 'replace', requestQuote: 'Select Aurora Study Part 1.', selector: { base: 'catalog', all: [{ field: 'title', value: 'Aurora Study Part 1', requestQuote: 'Aurora Study Part 1' }], any: [], none: [] } } }]);
    const originalFixture = createBenchFixture();
    const session = await start(state.app);
    const selected = await turn(state.app, session, 'Select Aurora study and exclude posts tagged sketch.');
    expect(selected.body.data).toMatchObject({ status: 'selected', selection: { postIds: [BENCH_IDS.posts[0]], excludedPostIds: [BENCH_IDS.posts[13]] } });
    const preview = await turn(state.app, selected.body.data, 'Rename the selected post to "Aurora Study Part 1".');
    expect(preview.body.data).toMatchObject({ status: 'review', preview: { kind: 'edit', postId: BENCH_IDS.posts[0] } });
    expect(preview.body.data.preview.beforeAfter).not.toContainEqual(expect.objectContaining({ label: expect.stringContaining('description') }));
    const confirmed = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/confirm').send({ sessionId: session.sessionId, reviewToken: preview.body.data.reviewToken });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data.cards.find((card: any) => card.postId === BENCH_IDS.posts[0]).title).toBe('Aurora Study Part 1');
    expect(originalFixture.state.tables.versions.find(row => row.postId === BENCH_IDS.posts[0])?.title).toBe('Aurora study');
    const nextSelection = await turn(state.app, confirmed.body.data, 'Select Aurora Study Part 1.');
    expect(nextSelection.body.data.selection.postIds).toEqual([BENCH_IDS.posts[0]]);
    expect(state.provider.respond).toHaveBeenCalledTimes(3);
  });

  it('confirms one direct X cue through the shared V3 adapter and reuses exact retries', async () => {
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const latestRequest = `Prepare the selected artwork for X with title "Aurora release" on ${day} at 10:00 Europe/London.`;
    const posting = { kind: 'posting', event: { kind: 'manual_posting_event', destination: 'x', source_ref: { mode: 'selection', id: null }, title_text: 'Aurora release', time_kind: 'absolute_local', local_date: day, weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: `on ${day} at 10:00 Europe/London` } };
    const state = setup([selectAurora, rename, posting]);
    const session = await start(state.app);
    const selected = await turn(state.app, session, 'Select Aurora study and exclude posts tagged sketch.');
    const editReview = await turn(state.app, selected.body.data, 'Rename the selected post to "Aurora Study Part 1".');
    expect(editReview.body.data.status).toBe('review');
    const renamed = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/confirm').send({ sessionId: session.sessionId, reviewToken: editReview.body.data.reviewToken });
    expect(renamed.body.data.cards.find((card: any) => card.postId === BENCH_IDS.posts[0]).title).toBe('Aurora Study Part 1');
    const review = await turn(state.app, renamed.body.data, latestRequest);
    expect(review.body.data.status).toBe('review');
    expect(state.adapter.size()).toBe(0);
    const payload = (state.provider.respond as any).mock.calls[2][0];
    const prompt = payload.input[0].content[0].text;
    const supplied = JSON.parse(payload.input[1].content[0].text);
    expect(prompt).toContain('literal title as posting copy (not a source title change)');
    expect(prompt).toContain('source_ref {mode:selection,id:null}');
    expect(JSON.stringify(payload.responseSchema)).toContain('title_text');
    expect(supplied.catalog.posts.find((post: any) => post.id === BENCH_IDS.posts[0]).visibleName).toBe('Aurora Study Part 1');
    expect(supplied.currentSelection).toEqual([BENCH_IDS.posts[0]]);
    const confirmInput = { sessionId: session.sessionId, reviewToken: review.body.data.reviewToken };
    const confirmed = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/confirm').send(confirmInput);
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data.receipt).toMatchObject({ scope: 'development_mock_only', ephemeral: true, kind: 'posting' });
    expect(confirmed.body.data.receipt.event).toMatchObject({ destination: 'x', title: 'Aurora release', post_id: null, status: 'pending' });
    expect(confirmed.body.data.receipt.variant).toMatchObject({ status: 'draft', postText: 'Aurora release', attempts: [] });
    const retry = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/confirm').send(confirmInput);
    expect(retry.status).toBe(200);
    expect(retry.body.data.reused).toBe(true);
    expect(state.adapter.size()).toBe(1);
  });

  it('projects and selects a confirmed post-level tag delta on the next turn', async () => {
    const tagAction = { kind: 'tags', targetQuote: 'selected post', add: ['release-ready'], remove: [], requestQuote: 'Add the release-ready tag to the selected post.' };
    const findTagged = { kind: 'selection', preparation: null, selection: { mode: 'replace', requestQuote: 'Select the post tagged release-ready.', selector: { base: 'catalog', all: [{ field: 'tag', value: 'release-ready', requestQuote: 'tagged release-ready' }], any: [], none: [] } } };
    const state = setup([selectAurora, tagAction, findTagged]);
    const session = await start(state.app);
    const selected = await turn(state.app, session, 'Select Aurora study and exclude posts tagged sketch.');
    const review = await turn(state.app, selected.body.data, 'Add the release-ready tag to the selected post.');
    expect(review.body.data.status).toBe('review');
    expect(review.body.data.preview.action).toMatchObject({ kind: 'tags', add: ['release-ready'], remove: [] });
    const confirmed = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/confirm').send({ sessionId: session.sessionId, reviewToken: review.body.data.reviewToken });
    expect(confirmed.body.data.cards.find((card: any) => card.postId === BENCH_IDS.posts[0]).tags).toContain('release-ready');
    const next = await turn(state.app, confirmed.body.data, 'Select the post tagged release-ready.');
    expect(next.body.data.selection.postIds).toEqual([BENCH_IDS.posts[0]]);
  });

  it('invalidates replaced previews and refuses foreign or unknown sessions', async () => {
    const state = setup([selectAurora, rename, { kind: 'clarification', question: 'Choose one clear action.' }]);
    const session = await start(state.app);
    const selected = await turn(state.app, session, 'Select Aurora study and exclude posts tagged sketch.');
    const preview = await turn(state.app, selected.body.data, 'Rename the selected post to "Aurora Study Part 1".');
    const replacement = await turn(state.app, selected.body.data, 'Do something else.');
    expect(replacement.body.data.status).toBe('clarification');
    const stale = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/confirm').send({ sessionId: session.sessionId, reviewToken: preview.body.data.reviewToken });
    expect(stale.status).toBe(409);
    const foreign = setup([selectAurora], { principal: { creatorId: 'creator-b', accountId: 'account-b' } });
    const ownedSnapshot = await request(state.app).get(`/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}`);
    expect(ownedSnapshot.status).toBe(200);
    expect(ownedSnapshot.body.data.revision).toBe(1);
    expect(state.provider.respond).toHaveBeenCalledTimes(3);
    const foreignRead = await request(foreign.app).get(`/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}`);
    expect(foreignRead.status).toBe(404);
    const notFound = await request(foreign.app).post('/api/v1/editor-bench/schedule/conversation/turn').send({ sessionId: session.sessionId, revision: 0, latestRequest: 'Select Aurora.' });
    expect(notFound.status).toBe(404);
  });

  it('discards a slow model result when a newer turn advances the session generation', async () => {
    let release!: () => void;
    let calls = 0;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const provider = { respond: vi.fn(async () => {
      const call = ++calls; if (call === 1) await pending;
      const action = call === 1 ? selectAurora : { kind: 'clarification', question: 'Please clarify.' };
      return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: action }) }] }] };
    }) };
    const state = setup([], { provider }); const session = await start(state.app);
    const slow = turn(state.app, session, 'Select Aurora study and exclude posts tagged sketch.').then(response => response);
    await new Promise(resolve => setTimeout(resolve, 10));
    const fast = await turn(state.app, session, 'Please clarify this request.');
    release();
    const slowResult = await slow;
    expect(fast.body.data.status).toBe('clarification');
    expect(slowResult.status).toBe(409);
    expect(provider.respond).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed, unquoted, unknown-field, and oversized turns without changing session metadata', async () => {
    const cases = [
      { requestText: 'Please rename this.', output: 'not JSON', calls: 1 },
      { requestText: 'Rename the selected post to Aurora.', output: JSON.stringify({ result: { kind: 'rename', targetQuote: 'selected post', title: 'Aurora' } }), calls: 1 },
      { requestText: 'Please clarify this request.', output: JSON.stringify({ result: { kind: 'clarification', question: 'Which action?', unexpected: true } }), calls: 1 },
      { requestText: 'x'.repeat(15000), output: '', calls: 0 },
    ];
    for (const testCase of cases) {
      const provider = { respond: vi.fn(async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: testCase.output }] }], usage: { calls: 1, inputTokens: 1, outputTokens: 1 } })) };
      const state = setup([], { provider });
      const session = await start(state.app);
      const result = await turn(state.app, session, testCase.requestText);
      expect(result.status).toBe(200);
      expect(result.body.data.status).toBe('clarification');
      expect(provider.respond).toHaveBeenCalledTimes(testCase.calls);
      const current = await request(state.app).get(`/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}`);
      expect(current.body.data).toMatchObject({ revision: 0, selection: { postIds: [], excludedPostIds: [] } });
    }
  });

  it('grounds rename titles in one exact balanced quote and independently grounds the target', async () => {
    for (const [mark, title] of [['"', 'Straight title'], ['“', 'Curly title'], ["'", 'Straight single title'], ['‘', 'Curly single title']] as const) {
      const close = mark === '“' ? '”' : mark === '‘' ? '’' : mark;
      const targetQuote = 'selected post';
      const action = { kind: 'rename', targetQuote, title };
      const state = setup([selectAurora, action]);
      const session = await start(state.app);
      const selected = await turn(state.app, session, 'Select Aurora study and exclude posts tagged sketch.');
      const result = await turn(state.app, selected.body.data, `Rename the ${targetQuote} to ${mark}${title}${close}.`);
      expect(result.body.data.status).toBe('review');
      expect(result.body.data.preview.beforeAfter).toEqual(expect.arrayContaining([expect.objectContaining({ after: title })]));
    }

    const invalidCases = [
      { request: 'Rename the selected post to "Quoted title".', outputAction: { kind: 'rename', targetQuote: 'selected post', title: 'Different title' }, diagnostic: 'quote_span', flag: 'quoteSpan' },
      { request: 'Rename the selected post to New title.', outputAction: { kind: 'rename', targetQuote: 'selected post', title: 'New title' }, diagnostic: 'quote_span', flag: 'quoteSpan' },
      { request: 'Rename the selected post to “Unclosed title.', outputAction: { kind: 'rename', targetQuote: 'selected post', title: 'Unclosed title' }, diagnostic: 'quote_span', flag: 'quoteSpan' },
      { request: 'Rename the selected post to "Repeated" instead of "Repeated".', outputAction: { kind: 'rename', targetQuote: 'selected post', title: 'Repeated' }, diagnostic: 'quote_span', flag: 'quoteSpan' },
      { request: 'Rename the selected post to "New ‘nested’ title".', outputAction: { kind: 'rename', targetQuote: 'selected post', title: 'New ‘nested’ title' }, diagnostic: 'quote_span', flag: 'quoteSpan' },
      { request: 'Rename the selected post to New title”.', outputAction: { kind: 'rename', targetQuote: 'selected post', title: 'New title' }, diagnostic: 'quote_span', flag: 'quoteSpan' },
      { request: 'Rename other post to "New title".', outputAction: { kind: 'rename', targetQuote: 'other post', title: 'New title' }, diagnostic: 'ok' },
      { request: 'Rename the post to "selected post".', outputAction: { kind: 'rename', targetQuote: 'selected post', title: 'selected post' }, diagnostic: 'target_separation', flag: 'targetSeparation' },
      { request: 'Rename the selected post to "Schema title".', outputAction: { kind: 'rename', targetQuote: 'selected post', title: 'Schema title', replacementQuote: '"Schema title"' }, diagnostic: 'schema', flag: 'schema' },
      { request: 'x'.repeat(2001), outputAction: { kind: 'rename', targetQuote: 'x', title: 'Long request title' }, diagnostic: 'request_length' },
    ];
    for (const testCase of invalidCases) {
      const state = setup([selectAurora, testCase.outputAction]);
      const session = await start(state.app);
      const selected = await turn(state.app, session, 'Select Aurora study and exclude posts tagged sketch.');
      const result = await turn(state.app, selected.body.data, testCase.request);
      expect(result.body.data.status).toBe('clarification');
      if (testCase.diagnostic !== 'ok') expect(result.body.data.diagnostic).toBe(testCase.diagnostic);
      if ('flag' in testCase) expect(result.body.data.renameValidation).toMatchObject({ schema: testCase.flag === 'schema', quoteSpan: testCase.flag === 'quoteSpan', targetSeparation: testCase.flag === 'targetSeparation', requestLength: testCase.flag === 'requestLength' });
      expect(state.provider.respond).toHaveBeenCalledTimes(2);
      const current = await request(state.app).get(`/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}`);
      expect(current.body.data.revision).toBe(1);
      expect(current.body.data.pending).toBeNull();
    }
  });
});
