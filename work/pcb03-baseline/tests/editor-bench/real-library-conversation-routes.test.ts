import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { EditorProvider } from '../../src/gallery-editor/provider.js';
import { EditorError, type EditorContext, type EditorSession, type EditAction } from '../../src/gallery-editor/types.js';
import { registerRealLibraryConversationRoutes } from '../../src/editor-bench/real-library-conversation-routes.js';
import { editActionDigest, reviewRealLibraryEdit } from '../../src/editor-bench/real-library-edit-review.js';
import { realLibraryCatalogRevision, type LargeRealLibrarySnapshot, type RealLibraryPost } from '../../src/editor-bench/library-selection-catalog.js';

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
function testEditor(onApply?: (actions: EditAction[]) => void) {
  const sessions = new Map<string, EditorSession>(), commits = new Map<string, any>();
  const emptyCart = (revision: number) => ({ revision, actions: [] as EditAction[], items: [], dependencies: {}, conflicts: [], notice: '' });
  return {
    async create(creatorId: string, actorId: string, context: EditorContext) {
      const value: EditorSession = { id: randomUUID(), creatorId, revision: 0, context, messages: [], cart: emptyCart(0) };
      (value as any).actorId = actorId; sessions.set(value.id, value); return structuredClone(value);
    },
    async read(creatorId: string, actorId: string, id: string) {
      const value = sessions.get(id);
      if (!value || value.creatorId !== creatorId || (value as any).actorId !== actorId) throw new EditorError('NOT_FOUND', 'missing', 404);
      return structuredClone(value);
    },
    async revise(creatorId: string, actorId: string, id: string, revision: number, actions: EditAction[], context?: EditorContext, messages?: EditorSession['messages']) {
      const value = sessions.get(id); if (!value || value.creatorId !== creatorId || (value as any).actorId !== actorId || value.revision !== revision) throw new Error('stale');
      const next = { ...value, revision: revision + 1, ...(context ? { context } : {}), ...(messages ? { messages } : {}), cart: { ...emptyCart(revision + 1), actions } };
      sessions.set(id, next); return structuredClone(next);
    },
    async apply(creatorId: string, actorId: string, id: string, revision: number, idempotencyKey: string, _origin?: string, contextAfterApply?: (receipt: any, session: EditorSession) => EditorContext) {
      const previous = [...commits.values()].find(item => item.idempotencyKey === idempotencyKey && item.creatorId === creatorId && item.actorId === actorId && item.sessionId === id);
      if (previous) return previous.receipt;
      const value = sessions.get(id); if (!value || value.revision !== revision || value.creatorId !== creatorId || (value as any).actorId !== actorId || !value.cart.actions.length) throw new Error('stale');
      const receipt = { id: randomUUID(), sessionId: id, revision, committedAt: new Date().toISOString(), actionCount: value.cart.actions.length, affectedPostIds: value.cart.actions.map(action => action.kind === 'rename_post' || action.kind === 'tags' ? action.postId : ''), preservedExceptions: [], notice: '' };
      const context = contextAfterApply?.(receipt, structuredClone(value));
      onApply?.(structuredClone(value.cart.actions));
      commits.set(receipt.id, { creatorId, actorId, sessionId: id, idempotencyKey, receipt });
      sessions.set(id, { ...value, revision: revision + 1, ...(context ? { context } : {}), cart: emptyCart(revision + 1) });
      return receipt;
    },
    async readCommitReceiptByKey(creatorId: string, actorId: string, sessionId: string, idempotencyKey: string) {
      return [...commits.values()].find(item => item.creatorId === creatorId && item.actorId === actorId && item.sessionId === sessionId && item.idempotencyKey === idempotencyKey)?.receipt ?? null;
    }
  };
}
function appFor(options: {
  getSnapshot: (accountId: string, creatorId: string, signal?: AbortSignal) => Promise<LargeRealLibrarySnapshot>;
  provider?: EditorProvider;
  providerCalls?: () => void;
  development?: boolean;
  editor?: ReturnType<typeof testEditor>;
  nowMs?: () => number;
  editorEnabled?: () => boolean;
  editorStoresReady?: boolean;
  authorizeMutation?: (req: any, res: any) => Promise<any>;
}) {
  const app = express();
  app.use(express.json());
  registerRealLibraryConversationRoutes(app, {
    development: options.development ?? true,
    traceId: () => 'pcb01-test',
    authenticateCreator: async req => ({ creatorId: String(req.headers['x-creator'] ?? 'creator-a'), accountId: String(req.headers['x-account'] ?? 'account-a') }),
    loadSnapshot: options.getSnapshot,
    editor: (options.editor ?? testEditor()) as any,
    authorizeMutation: options.authorizeMutation ?? (async req => ({ creatorId: String(req.headers['x-creator'] ?? 'creator-a'), accountId: String(req.headers['x-account'] ?? 'account-a') })),
    editorEnabled: options.editorEnabled ?? (() => true),
    editorStoresReady: options.editorStoresReady ?? true,
    nowMs: options.nowMs,
    getProvider: async () => { options.providerCalls?.(); return options.provider ?? null; }
  });
  return app;
}
const base = '/api/v1/editor-bench/real-library-conversation';
const turnPath = (id: string) => `${base}/session/${id}/turn`;
const selection = (mode: string, requestQuote: string, selector: unknown) => ({ kind: 'selection', intent: null, selection: { mode, requestQuote, selector } });

