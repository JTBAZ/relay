import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { GalleryEditorService } from '../../src/gallery-editor/service.js';
import type { EditorProvider } from '../../src/gallery-editor/provider.js';
import { loadPostNaming } from '../../src/gallery-editor/naming.js';
import { loadLargeRealLibrarySnapshot } from '../../src/editor-bench/library-selection-catalog.js';
import { registerRealLibraryConversationRoutes } from '../../src/editor-bench/real-library-conversation-routes.js';

const databaseUrl = process.env.GALLERY_EDITOR_TEST_DATABASE_URL?.trim();
if (databaseUrl && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(databaseUrl).hostname)) throw new Error('Conversation integration tests require an explicit local test database.');

describe.skipIf(!databaseUrl)('durable Library conversation — PostgreSQL', () => {
  let db: PrismaClient;
  let editor: GalleryEditorService;
  const creatorId = `conv_it_${randomUUID()}`;
  const accountId = `conv_account_${randomUUID()}`;
  const actorId = accountId;
  const campaignId = `conv_campaign_${randomUUID()}`;
  const postId = `conv_post_${randomUUID()}`;
  const excludedPostId = `conv_post_${randomUUID()}`;
  const base = '/api/v1/editor-bench/real-library-conversation';
  const providers: EditorProvider[] = [];

  const provider = (): EditorProvider => {
    const current = providers.shift();
    if (!current) throw new Error('No injected provider response remains.');
    return current;
  };
  const responseProvider = (result: unknown): EditorProvider => ({ async respond() {
    return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }], usage: { inputTokens: 10, outputTokens: 4, costUsd: 0 } };
  } });
  const app = () => {
    const instance = express(); instance.use(express.json());
    registerRealLibraryConversationRoutes(instance, {
      development: true, traceId: () => 'pcb02-postgres-proof',
      authenticateCreator: async () => ({ creatorId, accountId }),
      loadSnapshot: (_account, owner, signal) => loadLargeRealLibrarySnapshot(db, accountId, owner, signal),
      getProvider: async () => provider(), editor,
      authorizeMutation: async () => ({ creatorId, accountId }), editorEnabled: () => true, editorStoresReady: true
    });
    return instance;
  };

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    editor = new GalleryEditorService(db);
    await db.campaign.create({ data: { id: campaignId, creatorId, name: 'Conversation fixture', upstreamUpdatedAt: new Date(), versionSeq: 1 } });
    await db.post.create({ data: {
      id: postId, creatorId, campaignId, upstreamStatus: 'active', source: 'PATREON', createdAt: new Date(),
      versions: { create: { versionSeq: 1, upstreamRevision: 'conversation-source-1', title: 'Original conversation title', publishedAt: new Date(), ingestedAt: new Date(), mediaIds: [], tagIds: [], tierIds: [] } }
    } });
    await db.post.create({ data: {
      id: excludedPostId, creatorId, campaignId, upstreamStatus: 'active', source: 'PATREON', createdAt: new Date(),
      versions: { create: { versionSeq: 1, upstreamRevision: 'conversation-source-2', title: 'Other source title', publishedAt: new Date(), ingestedAt: new Date(), mediaIds: [], tagIds: [], tierIds: [] } }
    } });
    await db.postOverride.create({ data: { creatorId, postId, mediaId: '', addTagIds: ['existing'] } });
  });
  afterEach(() => { providers.length = 0; });
  afterAll(async () => {
    if (db) {
      await db.galleryEditorCommit.deleteMany({ where: { creatorId } });
      await db.galleryEditorSession.deleteMany({ where: { creatorId } });
      await db.postPresentation.deleteMany({ where: { creatorId } });
      await db.postOverride.deleteMany({ where: { creatorId } });
      await db.post.deleteMany({ where: { creatorId } });
      await db.campaign.deleteMany({ where: { creatorId } });
      await db.$disconnect();
    }
  });

  it('persists selected context and confirms a literal source edit atomically, then replays the original receipt', async () => {
    providers.push(
      responseProvider({ kind: 'selection', intent: null, selection: { mode: 'replace', requestQuote: 'Select "Original conversation title" but exclude "Other source title"', selector: { base: 'catalog', all: [{ field: 'post_id', value: postId, requestQuote: 'Original conversation title' }], any: [], none: [{ field: 'post_id', value: excludedPostId, requestQuote: 'Other source title' }] } } }),
      responseProvider({ kind: 'rename', title: 'Durable title', titleQuote: '"Durable title"', targetQuote: 'Original conversation title' })
    );
    const firstApp = app();
    const started = await request(firstApp).post(`${base}/session`).send({}).expect(201);
    const sessionId = started.body.data.sessionId as string;
    const selected = await request(firstApp).post(`${base}/session/${sessionId}/turn`).send({ sessionId, expectedRevision: 0, latestRequest: 'Select "Original conversation title" but exclude "Other source title"' }).expect(200);
    expect(selected.body.data.selection.postIds).toEqual([postId]);
    expect(selected.body.data.selection.excludedPostIds).toEqual([excludedPostId]);

    const review = await request(firstApp).post(`${base}/session/${sessionId}/review`).send({ sessionId, expectedRevision: 1, latestRequest: 'Rename Original conversation title to "Durable title"' }).expect(200);
    expect(review.body.data.after.title).toBe('Durable title');
    expect((await loadPostNaming(db, creatorId))[postId]?.effectiveTitle).toBe('Original conversation title');
    const confirmed = await request(firstApp).post(`${base}/session/${sessionId}/confirm`).send({ reviewId: review.body.data.reviewId, expectedRevision: review.body.data.revision });
    expect({ status: confirmed.status, error: confirmed.body?.error }).toEqual({ status: 200, error: undefined });
    expect(confirmed.body.data.receipt.actionCount).toBe(1);
    expect(confirmed.body.data.conversation.selection.postIds).toEqual([postId]);
    expect((await loadPostNaming(db, creatorId))[postId]?.effectiveTitle).toBe('Durable title');

    editor = new GalleryEditorService(db);
    const reconstructedApp = app();
    const readback = await request(reconstructedApp).get(`${base}/session/${sessionId}`).expect(200);
    expect(readback.body.data).toMatchObject({ revision: 3, selection: { postIds: [postId], excludedPostIds: [excludedPostId] } });
    const retry = await request(reconstructedApp).post(`${base}/session/${sessionId}/confirm`).send({ reviewId: review.body.data.reviewId, expectedRevision: review.body.data.revision }).expect(200);
    expect(retry.body.data.receipt).toEqual(confirmed.body.data.receipt);
    expect((await loadPostNaming(db, creatorId))[postId]?.effectiveTitle).toBe('Durable title');
    expect(await db.galleryEditorCommit.count({ where: { creatorId } })).toBe(1);

    providers.push(responseProvider({ kind: 'tags', add: ['new tag'], remove: ['existing'], requestQuote: 'Remove existing tag from "Durable title" and add "new tag"', targetQuote: 'Durable title' }));
    const tagReview = await request(reconstructedApp).post(`${base}/session/${sessionId}/review`).send({ sessionId, expectedRevision: 3, latestRequest: 'Remove existing tag from "Durable title" and add "new tag"' }).expect(200);
    expect(tagReview.body.data.after.tags).toEqual(['new tag']);
    const tagConfirm = await request(reconstructedApp).post(`${base}/session/${sessionId}/confirm`).send({ reviewId: tagReview.body.data.reviewId, expectedRevision: tagReview.body.data.revision }).expect(200);
    expect(tagConfirm.body.data.conversation.selection).toEqual({ postIds: [postId], excludedPostIds: [excludedPostId] });
    expect(await db.postOverride.findUniqueOrThrow({ where: { creatorId_postId_mediaId: { creatorId, postId, mediaId: '' } } })).toMatchObject({ addTagIds: ['new tag'], removeTagIds: ['existing'] });
    expect(await db.galleryEditorCommit.count({ where: { creatorId } })).toBe(2);

    const rollbackSession = await editor.create(creatorId, actorId, { selectedPostIds: [postId], conversation: { catalogRevision: tagConfirm.body.data.conversation.catalogRevision, excludedPostIds: [excludedPostId], lastRequest: 'rollback proof', selectionInitialized: true } });
    const staged = await editor.revise(creatorId, actorId, rollbackSession.id, rollbackSession.revision, [{ id: 'rollback-rename', kind: 'rename_post', postId, title: 'Must roll back' }]);
    await expect(editor.apply(creatorId, actorId, staged.id, staged.revision, `rollback:${randomUUID()}`, 'manual', () => { throw new Error('context write failed'); })).rejects.toThrow('context write failed');
    expect((await loadPostNaming(db, creatorId))[postId]?.effectiveTitle).toBe('Durable title');
    expect(await db.galleryEditorCommit.count({ where: { creatorId } })).toBe(2);
  });
});
