import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { EditorProvider } from '../../src/gallery-editor/provider.js';
import { registerRealLibraryConversationRoutes } from '../../src/editor-bench/real-library-conversation-routes.js';
import type { LargeRealLibrarySnapshot, RealLibraryPost } from '../../src/editor-bench/library-selection-catalog.js';

function makeSnapshot(revision: string, count = 55): LargeRealLibrarySnapshot {
  const posts: RealLibraryPost[] = Array.from({ length: count }, (_, index) => ({
    postId: `post_${String(index).padStart(3, '0')}`, title: `Unique ${index}`, descriptionText: `description ${index}`,
    tags: index === 2 ? ['coastal', 'red'] : index === 54 ? ['forest'] : ['coastal'], createdAt: '2026-10-18', publishedAt: '2026-10-19', publishState: 'published',
    workId: null, workTitle: null, seriesId: null, seriesTitle: null, collectionIds: [], collections: [],
    media: [{ id: `media_${index}`, mimeType: 'image/jpeg', role: 'main', processingStatus: 'READY' }]
  }));
  return { scope: 'real_library_retrieval', catalogRevision: revision, complete: true, supportedFields: ['post_id','tag','title','description','created_date','published_date','publish_state','media_type','media_role','processing_status','work_id','series_id','collection_id'], timezone: 'Europe/London', posts };
}
function modelProvider(result: unknown, onRespond?: (input: unknown) => void): EditorProvider {
  return { async respond(request) {
    onRespond?.(request.input);
    return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }], usage: { inputTokens: 40, outputTokens: 11, costUsd: 0.0001 } };
  } };
}
function appFor(options: {
  getSnapshot: (accountId: string, creatorId: string, signal?: AbortSignal) => Promise<LargeRealLibrarySnapshot>;
  provider?: EditorProvider;
  providerCalls?: () => void;
  development?: boolean;
}) {
  const app = express();
  app.use(express.json());
  registerRealLibraryConversationRoutes(app, {
    development: options.development ?? true,
    traceId: () => 'pcb01-test',
    authenticateCreator: async req => ({ creatorId: String(req.headers['x-creator'] ?? 'creator-a'), accountId: String(req.headers['x-account'] ?? 'account-a') }),
    loadSnapshot: options.getSnapshot,
    getProvider: async () => { options.providerCalls?.(); return options.provider ?? null; }
  });
  return app;
}
const base = '/api/v1/editor-bench/real-library-conversation';
const turnPath = (id: string) => `${base}/session/${id}/turn`;
const selection = (mode: string, requestQuote: string, selector: unknown) => ({ kind: 'selection', intent: null, selection: { mode, requestQuote, selector } });