describe('real Library Conversation routes', () => {
  it('keeps an initial replacement available after a clarification and binds rename targets to the selected post', async () => {
    const snapshot = makeSnapshot('catalog-1');
    const provider: EditorProvider = { async respond(input) {
      const requestText = JSON.stringify(input.input);
      const result = requestText.includes('first request')
        ? { kind: 'clarification', question: 'Which posts?' }
        : selection('replace', 'Select Unique 0', { base: 'catalog', all: [{ field: 'post_id', value: 'post_000', requestQuote: 'Unique 0' }], any: [], none: [] });
      return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }] };
    } };
    const app = appFor({ getSnapshot: async () => snapshot, provider });
    const started = await request(app).post(`${base}/session`).send({}).expect(201);
    const id = started.body.data.sessionId as string;
    const clarified = await request(app).post(turnPath(id)).send({ sessionId: id, expectedRevision: 0, latestRequest: 'first request' }).expect(200);
    expect(clarified.body.data.status).toBe('clarification');
    const selected = await request(app).post(turnPath(id)).send({ sessionId: id, expectedRevision: 1, latestRequest: 'Select Unique 0' }).expect(200);
    expect(selected.body.data.selection.postIds).toEqual(['post_000']);

    const unselectedTarget = await reviewRealLibraryEdit({ latestRequest: 'Rename Unique 0 to "New title" using Unique 1', post: snapshot.posts[0]!, provider: modelProvider({ kind: 'rename', title: 'New title', titleQuote: '"New title"', targetQuote: 'Unique 1' }) });
    expect(unselectedTarget).toHaveProperty('clarification');
    const unselectedTagTarget = await reviewRealLibraryEdit({ latestRequest: 'Add blue to Unique 1', post: snapshot.posts[0]!, provider: modelProvider({ kind: 'tags', add: ['blue'], remove: [], requestQuote: 'Add blue to Unique 1', targetQuote: 'Unique 1' }) });
    expect(unselectedTagTarget).toHaveProperty('clarification');
    expect(editActionDigest({ id: 'stable', kind: 'rename_post', postId: 'post_000', title: 'New title' })).toBe(editActionDigest({ title: 'New title', postId: 'post_000', kind: 'rename_post', id: 'stable' }));
  });

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

  it('keeps selection through router reconstruction and applies one reviewed rename with an exact durable retry', async () => {
    let current = makeSnapshot('catalog-1');
    let editCalls = 0;
    const editor = testEditor(actions => {
      const rename = actions[0];
      if (rename?.kind === 'rename_post') {
        const posts = current.posts.map(post => post.postId === rename.postId ? { ...post, title: rename.title } : post);
        current = { ...current, catalogRevision: realLibraryCatalogRevision('account-a', 'creator-a', posts), posts };
      }
    });
    const proposals = [
      selection('replace', 'Select Unique 0', { base: 'catalog', all: [{ field: 'post_id', value: 'post_000', requestQuote: 'Unique 0' }], any: [], none: [] }),
      { kind: 'rename', title: 'New title', titleQuote: '"New title"', targetQuote: 'Unique 0' },
      { kind: 'selection', intent: null, selection: { mode: 'preserve', requestQuote: null, selector: null } }
    ];
    let calls = 0;
    const provider: EditorProvider = { async respond(input) { calls++; return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: proposals.shift() }) }] }], usage: { inputTokens: 12, outputTokens: 5, costUsd: 0.0001 } }; } };
    const app = appFor({ getSnapshot: async () => current, provider, editor });
    const started = await request(app).post(`${base}/session`).send({}).expect(201);
    const id = started.body.data.sessionId as string;
    const selected = await request(app).post(turnPath(id)).send({ sessionId: id, expectedRevision: 0, latestRequest: 'Select Unique 0' }).expect(200);
    expect(selected.body.data.selection.postIds).toEqual(['post_000']);
    const reviewApp = appFor({ getSnapshot: async () => current, provider, editor });
    const readback = await request(reviewApp).get(`${base}/session/${id}`).expect(200);
    expect(readback.body.data.selection).toEqual({ postIds: ['post_000'], excludedPostIds: [] });
    const reviewed = await request(reviewApp).post(`${base}/session/${id}/review`).send({ sessionId: id, expectedRevision: 1, latestRequest: 'Rename Unique 0 to "New title"' }).expect(200);
    expect(reviewed.body.data).toMatchObject({ status: 'review', before: { title: 'Unique 0' }, after: { title: 'New title' } });
    expect(current.posts[0]?.title).toBe('Unique 0');
    const confirmed = await request(reviewApp).post(`${base}/session/${id}/confirm`).send({ reviewId: reviewed.body.data.reviewId, expectedRevision: reviewed.body.data.revision }).expect(200);
    expect(confirmed.body.data.receipt.actionCount).toBe(1);
    expect(confirmed.body.data.conversation.selection.postIds).toEqual(['post_000']);
    expect(current.posts[0]?.title).toBe('New title');
    expect(calls).toBe(2);
    const later = await request(reviewApp).post(turnPath(id)).send({ sessionId: id, expectedRevision: confirmed.body.data.conversation.revision, latestRequest: 'Keep the selection' }).expect(200);
    expect(later.body.data.selection.postIds).toEqual(['post_000']);
    const retry = await request(reviewApp).post(`${base}/session/${id}/confirm`).send({ reviewId: reviewed.body.data.reviewId, expectedRevision: reviewed.body.data.revision }).expect(200);
    expect(retry.body.data.receipt).toEqual(confirmed.body.data.receipt);
    expect(current.posts[0]?.title).toBe('New title');
    expect(calls).toBe(3);
  });

  it('does not delete a manually changed same-ID cart action when replacing a pending review', async () => {
    const snapshot = makeSnapshot('catalog-1');
    const editor = testEditor();
    const answers = [
      selection('replace', 'Select Unique 0', { base: 'catalog', all: [{ field: 'post_id', value: 'post_000', requestQuote: 'Unique 0' }], any: [], none: [] }),
      { kind: 'rename', title: 'New title', titleQuote: '"New title"', targetQuote: 'Unique 0' }
    ];
    const provider: EditorProvider = { async respond() { return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: answers.shift() }) }] }], usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.0001 } }; } };
    const app = appFor({ getSnapshot: async () => snapshot, provider, editor });
    const started = await request(app).post(`${base}/session`).send({}).expect(201);
    const id = started.body.data.sessionId as string;
    await request(app).post(turnPath(id)).send({ sessionId: id, expectedRevision: 0, latestRequest: 'Select Unique 0' }).expect(200);
    const reviewed = await request(app).post(`${base}/session/${id}/review`).send({ sessionId: id, expectedRevision: 1, latestRequest: 'Rename Unique 0 to "New title"' }).expect(200);
    const staged = await editor.read('creator-a', 'account-a', id);
    const pendingAction = staged.cart.actions[0]!;
    const changedAction = { ...pendingAction, title: 'Manual title' } as EditAction;
    await editor.revise('creator-a', 'account-a', id, staged.revision, [changedAction]);
    const replacement = await request(app).post(`${base}/session/${id}/review`).send({ sessionId: id, expectedRevision: staged.revision + 1, latestRequest: 'Rename Unique 0 to "Other title"' }).expect(409);
    expect(replacement.body.error.code).toBe('CART_NOT_EMPTY');
    expect((await editor.read('creator-a', 'account-a', id)).cart.actions).toEqual([changedAction]);
    expect(reviewed.body.data.reviewId).toBeTruthy();
  });

  it('blocks source edits when disabled or mutation authorization denies, and rejects a replaced review without applying', async () => {
    const snapshot = makeSnapshot('catalog-1');
    let applies = 0, providerCalls = 0, denialCalls = 0;
    const editor = testEditor(() => { applies++; });
    const answers = [
      selection('replace', 'Select Unique 0', { base: 'catalog', all: [{ field: 'post_id', value: 'post_000', requestQuote: 'Unique 0' }], any: [], none: [] }),
      { kind: 'rename', title: 'New title', titleQuote: '"New title"', targetQuote: 'Unique 0' }
    ];
    const provider: EditorProvider = { async respond() { providerCalls++; return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: answers.shift() }) }] }] }; } };
    const enabledApp = appFor({ getSnapshot: async () => snapshot, provider, editor });
    const started = await request(enabledApp).post(`${base}/session`).send({}).expect(201);
    const id = started.body.data.sessionId as string;
    await request(enabledApp).post(turnPath(id)).send({ sessionId: id, expectedRevision: 0, latestRequest: 'Select Unique 0' }).expect(200);
    const reviewed = await request(enabledApp).post(`${base}/session/${id}/review`).send({ sessionId: id, expectedRevision: 1, latestRequest: 'Rename Unique 0 to "New title"' }).expect(200);
    expect(providerCalls).toBe(2);

    const disabledApp = appFor({ getSnapshot: async () => snapshot, provider, editor, editorEnabled: () => false });
    await request(disabledApp).post(`${base}/session/${id}/confirm`).send({ reviewId: reviewed.body.data.reviewId, expectedRevision: 2 }).expect(403);
    const storesDisabledApp = appFor({ getSnapshot: async () => snapshot, provider, editor, editorStoresReady: false });
    await request(storesDisabledApp).post(`${base}/session/${id}/review`).send({ sessionId: id, expectedRevision: 2, latestRequest: 'Rename Unique 0 to "Other title"' }).expect(403);
    expect(providerCalls).toBe(2);

    const staged = await editor.read('creator-a', 'account-a', id);
    const replaced = { ...staged.context, conversation: { ...staged.context.conversation!, pendingReview: { ...staged.context.conversation!.pendingReview!, id: 'replacement-review' } } };
    await editor.revise('creator-a', 'account-a', id, staged.revision, staged.cart.actions, replaced);
    const deniedApp = appFor({ getSnapshot: async () => snapshot, provider, editor, authorizeMutation: async (_req, res) => {
      denialCalls++;
      res.status(403).json({ error: { code: 'MUTATION_DENIED' } });
      return null;
    } });
    await request(deniedApp).post(`${base}/session/${id}/confirm`).send({ reviewId: reviewed.body.data.reviewId, expectedRevision: staged.revision + 1 }).expect(403);
    expect(denialCalls).toBe(1);
    expect(applies).toBe(0);
    const stale = await request(enabledApp).post(`${base}/session/${id}/confirm`).send({ reviewId: reviewed.body.data.reviewId, expectedRevision: staged.revision + 1 }).expect(409);
    expect(stale.body.error.code).toBe('REVIEW_STALE');
    expect(applies).toBe(0);
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

  it('keeps the durable conversation readable after overnight idle', async () => {
    let now = Date.now();
    const editor = testEditor();
    const app = appFor({ editor, getSnapshot: async () => makeSnapshot('catalog-1'), nowMs: () => now });
    const started = await request(app).post(`${base}/session`).send({}).expect(201);
    const id = started.body.data.sessionId as string;
    now += 3 * 60 * 60 * 1000;
    const readback = await request(app).get(`${base}/session/${id}`).expect(200);
    expect(readback.body.data).toMatchObject({ sessionId: id, revision: 0, catalogRevision: 'catalog-1', selection: { postIds: [], excludedPostIds: [] } });
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
