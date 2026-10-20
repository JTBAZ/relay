import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { BENCH_IDS, createBenchFixture } from '../../src/editor-bench/fixtures.js';
import { beginConversationPreview, completeConversationPreview, createBenchConversationStore, MAX_BENCH_PREVIEW_BYTES, reconcileConversationPreviews, storeConversationPreviewUpload } from '../../src/editor-bench/conversation.js';
import { createBenchDistributionVariantAdapter } from '../../src/editor-bench/distribution-variant-adapter.js';
import { registerBenchScheduleRoutes } from '../../src/editor-bench/schedule-routes.js';
import { parsePlanPreviewMediaId, parseVariantMediaBinding, resolveVariantMediaIds } from '../../src/distribution/media-binding.js';

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
async function completeAuroraPreview(state: ReturnType<typeof setup>, session: any, renameFirst?: string) {
  const selectionText = 'Select Aurora study for X draft preparation and run Previewizer first.';
  const selected = await turn(state.app, session, selectionText);
  const prepared = await turn(state.app, selected.body.data, 'Use Square teaser and keep their existing titles.');
  let current = prepared.body.data;
  if (renameFirst) {
    const review = await turn(state.app, current, renameFirst);
    const renamed = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/confirm').send({ sessionId: session.sessionId, reviewToken: review.body.data.reviewToken });
    expect(review.body.data.status).toBe('review'); expect(renamed.status).toBe(201);
    current = renamed.body.data;
  }
  const opened = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/preview/open').send({ sessionId: session.sessionId, revision: current.revision, postId: BENCH_IDS.posts[0], mediaId: BENCH_IDS.media[0] });
  const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#123456' } }).jpeg().toBuffer();
  const base = `/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}/preview/${opened.body.data.attempt.id}`;
  const upload = await request(state.app).post(`${base}/upload`).set('Content-Type', 'image/jpeg').send(jpeg);
  const complete = await request(state.app).post(`${base}/complete`).send({ previewMediaId: upload.body.data.previewMediaId });
  expect(opened.status).toBe(200); expect(upload.status).toBe(200); expect(complete.status).toBe(200);
  return { snapshot: complete.body.data, jpeg, previewMediaId: upload.body.data.previewMediaId };
}
const selectAurora = { kind: 'selection', preparation: null, selection: { mode: 'replace', requestQuote: 'Select Aurora study and exclude posts tagged sketch.', selector: { base: 'catalog', all: [{ field: 'title', value: 'Aurora study', requestQuote: 'Aurora study' }], any: [], none: [{ field: 'tag', value: 'sketch', requestQuote: 'tagged sketch' }] } } };
const rename = { kind: 'rename', targetQuote: 'selected post', title: 'Aurora Study Part 1' };
function preparedPreviewSession() {
  const store = createBenchConversationStore();
  const session = store.create('creator-a');
  session.selectedPostIds = [BENCH_IDS.posts[0]];
  session.preparation = { goal: 'preview_first_x_drafts', destination: 'x', templateId: 'bench_template_square', copyChoice: { kind: 'existing_titles' } };
  return { store, session };
}