describe('real Library Conversation routes', () => {
  it('selects hundreds of posts, keeps exclusions across add, and reads current owned metadata back', async () => {
    const snapshot = makeSnapshot('catalog-1', 500);
    let modelCalls = 0;
    let promptText = '';
    const queued = [
      selection('replace', 'Select coast posts except red', { base: 'catalog', all: [{ field: 'tag', value: 'coastal', requestQuote: 'coast' }], any: [], none: [{ field: 'tag', value: 'red', requestQuote: 'red' }] }),
      selection('add', 'Also add Unique 54', { base: 'catalog', all: [{ field: 'post_id', value: 'post_054', requestQuote: 'Unique 54' }], any: [], none: [] }),
      selection('add', 'Also add Unique 2', { base: 'catalog', all: [{ field: 'post_id', value: 'post_002', requestQuote: 'Unique 2' }], any: [], none: [] })
    ];
    const provider: EditorProvider = { async respond(input) {
      modelCalls++;
      promptText = JSON.stringify(input.input);
      return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: queued.shift() }) }] }] };
    } };
    const app = appFor({ getSnapshot: async () => snapshot, provider });
    const started = await request(app).post(`${base}/session`).send({}).expect(201);
    const sessionId = started.body.data.sessionId as string;
    expect(started.body.data.catalog.posts).toHaveLength(500);
    expect(started.body.data.selection).toEqual({ postIds: [], excludedPostIds: [] });
    const first = await request(app).post(turnPath(sessionId)).send({ sessionId, expectedRevision: 0, latestRequest: 'Select coast posts except red' }).expect(200);
    expect(first.body.data.selection.postIds).toHaveLength(498);
    expect(first.body.data.selection.excludedPostIds).toEqual(['post_002']);
    expect(first.body.data.selection.postIds).not.toContain('post_054');
    expect(modelCalls).toBe(1);
    expect(promptText).not.toContain('post_');
    expect(promptText).not.toContain('description 0');
    const added = await request(app).post(turnPath(sessionId)).send({ sessionId, expectedRevision: 1, latestRequest: 'Also add Unique 54' }).expect(200);
    expect(added.body.data.selection.postIds).toHaveLength(499);
    expect(added.body.data.selection.postIds).toContain('post_054');
    expect(added.body.data.selection.excludedPostIds).toEqual(['post_002']);
    expect(added.body.data.catalog.posts[54]).toMatchObject({ postId: 'post_054', title: 'Unique 54', media: [{ id: 'media_54', processingStatus: 'READY' }] });
    const exclusionRetained = await request(app).post(turnPath(sessionId)).send({ sessionId, expectedRevision: 2, latestRequest: 'Also add Unique 2' }).expect(200);
    expect(exclusionRetained.body.data.selection.postIds).toHaveLength(499);
    expect(exclusionRetained.body.data.selection.postIds).not.toContain('post_002');
    expect(exclusionRetained.body.data.selection.excludedPostIds).toEqual(['post_002']);
    const readback = await request(app).get(`${base}/session/${sessionId}`).expect(200);
    expect(readback.body.data).toMatchObject({ status: 'ready', revision: 3, catalogRevision: 'catalog-1' });
    expect(readback.body.data.selection).toEqual(exclusionRetained.body.data.selection);
    expect(modelCalls).toBe(3);
  });

  it('keeps account-bound ownership, rejects client state, and fails closed on a mixed edit request', async () => {
    const snapshot = makeSnapshot('catalog-1');
    let modelCalls = 0;
    const app = appFor({ getSnapshot: async () => snapshot, provider: modelProvider({ kind: 'clarification', question: 'I can only select Library posts in this conversation. Which posts should I select?' }), providerCalls: () => { modelCalls++; } });
    const started = await request(app).post(`${base}/session`).send({}).expect(201);
    const id = started.body.data.sessionId as string;
    await request(app).get(`${base}/session/${id}`).set('x-account', 'account-b').expect(404);
    await request(app).post(turnPath(id)).send({ sessionId: id, expectedRevision: 0, latestRequest: 'Select blue', selection: { postIds: ['post_001'] } }).expect(400);
    const mixed = await request(app).post(turnPath(id)).send({ sessionId: id, expectedRevision: 0, latestRequest: 'Select blue and rename one to New Name' }).expect(200);
    expect(mixed.body.data.status).toBe('clarification');
    expect(mixed.body.data.selection).toEqual({ postIds: [], excludedPostIds: [] });
    expect(mixed.body.data).not.toHaveProperty('reviewToken');
    expect(mixed.body.data).not.toHaveProperty('receipt');
    expect(modelCalls).toBe(1);
    await request(app).get(`${base}/session/${id}`).set('x-creator', 'creator-b').expect(404);
  });

  it('requires explicit refresh after catalog change and clears old intent only after refreshing', async () => {
    let current = makeSnapshot('catalog-1');
    let modelCalls = 0;
    const app = appFor({ getSnapshot: async () => current, provider: modelProvider(selection('replace', 'Select blue', { base: 'catalog', all: [{ field: 'tag', value: 'blue', requestQuote: 'blue' }], any: [], none: [] })), providerCalls: () => { modelCalls++; } });
    const started = await request(app).post(`${base}/session`).send({}).expect(201);
    const id = started.body.data.sessionId as string;
    await request(app).post(turnPath(id)).send({ sessionId: id, expectedRevision: 0, latestRequest: 'Select blue' }).expect(200);
    current = makeSnapshot('catalog-2');
    const stale = await request(app).get(`${base}/session/${id}`).expect(409);
    expect(stale.body.error.code).toBe('STALE_LIBRARY');
    expect(stale.body.error.details).toContainEqual({ field: 'refreshPath', issue: `${base}/session/:sessionId/refresh` });
    await request(app).post(turnPath(id)).send({ sessionId: id, expectedRevision: 1, latestRequest: 'Select blue' }).expect(409);
    expect(modelCalls).toBe(1);
    const refreshed = await request(app).post(`${base}/session/${id}/refresh`).send({ expectedRevision: 1 }).expect(200);
    expect(refreshed.body.data).toMatchObject({ revision: 2, catalogRevision: 'catalog-2', selection: { postIds: [], excludedPostIds: [] } });
    expect((await request(app).get(`${base}/session/${id}`).expect(200)).body.data.catalogRevision).toBe('catalog-2');
  });

  it('does not commit a model result when the Library changes during interpretation', async () => {
    const original = makeSnapshot('catalog-1');
    let current = original;
    let modelCalls = 0;
    const provider = modelProvider(selection('replace', 'Select coast', { base: 'catalog', all: [{ field: 'tag', value: 'coastal', requestQuote: 'coast' }], any: [], none: [] }), () => {
      modelCalls++;
      current = makeSnapshot('catalog-2');
    });
    const app = appFor({ getSnapshot: async () => current, provider });
    const started = await request(app).post(`${base}/session`).send({}).expect(201);
    const id = started.body.data.sessionId as string;
    const changedDuringTurn = await request(app).post(turnPath(id)).send({ sessionId: id, expectedRevision: 0, latestRequest: 'Select coast' }).expect(409);
    expect(changedDuringTurn.body.error.code).toBe('STALE_LIBRARY');
    expect(modelCalls).toBe(1);
    current = original;
    const unchanged = await request(app).get(`${base}/session/${id}`).expect(200);
    expect(unchanged.body.data).toMatchObject({ revision: 0, catalogRevision: 'catalog-1', selection: { postIds: [], excludedPostIds: [] } });
    current = makeSnapshot('catalog-2');
    await request(app).post(turnPath(id)).send({ sessionId: id, expectedRevision: 0, latestRequest: 'Select coast' }).expect(409);
    expect(modelCalls).toBe(1);
  });

  it('prevents an older refresh from clearing state after a newer refresh wins', async () => {
    const first = makeSnapshot('catalog-1'), older = makeSnapshot('catalog-2'), newer = makeSnapshot('catalog-3');
    const refreshLoads: Array<(value: LargeRealLibrarySnapshot) => void> = [];
    let loads = 0;
    const app = appFor({ getSnapshot: async () => {
      loads++;
      if (loads === 1) return first;
      if (loads > 3) return newer;
      return new Promise(resolve => refreshLoads.push(resolve));
    } });
    const started = await request(app).post(`${base}/session`).send({}).expect(201);
    const id = started.body.data.sessionId as string;
    const oldRefreshPromise = request(app).post(`${base}/session/${id}/refresh`).send({ expectedRevision: 0 }).then(response => response);
    while (refreshLoads.length < 1) await new Promise(resolve => setTimeout(resolve, 0));
    const newRefreshPromise = request(app).post(`${base}/session/${id}/refresh`).send({ expectedRevision: 0 }).then(response => response);
    while (refreshLoads.length < 2) await new Promise(resolve => setTimeout(resolve, 0));
    refreshLoads[1]!(newer);
    const newRefresh = await newRefreshPromise;
    expect(newRefresh.status).toBe(200);
    refreshLoads[0]!(older);
    const oldRefresh = await oldRefreshPromise;
    expect(oldRefresh.status).toBe(409);
    expect(newRefresh.body.data.catalogRevision).toBe('catalog-3');
    expect(oldRefresh.body.error.code).toBe('CONFLICT');
    const readback = await request(app).get(`${base}/session/${id}`).expect(200);
    expect(readback.body.data).toMatchObject({ revision: 1, catalogRevision: 'catalog-3' });
  });

  it('does not register the real Library connector outside development', async () => {
    const app = appFor({ development: false, getSnapshot: async () => makeSnapshot('catalog-1') });
    await request(app).post(`${base}/session`).send({}).expect(404);
  });
});
