import { randomUUID, createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MediaIngestOrigin, MediaProcessingStatus, MediaUpstreamStatus, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { GalleryEditorService } from '../../src/gallery-editor/service.js';
import { registerRealLibraryConversationRoutes } from '../../src/editor-bench/real-library-conversation-routes.js';
import { createPrismaRealLibraryPreviewExportStore, MAX_REAL_PREVIEW_BYTES, type PreviewObjectStore } from '../../src/editor-bench/real-library-preview-export.js';
import { loadLargeRealLibrarySnapshot } from '../../src/editor-bench/library-selection-catalog.js';
import { buildRelayR2ObjectKey } from '../../src/storage/relay-upload-r2.js';

const databaseUrl = process.env.GALLERY_EDITOR_TEST_DATABASE_URL?.trim();
if (databaseUrl && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(databaseUrl).hostname)) throw new Error('Preview export integration tests require an explicit local test database.');

describe.skipIf(!databaseUrl)('durable Library Previewizer export — PostgreSQL', () => {
  let db: PrismaClient;
  let editor: GalleryEditorService;
  const creatorId = `preview_it_${randomUUID()}`;
  const accountId = `preview_account_${randomUUID()}`;
  const campaignId = `preview_campaign_${randomUUID()}`;
  const postId = `preview_post_${randomUUID()}`;
  const sourceMediaId = `preview_source_${randomUUID()}`;
  const stagedMediaId = `relay_m_${randomUUID()}`;
  const templateId = `preview_template_${randomUUID()}`;
  const objects = new Map<string, Buffer>();
  const writes: string[] = [];
  let exportStore: ReturnType<typeof createPrismaRealLibraryPreviewExportStore>;
  const base = '/api/v1/editor-bench/real-library-conversation';
  const templateConfig = { schemaVersion: 1, preset: 'tight_crop', aspectKey: '1:1', compositionId: null, compositionProps: null, compositionVariantIndex: null, overlayDoc: { textLayers: [], graphicLayers: [], logoLayers: [] }, templateOptions: {}, destination: { selectedDestinationId: 'x', customDestinationUrl: null } };

  const objectStore: PreviewObjectStore = {
    async read(key: string, maxBytes: number) {
      const value = objects.get(key);
      if (!value) throw new Error('preview_upload_unavailable');
      if (value.length > maxBytes || value.length > MAX_REAL_PREVIEW_BYTES) throw new Error('preview_invalid_size');
      return Buffer.from(value);
    },
    async putIfAbsent(key, bytes) {
      if (objects.has(key)) return false;
      writes.push(key); objects.set(key, Buffer.from(bytes)); return true;
    }
  };

  const app = () => {
    const instance = express(); instance.use(express.json());
    registerRealLibraryConversationRoutes(instance, {
      development: true, traceId: () => 'pcb03-postgres-proof', editor,
      previewExports: exportStore,
      authenticateCreator: async () => ({ creatorId, accountId }),
      loadSnapshot: (_account, owner, signal) => loadLargeRealLibrarySnapshot(db, accountId, owner, signal),
      getProvider: async () => null,
      authorizeMutation: async () => ({ creatorId, accountId }), editorEnabled: () => true, editorStoresReady: true
    });
    return instance;
  };

  const createSession = async () => {
    const snapshot = await loadLargeRealLibrarySnapshot(db, accountId, creatorId);
    return editor.create(creatorId, accountId, { selectedPostIds: [postId], conversation: { catalogRevision: snapshot.catalogRevision, excludedPostIds: [], lastRequest: null, selectionInitialized: true } });
  };

  const reviewRequest = (instance: express.Express, sessionId: string, revision: number, stagedId = stagedMediaId) =>
    request(instance).post(`${base}/session/${sessionId}/preview/review`).send({ expectedRevision: revision, sourcePostId: postId, sourceMediaId, templateId, stagedMediaId: stagedId });

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    editor = new GalleryEditorService(db);
    exportStore = createPrismaRealLibraryPreviewExportStore(db, objectStore);
    await db.campaign.create({ data: { id: campaignId, creatorId, name: 'Preview fixture', upstreamUpdatedAt: new Date(), versionSeq: 1 } });
    await db.post.create({ data: { id: postId, creatorId, campaignId, upstreamStatus: 'active', source: 'PATREON', createdAt: new Date(), versions: { create: {
      versionSeq: 1, upstreamRevision: 'preview-source-1', title: 'Original artwork', publishedAt: new Date(), ingestedAt: new Date(), mediaIds: [sourceMediaId], tagIds: [], tierIds: []
    } } } });
    await db.mediaAsset.create({ data: {
      id: sourceMediaId, creatorId, postIds: [postId], primaryPostId: postId, upstreamStatus: MediaUpstreamStatus.active,
      currentVersionSeq: 1, currentUpstreamRevision: 'source-media-1', currentMimeType: 'image/png', currentUpstreamUrl: 'https://example.invalid/source.png',
      currentRole: 'main', currentStorageKey: null, currentIngestedAt: new Date(), versionsJson: [], ingestOrigin: MediaIngestOrigin.PATREON,
      processingStatus: MediaProcessingStatus.READY, processingError: null
    } });
    const stagedKey = buildRelayR2ObjectKey(creatorId, stagedMediaId);
    await db.mediaAsset.create({ data: {
      id: stagedMediaId, creatorId, postIds: [], primaryPostId: null, upstreamStatus: MediaUpstreamStatus.active,
      currentVersionSeq: 1, currentUpstreamRevision: 'relay:upload:committed', currentMimeType: 'image/jpeg', currentUpstreamUrl: null,
      currentRole: null, currentStorageKey: stagedKey, currentIngestedAt: new Date(), versionsJson: [], ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD,
      processingStatus: MediaProcessingStatus.READY, processingError: null
    } });
    await db.creatorPreviewTemplate.create({ data: { id: templateId, creatorId, name: 'Owned X template', config: templateConfig } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.galleryEditorCommit.deleteMany({ where: { creatorId } });
    await db.galleryEditorSession.deleteMany({ where: { creatorId } });
    await db.mediaAsset.deleteMany({ where: { creatorId } });
    await db.post.deleteMany({ where: { creatorId } });
    await db.creatorPreviewTemplate.deleteMany({ where: { creatorId } });
    await db.campaign.deleteMany({ where: { creatorId } });
    await db.$disconnect();
  });

  it('rejects corrupt JPEGs, seals one exact owned export, and replays after a concurrent confirm and restart', async () => {
    const stagedKey = buildRelayR2ObjectKey(creatorId, stagedMediaId);
    const validJpeg = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#204060' } }).jpeg().toBuffer();
    objects.set(stagedKey, Buffer.from('not a jpeg'));
    const start = await createSession();
    const instance = app();
    const read = await request(instance).get(`${base}/session/${start.id}`).expect(200);
    const revision = read.body.data.revision;
    const requestReview = () => reviewRequest(instance, start.id, revision);
    await requestReview().expect(400);

    objects.set(stagedKey, validJpeg);
    const review = await requestReview().expect(200);
    expect(review.body.data.review).toMatchObject({ sourcePostId: postId, sourceMediaId, templateId, exportHash: createHash('sha256').update(validJpeg).digest('hex'), size: validJpeg.length });
    const expectedRevision = review.body.data.revision;
    const resumed = await request(instance).get(`${base}/session/${start.id}`).expect(200);
    expect(resumed.body.data.previewReview).toMatchObject({ reviewId: review.body.data.review.reviewId, templateConfig });
    expect(resumed.body.data.previewReview.stagedContentUrl).toContain(stagedMediaId);
    const confirm = () => request(instance).post(`${base}/session/${start.id}/preview/confirm`).send({ reviewId: review.body.data.review.reviewId, expectedRevision });
    const [first, second] = await Promise.all([confirm(), confirm()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.receipt).toEqual(second.body.data.receipt);
    expect(writes).toEqual([buildRelayR2ObjectKey(creatorId, first.body.data.receipt.mediaId)]);
    const sealed = await db.mediaAsset.findFirstOrThrow({ where: { id: first.body.data.receipt.mediaId, creatorId } });
    expect(sealed).toMatchObject({ primaryPostId: postId, postIds: [postId], currentMimeType: 'image/jpeg', processingStatus: MediaProcessingStatus.READY });
    expect((sealed.versionsJson as Array<Record<string, unknown>>)[0]).toMatchObject({ sha256: first.body.data.receipt.exportHash, source_version_id: expect.any(String), template_config_hash: expect.any(String) });
    expect((await db.postVersion.findFirstOrThrow({ where: { postId }, orderBy: { versionSeq: 'desc' } })).mediaIds).toEqual([sourceMediaId]);

    editor = new GalleryEditorService(db);
    const reopened = await request(app()).get(`${base}/session/${start.id}/previews`).expect(200);
    expect(reopened.body.data.previewExports).toHaveLength(1);
    expect(reopened.body.data.previewExports[0]).toMatchObject({ mediaId: first.body.data.receipt.mediaId, exportHash: first.body.data.receipt.exportHash, mediaUrl: `/api/v1/export/media/${creatorId}/${first.body.data.receipt.mediaId}/content` });
    expect(objects.get(buildRelayR2ObjectKey(creatorId, first.body.data.receipt.mediaId))).toEqual(validJpeg);

    const refreshed = await request(app()).post(`${base}/session/${start.id}/refresh`).send({ expectedRevision: expectedRevision + 1 }).expect(200);
    expect(refreshed.body.data.selection.postIds).toEqual([]);
    const durableAfterRefresh = await request(app()).get(`${base}/session/${start.id}/previews`).expect(200);
    expect(durableAfterRefresh.body.data.previewExports).toHaveLength(1);
  });

  it('rejects missing, foreign, oversized, changed-template, changed-source, and changed-JPEG reviews', async () => {
    const validJpeg = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#204060' } }).jpeg().toBuffer();
    const stagedKey = buildRelayR2ObjectKey(creatorId, stagedMediaId);
    const foreignCreatorId = `foreign_${randomUUID()}`;
    const foreignStagedId = `relay_m_${randomUUID()}`;
    const foreignKey = buildRelayR2ObjectKey(foreignCreatorId, foreignStagedId);
    await db.mediaAsset.create({ data: {
      id: foreignStagedId, creatorId: foreignCreatorId, postIds: [], primaryPostId: null, upstreamStatus: MediaUpstreamStatus.active,
      currentVersionSeq: 1, currentUpstreamRevision: 'relay:upload:committed', currentMimeType: 'image/jpeg', currentUpstreamUrl: null,
      currentRole: null, currentStorageKey: foreignKey, currentIngestedAt: new Date(), versionsJson: [], ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD,
      processingStatus: MediaProcessingStatus.READY, processingError: null
    } });
    objects.set(stagedKey, validJpeg);
    const session = await createSession();
    const instance = app();
    const revision = (await request(instance).get(`${base}/session/${session.id}`).expect(200)).body.data.revision;
    const initialWriteCount = writes.length;
    await reviewRequest(instance, session.id, revision, `relay_m_${randomUUID()}`).expect(409);
    await reviewRequest(instance, session.id, revision, foreignStagedId).expect(409);
    objects.set(stagedKey, Buffer.alloc(MAX_REAL_PREVIEW_BYTES + 1, 1));
    await reviewRequest(instance, session.id, revision).expect(413);

    objects.set(stagedKey, validJpeg);
    const templateReview = await reviewRequest(instance, session.id, revision).expect(200);
    const newConfig = { ...templateConfig, aspectKey: '4:5' };
    await db.creatorPreviewTemplate.update({ where: { id: templateId }, data: { config: newConfig } });
    await request(instance).post(`${base}/session/${session.id}/preview/confirm`).send({ reviewId: templateReview.body.data.review.reviewId, expectedRevision: templateReview.body.data.revision }).expect(409);

    const currentSession = await request(instance).get(`${base}/session/${session.id}`).expect(200);
    const jpegReview = await reviewRequest(instance, session.id, currentSession.body.data.revision).expect(200);
    const changedJpeg = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#804020' } }).jpeg().toBuffer();
    objects.set(stagedKey, changedJpeg);
    await request(instance).post(`${base}/session/${session.id}/preview/confirm`).send({ reviewId: jpegReview.body.data.review.reviewId, expectedRevision: jpegReview.body.data.revision }).expect(409);

    objects.set(stagedKey, validJpeg);
    const latestSession = await request(instance).get(`${base}/session/${session.id}`).expect(200);
    const sourceReview = await reviewRequest(instance, session.id, latestSession.body.data.revision).expect(200);
    await db.postVersion.create({ data: { postId, versionSeq: 2, upstreamRevision: 'preview-source-2', title: 'Original artwork', publishedAt: new Date(), ingestedAt: new Date(), mediaIds: [sourceMediaId], tagIds: [], tierIds: [] } });
    await request(instance).post(`${base}/session/${session.id}/preview/confirm`).send({ reviewId: sourceReview.body.data.review.reviewId, expectedRevision: sourceReview.body.data.revision }).expect(409);
    expect(writes).toHaveLength(initialWriteCount);
    await db.mediaAsset.delete({ where: { id: foreignStagedId } });
  });
});
