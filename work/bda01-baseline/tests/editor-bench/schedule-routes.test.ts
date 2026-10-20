import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { CreatorScheduleEventWire } from '../../src/distribution/creator-schedule-event-contract.js';
import type { EditorProvider } from '../../src/gallery-editor/provider.js';
import { CreatorScheduleEventPlanRequiredError, CreatorScheduleEventValidationError } from '../../src/distribution/creator-schedule-event-service.js';
import { BENCH_IDS } from '../../src/editor-bench/fixtures.js';
import { createBenchDistributionVariantAdapter, loadBenchVariantSource } from '../../src/editor-bench/distribution-variant-adapter.js';
import { registerBenchScheduleRoutes, type BenchScheduleEventFacts } from '../../src/editor-bench/schedule-routes.js';
import { variantChatInputBytes } from '../../src/editor-bench/variant-chat.js';

const latestRequest = 'Prepare a Patreon post titled Aurora at 17:30 Europe/London on 2026-10-20';
const body = {
  latestRequest,
  selectedPostIds: [BENCH_IDS.posts[0]],
  selectedMediaIds: [BENCH_IDS.media[0]],
  structuredIntent: {
    base_revision: null, outcome: 'proposal', question: null,
    requests: [{
      command: 'add', target_handle: null, changed_fields: [], kind: 'primary_draft', source_ref: { mode: 'selection', id: null },
      destination: 'patreon', title_mode: 'literal', title_text: 'Aurora', template_ref: { mode: 'none', value: null },
      enabled: true, delivery_intent: 'prepare_for_creator_handoff', social_action: null, time_kind: 'absolute_local',
      local_date: '2026-10-20', weekday: null, weekday_qualifier: null, timezone: 'Europe/London', day_offset: null,
      target_destination: null, local_time: '17:30', time_text: '17:30 Europe/London on 2026-10-20', request_quote: latestRequest,
    }],
  },
};
const direct = (destination: 'x' | 'deviantart', day = '2026-10-24') => ({
  ...body, latestRequest: `Create a ${destination} cue titled Aurora at 10:00 Europe/London on ${day}`,
  structuredIntent: { kind: 'manual_posting_event', destination, source_ref: { mode: 'selection', id: null }, title_text: 'Aurora', time_kind: 'absolute_local', local_date: day, weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: `10:00 Europe/London on ${day}` },
});
function wire(creatorId: string, eventId: string, payload: any): CreatorScheduleEventWire {
  return {
    id: eventId, source: 'manual_event', event_type: 'make_post', action: 'post', destination: payload.destination,
    note: payload.note, due_at: payload.due_at, post_id: payload.post_id ?? null, media_ids: payload.media_ids ?? [], external_url: payload.external_url ?? null, remind_me: false, status: 'pending',
    created_at: '2026-10-17T12:00:00.000Z', updated_at: '2026-10-17T12:00:00.000Z',
  };
}
function facts(payload: any): BenchScheduleEventFacts {
  return { eventType: payload.event_type, destination: payload.destination, title: payload.title, note: payload.note,
    dueAt: new Date(payload.due_at), postId: payload.post_id ?? null, externalUrl: payload.external_url ?? null, remindMe: false, mediaIds: payload.media_ids ?? [] };
}
function setup(overrides: Record<string, any> = {}) {
  const rows = new Map<string, { creatorId: string; event: CreatorScheduleEventWire; facts: BenchScheduleEventFacts }>();
  const authenticateCreator = vi.fn(async () => overrides.principal ?? { creatorId: 'creator-1', accountId: 'account-1' });
  const guardMutation = vi.fn(async () => overrides.guardResult ?? true);
  const assertCorePlan = vi.fn(async () => { if (overrides.planRequired) throw new CreatorScheduleEventPlanRequiredError(); });
  const librarySource = { postId: 'real-post-1', versionId: 'version-3', title: 'Aurora Study', media: [
    { id: 'real-media-1', label: 'Panel 1 · image/png', mime: 'image/png', processingStatus: 'READY' },
    { id: 'real-media-2', label: 'Panel 2 · image/png', mime: 'image/png', processingStatus: 'READY' },
  ] };
  const createEvent = vi.fn(async (creatorId: string, payload: any, eventId: string, attachment?: { postId: string; versionId: string; mediaIds: string[] }) => {
    if (overrides.createError) throw overrides.createError;
    if (attachment && attachment.versionId !== librarySource.versionId) throw new CreatorScheduleEventValidationError('The Library source changed.');
    if (rows.has(eventId)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
    const event = { ...wire(creatorId, eventId, payload), media_ids: attachment?.mediaIds ?? [] };
    rows.set(eventId, { creatorId, event, facts: { ...facts(payload), postId: attachment?.postId ?? payload.post_id ?? null, mediaIds: attachment?.mediaIds ?? [] } });
    return event;
  });
  const readEvent = vi.fn(async (creatorId: string, eventId: string) => {
    const item = rows.get(eventId);
    return item?.creatorId === creatorId ? { event: item.event, facts: item.facts } : null;
  });
  const getLibrarySource = vi.fn(async () => librarySource);
  const validateLibraryAttachment = vi.fn(async (_creatorId: string, binding: { postId: string; versionId: string; mediaIds: string[] }) => {
    if (binding.postId !== librarySource.postId || binding.versionId !== librarySource.versionId) throw Object.assign(new Error('source changed'), { statusCode: 400 });
    const media = binding.mediaIds.map(id => librarySource.media.find(item => item.id === id));
    if (media.some(item => !item)) throw Object.assign(new Error('media unavailable'), { statusCode: 400 });
    return { ...librarySource, media: media as typeof librarySource.media };
  });
  const distributionVariantAdapter = overrides.mockVariant ? createBenchDistributionVariantAdapter(overrides.adapterOptions) : undefined;
  const loadVariantSource = vi.fn(async (_creatorId: string, postId: string, mediaIds: string[]) => overrides.sourceLoader
    ? overrides.sourceLoader(postId, mediaIds)
    : loadBenchVariantSource(postId, mediaIds));
  const app = express();
  app.use(express.json({ limit: '112kb' }));
  registerBenchScheduleRoutes(app, {
    development: overrides.development ?? true, signingSecret: overrides.secret ?? Buffer.alloc(32, 7),
    traceId: () => 'trace-test', authenticateCreator, guardMutation, assertCorePlan, createEvent, readEvent, getLibrarySource, validateLibraryAttachment,
    ...(distributionVariantAdapter ? { distributionVariantAdapter, loadBenchVariantSource: loadVariantSource } : {}),
    ...(overrides.getVariantEditProvider ? { getVariantEditProvider: overrides.getVariantEditProvider } : {}),
  });
  return { app, authenticateCreator, guardMutation, assertCorePlan, createEvent, readEvent, getLibrarySource, validateLibraryAttachment, librarySource, rows, distributionVariantAdapter, loadVariantSource };
}
async function reviewed(app: express.Express, input = body) {
  const response = await request(app).post('/api/v1/editor-bench/schedule/review').send(input);
  return { response, data: response.body.data };
}
async function createdVariant(state: ReturnType<typeof setup>, destination: 'x' | 'deviantart' = 'x') {
  const { data } = await reviewed(state.app, direct(destination));
  const response = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
  return { creationReview: data, creation: response.body.data, variant: response.body.data.receipt.variant, event: response.body.data.event };
}
async function editReviewed(app: express.Express, variantId: string, expectedRevision: number, newText: string) {
  const response = await request(app).post('/api/v1/editor-bench/schedule/variant-edit/review').send({ variantId, expectedRevision, newText });
  return { response, data: response.body.data };
}
function editChatProvider(decision: unknown, afterRespond?: () => Promise<void>) {
  return { respond: vi.fn(async (_request: Parameters<EditorProvider['respond']>[0]) => {
    await afterRespond?.();
    return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: decision }) }] }], usage: { calls: 1, inputTokens: 20, outputTokens: 10 } };
  }) };
}