describe('mock editor-bench conversation', () => {
  it('toggles fixture posts with canonical ordering, sticky exclusions, and current selection context', async () => {
    const state = setup([{ kind: 'clarification', question: 'Which action?' }]);
    const session = await start(state.app);
    const toggle = (snapshot: any, postId: string) => request(state.app).post('/api/v1/editor-bench/schedule/conversation/selection/toggle').send({ sessionId: snapshot.sessionId, revision: snapshot.revision, postId });
    const later = await toggle(session, BENCH_IDS.posts[3]);
    const earlier = await toggle(later.body.data, BENCH_IDS.posts[0]);
    expect(earlier.body.data.selection.postIds).toEqual([BENCH_IDS.posts[0], BENCH_IDS.posts[3]]);
    const removed = await toggle(earlier.body.data, BENCH_IDS.posts[3]);
    expect(removed.body.data.selection).toEqual({ postIds: [BENCH_IDS.posts[0]], excludedPostIds: [BENCH_IDS.posts[3]] });
    const restored = await toggle(removed.body.data, BENCH_IDS.posts[3]);
    expect(restored.body.data.selection).toEqual({ postIds: [BENCH_IDS.posts[0], BENCH_IDS.posts[3]], excludedPostIds: [] });
    const next = await turn(state.app, restored.body.data, 'Please clarify this request.');
    expect(next.body.data.status).toBe('clarification');
    const supplied = JSON.parse((state.provider.respond as any).mock.calls[0][0].input[1].content[0].text);
    expect(supplied.currentSelection).toEqual([BENCH_IDS.posts[0], BENCH_IDS.posts[3]]);
    expect(state.provider.respond).toHaveBeenCalledTimes(1);
  });

  it('rejects stale, foreign, and unknown fixture toggles without changing the owned session', async () => {
    const principal = { creatorId: 'creator-a', accountId: 'account-a' };
    const state = setup([], { principal }), session = await start(state.app);
    const path = '/api/v1/editor-bench/schedule/conversation/selection/toggle';
    const body = { sessionId: session.sessionId, revision: session.revision, postId: BENCH_IDS.posts[0] };
    const toggled = await request(state.app).post(path).send(body);
    const stale = await request(state.app).post(path).send(body);
    const unknown = await request(state.app).post(path).send({ ...body, revision: toggled.body.data.revision, postId: 'bench_post_forged' });
    principal.creatorId = 'creator-b';
    const foreignRequest = await request(state.app).post(path).send({ ...body, revision: toggled.body.data.revision });
    principal.creatorId = 'creator-a';
    expect(toggled.status).toBe(200);
    expect(stale.status).toBe(409);
    expect(unknown.status).toBe(400);
    expect(foreignRequest.status).toBe(404);
    const current = await request(state.app).get(`/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}`);
    expect(current.body.data).toMatchObject({ revision: 1, selection: { postIds: [BENCH_IDS.posts[0]], excludedPostIds: [] } });
  });

  it('invalidates an old pending review when a card is toggled', async () => {
    const state = setup([selectAurora, rename]);
    const session = await start(state.app);
    const selected = await turn(state.app, session, 'Select Aurora study and exclude posts tagged sketch.');
    const review = await turn(state.app, selected.body.data, 'Rename the selected post to "Aurora Study Part 1".');
    expect(review.body.data.status).toBe('review');
    const toggled = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/selection/toggle').send({ sessionId: session.sessionId, revision: review.body.data.revision, postId: BENCH_IDS.posts[0] });
    const staleConfirm = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/confirm').send({ sessionId: session.sessionId, reviewToken: review.body.data.reviewToken });
    expect(toggled.body.data).toMatchObject({ revision: review.body.data.revision + 1, selection: { postIds: [], excludedPostIds: [BENCH_IDS.posts[0], BENCH_IDS.posts[13]] }, pending: null });
    expect(staleConfirm.status).toBe(409);
  });

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
    expect(selected.body.data.message).toContain('Previewizer and review controls');
    expect(state.adapter.size()).toBe(0);
    const updated = await turn(state.app, selected.body.data, 'Use Square teaser for both, and keep their existing titles.');
    expect(Buffer.byteLength(JSON.stringify((state.provider.respond as any).mock.calls[1][0]), 'utf8')).toBeLessThanOrEqual(24 * 1024);
    expect(JSON.parse((state.provider.respond as any).mock.calls[1][0].input[1].content[0].text).currentPreparation).toMatchObject({ goal: 'preview_first_x_drafts', destination: 'x', template: null, copyChoice: null });
    expect(updated.body.data).toMatchObject({ status: 'preparation_updated', revision: 2, preparation: { templateId: 'bench_template_square', copyChoice: { kind: 'existing_titles' }, pendingRequirements: ['previewizer', 'source_media_review'] } });
    const excluded = await turn(state.app, updated.body.data, exclusionRequest);
    expect(JSON.parse((state.provider.respond as any).mock.calls[2][0].input[1].content[0].text).currentPreparation).toMatchObject({ template: 'Square teaser', copyChoice: { kind: 'existing_titles' } });
    expect(excluded.body.data).toMatchObject({ status: 'selected', revision: 3, selection: { postIds: ['bench_post_tide_sketch'], excludedPostIds: ['bench_post_orchard_sketch'] }, preparation: { templateId: 'bench_template_square', copyChoice: { kind: 'existing_titles' } } });
    expect([0, 1, 2].map(index => Buffer.byteLength(JSON.stringify((state.provider.respond as any).mock.calls[index][0]), 'utf8'))).toEqual([22587, 22694, 22697]);
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
    expect(blocked.body.data.message).toContain('preview-first preparation goal is still active');
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

  it('discards a pending model result when a card toggle advances the conversation', async () => {
    let release!: () => void;
    let markEntered!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { markEntered = resolve; });
    const provider = { respond: vi.fn(async () => {
      markEntered();
      await pending;
      return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: selectAurora }) }] }] };
    }) };
    const state = setup([], { provider }), session = await start(state.app);
    const slow = turn(state.app, session, 'Select Aurora study and exclude posts tagged sketch.').then(response => response);
    await entered;
    const toggled = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/selection/toggle').send({ sessionId: session.sessionId, revision: session.revision, postId: BENCH_IDS.posts[1] });
    release();
    const slowResult = await slow;
    expect(toggled.status).toBe(200);
    expect(slowResult.status).toBe(409);
    expect(toggled.body.data.selection.postIds).toEqual([BENCH_IDS.posts[1]]);
    expect(provider.respond).toHaveBeenCalledTimes(1);
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

  it('stores only a verified JPEG after explicit preview completion and reuses that completion', async () => {
    const selectionText = 'Select Aurora study for X draft preparation and run Previewizer first.';
    const select = { kind: 'selection', preparation: { destination: 'x', destinationQuote: 'X', previewFirst: true, previewQuote: 'run Previewizer first' }, selection: { mode: 'replace', requestQuote: selectionText, selector: { base: 'catalog', all: [{ field: 'title', value: 'Aurora study', requestQuote: 'Aurora study' }], any: [], none: [] } } };
    const choices = { kind: 'preparation_update', templateQuote: 'Square teaser', copyChoice: { kind: 'existing_titles', quote: 'keep their existing titles' } };
    const state = setup([select, choices]);
    const session = await start(state.app);
    const selected = await turn(state.app, session, selectionText);
    const prepared = await turn(state.app, selected.body.data, 'Use Square teaser and keep their existing titles.');
    expect(prepared.body.data.preparation.templateId).toBe('bench_template_square');

    const opened = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/preview/open').send({ sessionId: session.sessionId, revision: prepared.body.data.revision, postId: BENCH_IDS.posts[0], mediaId: BENCH_IDS.media[0] });
    expect(opened.status).toBe(200);
    expect(opened.body.data.initialTemplate.id).toBe('bench_template_square');
    expect(opened.body.data.sourceImageUrl).toContain('data:image/svg+xml');
    expect(opened.body.data.sourceLabel).toContain('synthetic fixture artwork');

    const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#123456' } }).jpeg().toBuffer();
    const base = `/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}/preview/${opened.body.data.attempt.id}`;
    const upload = await request(state.app).post(`${base}/upload`).set('Content-Type', 'image/jpeg').send(jpeg);
    expect(upload.status).toBe(200);
    expect(upload.body.data).toMatchObject({ size: jpeg.byteLength });
    const unconfirmed = await request(state.app).get(`/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}`);
    expect(unconfirmed.body.data.previewStatus[BENCH_IDS.posts[0]].status).toBe('in_progress');

    const input = { previewMediaId: upload.body.data.previewMediaId };
    const completed = await request(state.app).post(`${base}/complete`).send(input);
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({ previewState: 'mock_previews_ready', receipt: { sourceMediaId: BENCH_IDS.media[0], templateId: 'bench_template_square', size: jpeg.byteLength } });
    expect(completed.body.data.previewStatus[BENCH_IDS.posts[0]].receipt).not.toHaveProperty('bytes');
    const retry = await request(state.app).post(`${base}/complete`).send(input);
    expect(retry.status).toBe(200);
    expect(retry.body.data.reused).toBe(true);
    const toggled = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/selection/toggle').send({ sessionId: session.sessionId, revision: retry.body.data.revision, postId: BENCH_IDS.posts[1] });
    expect(toggled.body.data.preparation).toMatchObject({ goal: 'preview_first_x_drafts', templateId: 'bench_template_square' });
    expect(toggled.body.data.previewStatus[BENCH_IDS.posts[0]]).toMatchObject({ status: 'complete', receipt: { previewMediaId: completed.body.data.receipt.previewMediaId } });
    const deselected = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/selection/toggle').send({ sessionId: session.sessionId, revision: toggled.body.data.revision, postId: BENCH_IDS.posts[0] });
    expect(deselected.body.data.preparation).toMatchObject({ goal: 'preview_first_x_drafts', templateId: 'bench_template_square', copyChoice: { kind: 'existing_titles' } });
    expect(deselected.body.data.previewStatus).not.toHaveProperty(BENCH_IDS.posts[0]);
  });

  it('reviews and confirms one exact-copy X draft, rejects a superseded token, and retains its owned export', async () => {
    const select = { kind: 'selection', preparation: { destination: 'x', destinationQuote: 'X', previewFirst: true, previewQuote: 'Previewizer first' }, selection: { mode: 'replace', requestQuote: 'Select Aurora study for X draft preparation and run Previewizer first.', selector: { base: 'catalog', all: [{ field: 'title', value: 'Aurora study', requestQuote: 'Aurora study' }], any: [], none: [] } } };
    const state = setup([select, { kind: 'preparation_update', templateQuote: 'Square teaser', copyChoice: { kind: 'existing_titles', quote: 'keep their existing titles' } }, rename, { kind: 'clarification', question: 'Clarify the next step.' }]);
    const session = await start(state.app), completed = await completeAuroraPreview(state, session, 'Rename the selected post to "Aurora Study Part 1".');
    const reviewPath = '/api/v1/editor-bench/schedule/conversation/x-draft/review';
    const reviewA = await request(state.app).post(reviewPath).send({ sessionId: session.sessionId, revision: completed.snapshot.revision, postId: BENCH_IDS.posts[0] });
    const reviewB = await request(state.app).post(reviewPath).send({ sessionId: session.sessionId, revision: completed.snapshot.revision, postId: BENCH_IDS.posts[0] });
    expect(reviewA.status).toBe(200); expect(reviewB.status).toBe(200);
    expect(reviewB.body.data.review).toMatchObject({ sourceTitle: 'Aurora Study Part 1', copyText: 'Aurora Study Part 1', label: 'Unscheduled mock draft; nothing posted.' });
    const confirmPath = '/api/v1/editor-bench/schedule/conversation/x-draft/confirm';
    const confirmB = await request(state.app).post(confirmPath).send({ sessionId: session.sessionId, reviewToken: reviewB.body.data.reviewToken });
    expect(confirmB.status).toBe(201);
    expect(confirmB.body.data.receipt.variant).toMatchObject({ status: 'draft', assistantEnabled: false, postText: 'Aurora Study Part 1', platformFields: { media_version: 'preview' } });
    expect(confirmB.body.data.receipt.variant.event).toBeUndefined();
    const variant = confirmB.body.data.receipt.variant, plan = confirmB.body.data.receipt.plan;
    expect(plan).toMatchObject({ status: 'active', assistantMode: 'none', assistantPlan: { preview_media_id: completed.previewMediaId } });
    expect(variant.advice.bench_source_v1.approved_initial_variant.media_ids).toEqual([completed.previewMediaId]);
    expect(variant.advice.bench_source_v1.preview_export).toMatchObject({ media_id: completed.previewMediaId, initial_template_id: 'bench_template_square', initial_template_config_hash: expect.any(String) });
    expect(variant.advice.bench_variant_revisions_v1).toMatchObject({ currentRevision: 0, revisions: [{ revision: 0, value: 'Aurora Study Part 1' }] });
    expect(resolveVariantMediaIds({ canonicalMediaIds: BENCH_IDS.media.slice(0, 1), binding: parseVariantMediaBinding(variant.platformFields, 'x'), planPreviewMediaId: parsePlanPreviewMediaId(plan.assistantPlan) })).toEqual([completed.previewMediaId]);
    expect(state.adapter.size()).toBe(0);
    const staleA = await request(state.app).post(confirmPath).send({ sessionId: session.sessionId, reviewToken: reviewA.body.data.reviewToken });
    expect(staleA.status).toBe(409);
    const replayB = await request(state.app).post(confirmPath).send({ sessionId: session.sessionId, reviewToken: reviewB.body.data.reviewToken });
    expect(replayB.status).toBe(200);
    const later = await turn(state.app, replayB.body.data, 'Please clarify the next step.');
    const currentReplay = await request(state.app).post(confirmPath).send({ sessionId: session.sessionId, reviewToken: reviewB.body.data.reviewToken });
    expect(later.body.data.status).toBe('clarification');
    expect(currentReplay.status).toBe(200);
    expect(currentReplay.body.data.revision).toBe(later.body.data.revision);
    const mediaPath = `/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}/preview-media/${completed.previewMediaId}`;
    const retained = await request(state.app).get(mediaPath);
    expect(retained.status).toBe(200);
    expect(retained.headers['content-type']).toContain('image/jpeg');
    expect(retained.headers['cache-control']).toContain('no-store');
    expect(retained.headers['x-content-type-options']).toBe('nosniff');
    expect(retained.body).toEqual(completed.jpeg);
    const excluded = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/selection/toggle').send({ sessionId: session.sessionId, revision: currentReplay.body.data.revision, postId: BENCH_IDS.posts[0] });
    expect(excluded.body.data.selection.excludedPostIds).toContain(BENCH_IDS.posts[0]);
    expect(excluded.body.data.draftStatus).not.toHaveProperty(BENCH_IDS.posts[0]);
    expect((await request(state.app).get(mediaPath)).status).toBe(200);
  });

  it('does not pin an export or create a draft when adapter commit fails', async () => {
    const select = { kind: 'selection', preparation: { destination: 'x', destinationQuote: 'X', previewFirst: true, previewQuote: 'Previewizer first' }, selection: { mode: 'replace', requestQuote: 'Select Aurora study for X draft preparation and run Previewizer first.', selector: { base: 'catalog', all: [{ field: 'title', value: 'Aurora study', requestQuote: 'Aurora study' }], any: [], none: [] } } };
    const state = setup([select, { kind: 'preparation_update', templateQuote: 'Square teaser', copyChoice: { kind: 'existing_titles', quote: 'keep their existing titles' } }], { adapterOptions: { beforeCommit: async () => { throw new Error('test failure'); } } });
    const session = await start(state.app), completed = await completeAuroraPreview(state, session);
    const review = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/x-draft/review').send({ sessionId: session.sessionId, revision: completed.snapshot.revision, postId: BENCH_IDS.posts[0] });
    const failed = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/x-draft/confirm').send({ sessionId: session.sessionId, reviewToken: review.body.data.reviewToken });
    expect(failed.status).toBe(500);
    expect(state.adapter.draftSize()).toBe(0);
    const removed = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/selection/toggle').send({ sessionId: session.sessionId, revision: review.body.data.revision, postId: BENCH_IDS.posts[0] });
    expect(removed.status).toBe(200);
    const mediaPath = `/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}/preview-media/${completed.previewMediaId}`;
    expect((await request(state.app).get(mediaPath)).status).toBe(404);
  });

  it('keeps the reviewed revision stable while draft persistence is awaiting its commit hook', async () => {
    const select = { kind: 'selection', preparation: { destination: 'x', destinationQuote: 'X', previewFirst: true, previewQuote: 'Previewizer first' }, selection: { mode: 'replace', requestQuote: 'Select Aurora study for X draft preparation and run Previewizer first.', selector: { base: 'catalog', all: [{ field: 'title', value: 'Aurora study', requestQuote: 'Aurora study' }], any: [], none: [] } } };
    let enterHook!: () => void, releaseHook!: () => void;
    const hookEntered = new Promise<void>(resolve => { enterHook = resolve; });
    const release = new Promise<void>(resolve => { releaseHook = resolve; });
    const state = setup([select, { kind: 'preparation_update', templateQuote: 'Square teaser', copyChoice: { kind: 'existing_titles', quote: 'keep their existing titles' } }], { adapterOptions: { beforeCommit: async () => { enterHook(); await release; } } });
    const session = await start(state.app), completed = await completeAuroraPreview(state, session);
    const review = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/x-draft/review').send({ sessionId: session.sessionId, revision: completed.snapshot.revision, postId: BENCH_IDS.posts[0] });
    expect(review.status).toBe(200);
    const confirming = request(state.app).post('/api/v1/editor-bench/schedule/conversation/x-draft/confirm').send({ sessionId: session.sessionId, reviewToken: review.body.data.reviewToken }).then(response => response);
    const reachedHook = await Promise.race([hookEntered.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1000))]);
    expect(reachedHook).toBe(true);
    const concurrentTurn = await turn(state.app, review.body.data, 'Clarify while the X draft is being confirmed.');
    expect(concurrentTurn.status).toBe(409);
    releaseHook();
    const confirmed = await confirming;
    expect(confirmed.status).toBe(201);
    expect(state.adapter.draftSize()).toBe(1);
  });

  it('rejects non-JPEG and stale attempts and releases cancelled provisional bytes', async () => {
    const selectionText = 'Select Aurora study for X draft preparation and run Previewizer first.';
    const select = { kind: 'selection', preparation: { destination: 'x', destinationQuote: 'X', previewFirst: true, previewQuote: 'run Previewizer first' }, selection: { mode: 'replace', requestQuote: selectionText, selector: { base: 'catalog', all: [{ field: 'title', value: 'Aurora study', requestQuote: 'Aurora study' }], any: [], none: [] } } };
    const state = setup([select, { kind: 'preparation_update', templateQuote: 'Square teaser', copyChoice: { kind: 'existing_titles', quote: 'keep their existing titles' } }, { kind: 'clarification', question: 'Please clarify.' }]);
    const session = await start(state.app);
    const selected = await turn(state.app, session, selectionText);
    const prepared = await turn(state.app, selected.body.data, 'Use Square teaser and keep their existing titles.');
    const opened = await request(state.app).post('/api/v1/editor-bench/schedule/conversation/preview/open').send({ sessionId: session.sessionId, revision: prepared.body.data.revision, postId: BENCH_IDS.posts[0], mediaId: BENCH_IDS.media[0] });
    const base = `/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}/preview/${opened.body.data.attempt.id}`;
    const fake = await request(state.app).post(`${base}/upload`).set('Content-Type', 'image/jpeg').send(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(fake.status).toBe(400);
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#123456' } }).png().toBuffer();
    const wrongMime = await request(state.app).post(`${base}/upload`).set('Content-Type', 'image/png').send(png);
    expect(wrongMime.status).toBe(400);
    const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#123456' } }).jpeg().toBuffer();
    const upload = await request(state.app).post(`${base}/upload`).set('Content-Type', 'image/jpeg').send(jpeg);
    expect(upload.status).toBe(200);
    const cancel = await request(state.app).post(`${base}/cancel`).send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.previewStatus[BENCH_IDS.posts[0]].status).toBe('pending');
    const discarded = await request(state.app).post(`${base}/complete`).send({ previewMediaId: upload.body.data.previewMediaId });
    expect(discarded.status).toBe(409);
    const changed = await turn(state.app, cancel.body.data, 'Please clarify the next step.');
    const stale = await request(state.app).post(`${base}/complete`).send({ previewMediaId: 'bench_preview_unknown' });
    expect(changed.body.data.status).toBe('clarification');
    expect(stale.status).toBe(409);
  });

  it('enforces preview byte caps, expires provisional bytes, and retains receipts across benign revision changes', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
      const { store, session } = preparedPreviewSession();
      const opened = beginConversationPreview(session, BENCH_IDS.posts[0], BENCH_IDS.media[0])!;
      expect(storeConversationPreviewUpload(session, opened.attempt, Buffer.alloc(MAX_BENCH_PREVIEW_BYTES + 1), store.retainedPreviewBytes())).toBeNull();
      const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#123456' } }).jpeg().toBuffer();
      expect(storeConversationPreviewUpload(session, opened.attempt, jpeg, store.retainedPreviewBytes())).not.toBeNull();
      expect(store.retainedPreviewBytes()).toBe(jpeg.byteLength);
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      reconcileConversationPreviews(session);
      expect(session.previewAttempt).toBeNull();
      expect(store.retainedPreviewBytes()).toBe(0);

      const retry = beginConversationPreview(session, BENCH_IDS.posts[0], BENCH_IDS.media[0])!;
      const uploaded = storeConversationPreviewUpload(session, retry.attempt, jpeg, store.retainedPreviewBytes())!;
      expect(completeConversationPreview(session, retry.attempt, uploaded.mediaId)).not.toBeNull();
      session.revision += 1;
      session.generation += 1;
      reconcileConversationPreviews(session);
      expect(session.previewReceipts.has(BENCH_IDS.posts[0])).toBe(true);
      const source = session.fixture.state.tables.versions.find(row => row.postId === BENCH_IDS.posts[0])!;
      source.title = 'Changed synthetic source title';
      reconcileConversationPreviews(session);
      expect(session.previewReceipts.has(BENCH_IDS.posts[0])).toBe(false);
      expect(store.retainedPreviewBytes()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('invalidates a completed preview when the preparation template is removed', async () => {
    const { store, session } = preparedPreviewSession();
    const opened = beginConversationPreview(session, BENCH_IDS.posts[0], BENCH_IDS.media[0])!;
    const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#123456' } }).jpeg().toBuffer();
    const uploaded = storeConversationPreviewUpload(session, opened.attempt, jpeg, store.retainedPreviewBytes())!;
    expect(completeConversationPreview(session, opened.attempt, uploaded.mediaId)).not.toBeNull();
    session.preparation = null;
    reconcileConversationPreviews(session);
    expect(session.previewReceipts.size).toBe(0);
    expect(store.retainedPreviewBytes()).toBe(0);
  });
});