describe('editor bench schedule routes', () => {
  it('uses one read-only model interpretation to prepare an explicit quoted edit, then requires separate confirmation', async () => {
    const provider = editChatProvider({ decision: 'edit', candidateHandle: 'draft-1', targetReferenceQuote: 'X', replacementQuote: '“Aurora at dawn”', newText: 'Aurora at dawn', requestQuote: 'For X, replace it with “Aurora at dawn”.' });
    const state = setup({ mockVariant: true, getVariantEditProvider: async () => provider as any });
    const created = await createdVariant(state, 'x');
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: 'For X, replace it with “Aurora at dawn”.' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ decision: 'review', oldText: 'Aurora', newText: 'Aurora at dawn', expectedRevision: 0 });
    expect(response.body.data.reviewToken).toBeTruthy();
    expect(provider.respond).toHaveBeenCalledTimes(1);
    expect(provider.respond.mock.calls[0]![0].tools).toEqual([]);
    expect(state.distributionVariantAdapter!.snapshot()[0].variant.postText).toBe('Aurora');
    const confirmed = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: response.body.data.reviewToken });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data.receipt.variant.id).toBe(created.variant.id);
  });

  it('grounds the exact initial X caption request without changing its quoted copy', async () => {
    const latestRequest = 'Change the X caption to "A first look at Aurora Study—full release tomorrow."';
    const provider = editChatProvider({ decision: 'edit', candidateHandle: 'draft-1', targetReferenceQuote: 'X',
      replacementQuote: '"A first look at Aurora Study—full release tomorrow."', newText: 'A first look at Aurora Study—full release tomorrow.', requestQuote: latestRequest });
    const state = setup({ mockVariant: true, getVariantEditProvider: async () => provider as any });
    const created = await createdVariant(state, 'x');
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ decision: 'review', diagnostic: 'review_ready', destination: 'x', oldText: 'Aurora',
      newText: 'A first look at Aurora Study—full release tomorrow.', expectedRevision: 0 });
    expect(response.body.data.reviewToken).toBeTruthy();
    expect(state.distributionVariantAdapter!.snapshot()[0].variant.postText).toBe(created.variant.postText);
  });

  it('clarifies vague or unquoted replacement requests without producing a review token', async () => {
    const provider = editChatProvider({ decision: 'edit', candidateHandle: 'draft-1', targetReferenceQuote: 'Aurora', replacementQuote: 'punchier', newText: 'punchier', requestQuote: 'Make Aurora punchier.' });
    const state = setup({ mockVariant: true, getVariantEditProvider: async () => provider as any });
    await createdVariant(state, 'x');
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: 'Make Aurora punchier.' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ decision: 'clarification' });
    expect(response.body.data.reviewToken).toBeUndefined();
    expect(state.distributionVariantAdapter!.snapshot()[0].variant.postText).toBe('Aurora');
  });

  it('clarifies destination-only references when multiple eligible drafts share that destination', async () => {
    const provider = editChatProvider({ decision: 'edit', candidateHandle: 'draft-1', targetReferenceQuote: 'X', replacementQuote: '“Aurora at dawn”', newText: 'Aurora at dawn', requestQuote: 'For X, replace with “Aurora at dawn”.' });
    const state = setup({ mockVariant: true, getVariantEditProvider: async () => provider as any });
    await createdVariant(state, 'x');
    const secondReview = await reviewed(state.app, direct('x', '2026-10-25'));
    await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: secondReview.data.reviewToken });
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: 'For X, replace with “Aurora at dawn”.' });
    expect(response.body.data).toMatchObject({ decision: 'clarification' });
    expect(response.body.data.reviewToken).toBeUndefined();
  });

  it('requires a real destination token outside the replacement text', async () => {
    const provider = editChatProvider({ decision: 'edit', candidateHandle: 'draft-1', targetReferenceQuote: 'x', replacementQuote: '“New”', newText: 'New', requestQuote: 'Please fix the text to “New”.' });
    const state = setup({ mockVariant: true, getVariantEditProvider: async () => provider as any });
    await createdVariant(state, 'x');
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: 'Please fix the text to “New”.' });
    expect(response.body.data).toMatchObject({ decision: 'clarification' });
    expect(response.body.data.reviewToken).toBeUndefined();
  });

  it('rechecks the target revision after interpretation and returns clarification on a concurrent edit', async () => {
    let concurrentMutation = async () => {};
    const provider = editChatProvider({ decision: 'edit', candidateHandle: 'draft-1', targetReferenceQuote: 'X', replacementQuote: '“Aurora at dawn”', newText: 'Aurora at dawn', requestQuote: 'For X, replace it with “Aurora at dawn”.' }, async () => {
      await concurrentMutation();
    });
    const state = setup({ mockVariant: true, getVariantEditProvider: async () => provider as any });
    const created = await createdVariant(state, 'x');
    concurrentMutation = async () => {
      const directReview = await editReviewed(state.app, created.variant.id, 0, 'Concurrent update');
      await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: directReview.data.reviewToken });
    };
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: 'For X, replace it with “Aurora at dawn”.' });
    expect(response.body.data).toMatchObject({ decision: 'clarification' });
    expect(response.body.data.reviewToken).toBeUndefined();
  });

  it('fails closed on malformed envelopes, invented text, replacement-only targets, and a mismatched handle', async () => {
    const requestText = 'For X, replace it with “Aurora at dawn”.';
    const cases = [
      { name: 'malformed envelope', diagnostic: 'invalid_envelope_or_literal_grounding', output: { result: { decision: 'clarification', question: 'Which draft?' }, extra: true } },
      { name: 'invented replacement', diagnostic: 'invalid_envelope_or_literal_grounding', output: { result: { decision: 'edit', candidateHandle: 'draft-1', targetReferenceQuote: 'X', replacementQuote: '“Aurora at dawn”', newText: 'Aurora at dusk', requestQuote: requestText } } },
      { name: 'target only inside replacement', diagnostic: 'invalid_envelope_or_literal_grounding', request: 'Replace with “X”.', output: { result: { decision: 'edit', candidateHandle: 'draft-1', targetReferenceQuote: 'X', replacementQuote: '“X”', newText: 'X', requestQuote: 'Replace with “X”.' } } },
      { name: 'mismatched handle', diagnostic: 'target_ambiguity', output: { result: { decision: 'edit', candidateHandle: 'draft-2', targetReferenceQuote: 'X', replacementQuote: '“Aurora at dawn”', newText: 'Aurora at dawn', requestQuote: requestText } } },
    ];
    for (const row of cases) {
      const provider = { respond: vi.fn(async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(row.output) }] }] })) };
      const state = setup({ mockVariant: true, getVariantEditProvider: async () => provider as any });
      await createdVariant(state, 'x');
      const response = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: row.request ?? requestText });
      expect(response.status, row.name).toBe(200);
      expect(response.body.data.decision, row.name).toBe('clarification');
      expect(response.body.data.diagnostic, row.name).toBe(row.diagnostic);
      expect(response.body.data.reviewToken, row.name).toBeUndefined();
      expect(state.distributionVariantAdapter!.snapshot()[0].variant.postText, row.name).toBe('Aurora');
    }
  });

  it('preflights empty, foreign, oversized catalogs and unavailable providers without writes or calls', async () => {
    const neverProvider = { respond: vi.fn(async () => ({ output: [] })) };
    const empty = setup({ mockVariant: true, getVariantEditProvider: async () => neverProvider as any });
    const emptyResponse = await request(empty.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: 'For X replace it with “Aurora at dawn”.' });
    expect(emptyResponse.body.data.decision).toBe('clarification');
    expect(neverProvider.respond).not.toHaveBeenCalled();

    const foreign = setup({ mockVariant: true, getVariantEditProvider: async () => neverProvider as any });
    await createdVariant(foreign, 'x');
    foreign.authenticateCreator.mockResolvedValue({ creatorId: 'creator-2', accountId: 'account-2' } as any);
    const foreignResponse = await request(foreign.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: 'For X replace it with “Aurora at dawn”.' });
    expect(foreignResponse.body.data.decision).toBe('clarification');
    expect(neverProvider.respond).not.toHaveBeenCalled();

    const oversized = setup({ mockVariant: true, getVariantEditProvider: async () => neverProvider as any });
    await createdVariant(oversized, 'x');
    const oversizedRows = oversized.distributionVariantAdapter!.snapshot();
    oversizedRows[0]!.variant.postText = 'T'.repeat(9000);
    vi.spyOn(oversized.distributionVariantAdapter!, 'listEditableVariants').mockReturnValue(oversizedRows);
    const oversizedResponse = await request(oversized.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: 'For X replace it with “Aurora at dawn”.' });
    expect(oversizedResponse.body.data.decision).toBe('clarification');
    expect(neverProvider.respond).not.toHaveBeenCalled();

    const disabled = setup({ mockVariant: true, getVariantEditProvider: async () => null });
    await createdVariant(disabled, 'x');
    const disabledResponse = await request(disabled.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: 'For X replace it with “Aurora at dawn”.' });
    expect(disabledResponse.body.data.decision).toBe('clarification');
    expect(disabled.distributionVariantAdapter!.snapshot()[0].variant.postText).toBe('Aurora');

    const brokenProvider = { respond: vi.fn(async () => { throw new Error('provider unavailable'); }) };
    const failed = setup({ mockVariant: true, getVariantEditProvider: async () => brokenProvider as any });
    await createdVariant(failed, 'x');
    const failedResponse = await request(failed.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: 'For X replace it with “Aurora at dawn”.' });
    expect(failedResponse.status).toBe(503);
    expect(failed.distributionVariantAdapter!.snapshot()[0].variant.postText).toBe('Aurora');
  });

  it('preflights the exact total provider payload byte ceiling', async () => {
    const provider = { respond: vi.fn(async () => ({ output: [] })) };
    const state = setup({ mockVariant: true, getVariantEditProvider: async () => provider as any });
    await createdVariant(state, 'x');
    const rows = state.distributionVariantAdapter!.snapshot();
    const latestRequest = '漢'.repeat(4000);
    const candidate = { handle: 'draft-1', destination: 'x' as const, currentText: 'T'.repeat(7000), currentRevision: 0, sourceTitle: 'Aurora' };
    const sizes = variantChatInputBytes(latestRequest, [candidate]);
    expect(sizes.candidateBytes).toBeLessThanOrEqual(8192);
    expect(sizes.totalBytes).toBeGreaterThan(16384);
    rows[0]!.variant.postText = candidate.currentText;
    vi.spyOn(state.distributionVariantAdapter!, 'listEditableVariants').mockReturnValue(rows);
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest });
    expect(response.body.data.decision).toBe('clarification');
    expect(provider.respond).not.toHaveBeenCalled();
  });
  it('reviews the exact X copy read-only and atomically creates an ephemeral linked draft trio', async () => {
    const state = setup({ mockVariant: true });
    const { data } = await reviewed(state.app, direct('x'));
    expect(data.reviewKind).toBe('direct_manual');
    expect(data.variantPreview.variant.postText).toBe('Aurora');
    expect(data.variantPreview.variant.postText).not.toContain('#');
    expect(data.variantPreview.sourceVersion.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(state.distributionVariantAdapter!.size()).toBe(0);
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ reused: false, event: { status: 'pending', post_id: null }, receipt: { scope: 'development_mock_only', ephemeral: true, variant: { status: 'draft', postText: 'Aurora', attempts: [] } } });
    expect(response.body.data.receipt.plan.assistantPlan.bench_source_v1).toBeTruthy();
    expect(state.createEvent).not.toHaveBeenCalled();
    expect(state.distributionVariantAdapter!.size()).toBe(1);
  });

  it('revalidates source fingerprint before readback and refuses changed effective copy', async () => {
    let source = loadBenchVariantSource(BENCH_IDS.posts[0], [BENCH_IDS.media[0]])!;
    const state = setup({ mockVariant: true, sourceLoader: () => structuredClone(source) });
    const { data } = await reviewed(state.app, direct('x'));
    source = { ...source, description: 'Edited after review' };
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
    expect(response.status).toBe(409);
    expect(state.distributionVariantAdapter!.size()).toBe(0);
    expect(state.loadVariantSource).toHaveBeenCalledTimes(2);
  });

  it('reuses only identical confirmations and keeps separately reviewed cues as separate trios', async () => {
    const state = setup({ mockVariant: true });
    const { data } = await reviewed(state.app, direct('deviantart'));
    const [first, retry] = await Promise.all([
      request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken }),
      request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken }),
    ]);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.reused).toBe(true);
    expect(retry.body.data.receipt.variant.id).toBe(first.body.data.receipt.variant.id);
    expect(first.body.data.receipt.variant.title).toBe('Aurora');
    expect(first.body.data.receipt.variant.advice.bench_source_v1).toBeTruthy();
    const secondReview = await reviewed(state.app, direct('deviantart', '2026-10-25'));
    const second = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: secondReview.data.reviewToken });
    expect(second.status).toBe(201);
    expect(second.body.data.receipt.variant.id).not.toBe(first.body.data.receipt.variant.id);
    expect(state.distributionVariantAdapter!.size()).toBe(2);
  });

  it('leaves zero records when the injected mock commit fails', async () => {
    const state = setup({ mockVariant: true, adapterOptions: { beforeCommit: () => { throw new Error('injected failure'); } } });
    const { data } = await reviewed(state.app, direct('x'));
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
    expect(response.status).toBe(500);
    expect(state.distributionVariantAdapter!.size()).toBe(0);
  });

  it('conflicts when saved facts differ under the same deterministic mock identity', async () => {
    const adapter = createBenchDistributionVariantAdapter();
    const create = () => ({ plan: {}, variant: {}, event: {} });
    await adapter.commit('same-identity', { source: 'v1' }, create);
    await expect(adapter.commit('same-identity', { source: 'v2' }, create)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(adapter.size()).toBe(1);
  });

  it('reviews and confirms literal text edits on the same X draft and linked pending event', async () => {
    const state = setup({ mockVariant: true });
    const created = await createdVariant(state, 'x');
    const reviewedEdit = await editReviewed(state.app, created.variant.id, 0, 'Aurora at dawn');
    expect(reviewedEdit.response.status).toBe(200);
    expect(reviewedEdit.data).toMatchObject({ unchanged: false, oldText: 'Aurora', newText: 'Aurora at dawn', expectedRevision: 0,
      sourceVersionKey: created.variant.advice.bench_source_v1.source.version_key,
      sourceFingerprint: created.variant.advice.bench_source_v1.source.fingerprint,
      fieldDiff: { field: 'postText', before: 'Aurora', after: 'Aurora at dawn' } });
    expect(state.distributionVariantAdapter!.snapshot()[0].variant.postText).toBe('Aurora');
    const confirmed = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: reviewedEdit.data.reviewToken });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data).toMatchObject({ reused: false, revision: 1,
      receipt: { variant: { id: created.variant.id, postText: 'Aurora at dawn', status: 'draft' }, event: { id: created.event.id, title: 'Aurora at dawn', status: 'pending' } } });
    expect(confirmed.body.data.receipt.variant.advice.bench_source_v1).toEqual(created.variant.advice.bench_source_v1);
    expect(confirmed.body.data.receipt.variant.advice.bench_variant_revisions_v1.revisions).toHaveLength(2);
    expect(confirmed.body.data.receipt.variant.tags).toEqual(created.variant.tags);
    expect(confirmed.body.data.receipt.variant.scheduledFor).toBe(created.variant.scheduledFor);
  });

  it('appends revisions and replays each exact edit receipt without reverting later text', async () => {
    const state = setup({ mockVariant: true });
    const created = await createdVariant(state, 'deviantart');
    const firstReview = await editReviewed(state.app, created.variant.id, 0, 'Aurora first edit');
    const first = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: firstReview.data.reviewToken });
    const secondReview = await editReviewed(state.app, created.variant.id, 1, 'Aurora second edit');
    const second = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: secondReview.data.reviewToken });
    const firstRetry = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: firstReview.data.reviewToken });
    const secondRetry = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: secondReview.data.reviewToken });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(firstRetry.status).toBe(200);
    expect(secondRetry.status).toBe(200);
    expect(firstRetry.body.data).toMatchObject({ reused: true, revision: 1, receipt: { variant: { title: 'Aurora first edit' }, event: { title: 'Aurora first edit' } } });
    expect(secondRetry.body.data).toMatchObject({ reused: true, revision: 2, receipt: { variant: { title: 'Aurora second edit' } } });
    const current = state.distributionVariantAdapter!.snapshot()[0];
    expect(current.variant.title).toBe('Aurora second edit');
    expect(current.variant.advice.bench_variant_revisions_v1.revisions.map((row: any) => row.revision)).toEqual([0, 1, 2]);
  });

  it('allows one of two revision-zero edit tokens to win and exposes only the owned current revision', async () => {
    const state = setup({ mockVariant: true });
    const created = await createdVariant(state, 'x');
    const a = await editReviewed(state.app, created.variant.id, 0, 'First contender');
    const b = await editReviewed(state.app, created.variant.id, 0, 'Second contender');
    const [one, two] = await Promise.all([
      request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: a.data.reviewToken }),
      request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: b.data.reviewToken }),
    ]);
    expect([one.status, two.status].filter(status => status === 201)).toHaveLength(1);
    expect([one.status, two.status].filter(status => status === 409)).toHaveLength(1);
    const stale = one.status === 409 ? one : two;
    expect(stale.body.error.current_revision).toBe(1);
    expect(state.distributionVariantAdapter!.snapshot()[0].variant.advice.bench_variant_revisions_v1.revisions).toHaveLength(2);
  });

  it('returns no token for no-op, refuses invalid and foreign edits, and keeps a creation retry immutable', async () => {
    const state = setup({ mockVariant: true });
    const created = await createdVariant(state, 'x');
    const unchanged = await editReviewed(state.app, created.variant.id, 0, 'Aurora');
    expect(unchanged.data).toMatchObject({ unchanged: true, oldText: 'Aurora', newText: 'Aurora' });
    expect(unchanged.data).not.toHaveProperty('reviewToken');
    const invalidText = await editReviewed(state.app, created.variant.id, 0, '  bad  ');
    expect(invalidText.response.status).toBe(400);
    const foreign = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/review').send({ variantId: 'bench_variant_unknown', expectedRevision: 0, newText: 'Other' });
    expect(foreign.status).toBe(404);
    const review = await editReviewed(state.app, created.variant.id, 0, 'Edited once');
    const confirmed = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: review.data.reviewToken });
    expect(confirmed.status).toBe(201);
    const creationRetry = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: created.creationReview.reviewToken });
    expect(creationRetry.status).toBe(200);
    expect(creationRetry.body.data.receipt.variant.postText).toBe('Aurora');
    expect(state.distributionVariantAdapter!.snapshot()[0].variant.postText).toBe('Edited once');
    const wrongEndpoint = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: review.data.reviewToken });
    expect(wrongEndpoint.status).toBe(409);
  });

  it('enforces creator, expiry, tamper, and mutation-guard checks for edit tokens', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
      const state = setup({ mockVariant: true });
      const created = await createdVariant(state, 'x');
      const review = await editReviewed(state.app, created.variant.id, 0, 'Guarded edit');
      state.guardMutation.mockResolvedValue(false);
      const locked = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: review.data.reviewToken });
      expect(locked.status).toBe(423);
      state.guardMutation.mockResolvedValue(true);
      state.authenticateCreator.mockResolvedValue({ creatorId: 'creator-2', accountId: 'account-2' });
      const foreign = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: review.data.reviewToken });
      expect(foreign.status).toBe(403);
      state.authenticateCreator.mockResolvedValue({ creatorId: 'creator-1', accountId: 'account-1' });
      const [encoded, signature] = review.data.reviewToken.split('.');
      const tampered = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: `${encoded}.${signature.slice(0, -1)}x` });
      expect(tampered.status).toBe(409);
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      const expired = await request(state.app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: review.data.reviewToken });
      expect(expired.status).toBe(409);
      expect(state.distributionVariantAdapter!.snapshot()[0].variant.postText).toBe('Aurora');
    } finally { vi.useRealTimers(); }
  });
  it('reviews without writing and uses a read-only session lookup', async () => {
    const state = setup();
    const { response, data } = await reviewed(state.app);
    expect(response.status).toBe(200);
    expect(data.review.createPayload).toMatchObject({ event_type: 'make_post', post_id: null, external_url: null, create_relay_draft: false, remind_me: false });
    expect(data.reviewToken).toEqual(expect.any(String));
    expect(state.authenticateCreator).toHaveBeenCalledWith(expect.anything(), { readonlySession: true });
    expect(state.createEvent).not.toHaveBeenCalled();
    expect(state.rows.size).toBe(0);
  });

  it('persists only after confirm and returns the persisted manual event', async () => {
    const state = setup();
    const { data } = await reviewed(state.app);
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ reused: false, event: { source: 'manual_event', event_type: 'make_post', post_id: null, external_url: null, remind_me: false } });
    expect(state.guardMutation).toHaveBeenCalledOnce();
    expect(state.rows.size).toBe(1);
  });

  it('reuses a saved Library event after its source version changes, while rechecking Core access', async () => {
    const state = setup();
    const latestRequest = 'Schedule an X cue titled Aurora at 17:30 Europe/London on 2026-10-20';
    const review = await request(state.app).post('/api/v1/editor-bench/schedule/library/review').send({
      latestRequest,
      source: { postId: 'real-post-1', versionId: 'version-3', mediaIds: ['real-media-1'] },
      intent: { kind: 'real_library_manual_events', events: [
        { destination: 'x', title_text: 'Aurora', time_kind: 'absolute_local', local_date: '2026-10-20', weekday: null, weekday_qualifier: null, local_time: '17:30', timezone: 'Europe/London', time_text: '17:30 Europe/London on 2026-10-20' },
      ] },
    });
    expect(review.status).toBe(200);
    const token = review.body.data.items[0].reviewToken;
    const first = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: token });
    expect(first.status).toBe(201);

    state.librarySource.versionId = 'version-4';
    const retry = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: token });
    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({ reused: true, event: { id: first.body.data.event.id, post_id: 'real-post-1', media_ids: ['real-media-1'] } });
    expect(state.assertCorePlan).toHaveBeenCalledTimes(2);
    expect(state.createEvent).toHaveBeenCalledTimes(1);
    expect(state.rows.size).toBe(1);
  });

  it('signs and persists X and DeviantArt destinations as distinct manual events', async () => {
    const state = setup();
    const create = (destination: 'x' | 'deviantart') => ({
      ...body,
      latestRequest: `Create a ${destination} cue titled Aurora at 17:30 Europe/London on 2026-10-20`,
      structuredIntent: { kind: 'manual_posting_event', destination, source_ref: { mode: 'selection', id: null }, title_text: 'Aurora', time_kind: 'absolute_local', local_date: '2026-10-20', weekday: null, weekday_qualifier: null, local_time: '17:30', timezone: 'Europe/London', time_text: '17:30 Europe/London on 2026-10-20' },
    });
    const xReview = await reviewed(state.app, create('x'));
    const daReview = await reviewed(state.app, create('deviantart'));
    expect(xReview.data.reviewKind).toBe('direct_manual');
    expect(xReview.data.review.createPayload.destination).toBe('x');
    expect(daReview.data.review.createPayload.destination).toBe('deviantart');
    const xSaved = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: xReview.data.reviewToken });
    const daSaved = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: daReview.data.reviewToken });
    expect(xSaved.body.data.event.destination).toBe('x');
    expect(daSaved.body.data.event.destination).toBe('deviantart');
    expect(xSaved.body.data.event.id).not.toBe(daSaved.body.data.event.id);
    expect(state.rows.size).toBe(2);
  });

  it('returns independently signed batch rows and confirms only the chosen event', async () => {
    const state = setup();
    const latest = 'Schedule X Aurora thread on 2026-10-24 at 10:00 Europe/London and Patreon Aurora supporter on 2026-10-25 at 11:30 Europe/London';
    const batch = {
      latestRequest: latest,
      selectedPostIds: [BENCH_IDS.posts[0]], selectedMediaIds: [BENCH_IDS.media[0]],
      structuredIntent: { kind: 'manual_posting_batch', source_ref: { mode: 'selection', id: null }, events: [
        { destination: 'x', title_text: 'Aurora thread', time_kind: 'absolute_local', local_date: '2026-10-24', weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: '2026-10-24 at 10:00 Europe/London' },
        { destination: 'patreon', title_text: 'Aurora supporter', time_kind: 'absolute_local', local_date: '2026-10-25', weekday: null, weekday_qualifier: null, local_time: '11:30', timezone: 'Europe/London', time_text: '2026-10-25 at 11:30 Europe/London' },
      ] },
    };
    const invalidLater = { ...batch, structuredIntent: { ...batch.structuredIntent, events: [batch.structuredIntent.events[0], { ...batch.structuredIntent.events[1], title_text: 'Invented title' }] } };
    const refused = await request(state.app).post('/api/v1/editor-bench/schedule/review').send(invalidLater);
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).not.toContain('reviewToken');
    expect(refused.body).not.toHaveProperty('data.items');
    expect(state.createEvent).not.toHaveBeenCalled();
    expect(state.rows.size).toBe(0);
    const { response, data } = await reviewed(state.app, batch);
    expect(response.status).toBe(200);
    expect(data.reviewKind).toBe('manual_batch');
    expect(data.items.map((item: any) => item.destination)).toEqual(['patreon', 'x']);
    expect(data.items[0].reviewToken).not.toBe(data.items[1].reviewToken);
    expect(data.items.map((item: any) => item.expiresAt)).toEqual([data.items[0].expiresAt, data.items[0].expiresAt]);
    expect(state.createEvent).not.toHaveBeenCalled();
    const xItem = data.items.find((item: any) => item.destination === 'x');
    const first = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: xItem.reviewToken });
    const retry = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: xItem.reviewToken });
    expect(first.status).toBe(201);
    expect(first.body.data.event).toMatchObject({ destination: 'x' });
    expect(state.createEvent).toHaveBeenNthCalledWith(1, 'creator-1', expect.objectContaining({ destination: 'x', title: 'Aurora thread' }), expect.any(String), undefined);
    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({ reused: true, event: { id: first.body.data.event.id } });
    expect(state.rows.size).toBe(1);
    expect(state.createEvent).toHaveBeenCalledTimes(2);
  });

  it('reuses an identical event after a lost confirm response or a repeated click', async () => {
    const state = setup();
    const { data } = await reviewed(state.app);
    const first = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
    const second = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ reused: true, event: { id: first.body.data.event.id } });
    expect(state.rows.size).toBe(1);
  });

  it('rejects a creator mismatch before the write guard or event service', async () => {
    const state = setup();
    const { data } = await reviewed(state.app);
    state.authenticateCreator.mockResolvedValue({ creatorId: 'creator-2', accountId: 'account-2' });
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
    expect(response.status).toBe(403);
    expect(state.guardMutation).not.toHaveBeenCalled();
    expect(state.createEvent).not.toHaveBeenCalled();
  });

  it('rejects edited and expired tokens without writing', async () => {
    const state = setup();
    const { data } = await reviewed(state.app);
    const [encoded, signature] = data.reviewToken.split('.');
    const edited = `${encoded}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: edited });
    expect(response.status).toBe(409);
    expect(state.createEvent).not.toHaveBeenCalled();
  });

  it('rejects an expired review token without writing', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
      const state = setup();
      const { data } = await reviewed(state.app);
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      const response = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
      expect(response.status).toBe(409);
      expect(state.createEvent).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('does not create an event when the Studio mutation guard blocks confirm', async () => {
    const state = setup({ guardResult: false });
    const { data } = await reviewed(state.app);
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
    expect(response.status).toBe(423);
    expect(state.createEvent).not.toHaveBeenCalled();
  });

  it('surfaces the service Studio Core gate as a plan-required response', async () => {
    const state = setup({ createError: new CreatorScheduleEventPlanRequiredError() });
    const { data } = await reviewed(state.app);
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({ error: 'plan_required', required_plan: 'studio_core' });
  });

  it('conflicts when the deterministic event ID exists with different saved facts', async () => {
    const state = setup({ createError: Object.assign(new Error('duplicate'), { code: 'P2002' }) });
    const { data } = await reviewed(state.app);
    state.readEvent.mockResolvedValue({
      event: wire('creator-1', 'same-id', data.review.createPayload),
      facts: { ...facts(data.review.createPayload), title: 'Different saved title' },
    });
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: data.reviewToken });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('returns 404 unless development mode is explicitly enabled', async () => {
    const state = setup({ development: false });
    const response = await request(state.app).post('/api/v1/editor-bench/schedule/review').send(body);
    expect(response.status).toBe(404);
    expect(state.authenticateCreator).not.toHaveBeenCalled();
  });
});
