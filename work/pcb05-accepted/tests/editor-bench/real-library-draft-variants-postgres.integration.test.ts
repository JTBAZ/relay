import { randomUUID, createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MediaIngestOrigin, MediaProcessingStatus, MediaUpstreamStatus, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { GalleryEditorService } from '../../src/gallery-editor/service.js';
import { registerRealLibraryConversationRoutes } from '../../src/editor-bench/real-library-conversation-routes.js';
import { loadLargeRealLibrarySnapshot } from '../../src/editor-bench/library-selection-catalog.js';
import { buildRelayR2ObjectKey } from '../../src/storage/relay-upload-r2.js';
import { approveDistributionVariant, patchDistributionVariant, startDistributionHandoff } from '../../src/distribution/post-distribution-service.js';
import { createPrismaConversationDraftVariantStore } from '../../src/distribution/conversation-draft-variants.js';
import { getCreatorScheduleRail } from '../../src/distribution/schedule-rail-service.js';

const databaseUrl = process.env.GALLERY_EDITOR_TEST_DATABASE_URL?.trim();
if (databaseUrl && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(databaseUrl).hostname)) throw new Error('Conversation draft integration tests require an explicit local test database.');

describe.skipIf(!databaseUrl)('durable Library Conversation destination drafts — PostgreSQL', () => {
  let db: PrismaClient;
  let editor: GalleryEditorService;
  let drafts: ReturnType<typeof createPrismaConversationDraftVariantStore>;
  const creatorId = `draft_it_${randomUUID()}`, accountId = `draft_account_${randomUUID()}`, campaignId = `draft_campaign_${randomUUID()}`;
  const postId = `draft_post_${randomUUID()}`, sourceMediaId = `draft_source_${randomUUID()}`, previewMediaId = `relay_m_${randomUUID()}`;
  const sourceVersionId = `draft_version_${randomUUID()}`, exportHash = createHash('sha256').update('synthetic-pcb04-jpeg').digest('hex');
  const previewReviewId = `preview_${randomUUID()}`, previewKey = buildRelayR2ObjectKey(creatorId, previewMediaId);
  const base = '/api/v1/editor-bench/real-library-conversation';
  const copyX = { postText: 'Exact X teaser copy, with punctuation.' };
  const copyDa = { title: 'Exact DeviantArt title', bodyText: 'Exact DeviantArt description.', tags: ['coast', 'study'] };

  const app = () => {
    const instance = express(); instance.use(express.json());
    registerRealLibraryConversationRoutes(instance, {
      development: true, traceId: () => 'pcb04-postgres-proof', editor, prisma: db, draftVariants: drafts,
      authenticateCreator: async () => ({ creatorId, accountId }),
      loadSnapshot: (_account, owner, signal) => loadLargeRealLibrarySnapshot(db, accountId, owner, signal),
      getProvider: async () => null, authorizeMutation: async () => ({ creatorId, accountId }),
      editorEnabled: () => true, editorStoresReady: true
    });
    return instance;
  };

  const createSession = async () => {
    const snapshot = await loadLargeRealLibrarySnapshot(db, accountId, creatorId);
    return editor.create(creatorId, accountId, { selectedPostIds: [postId], conversation: {
      catalogRevision: snapshot.catalogRevision, excludedPostIds: [], lastRequest: null, selectionInitialized: true,
      previewReceipts: [{ reviewId: previewReviewId, sourcePostId: postId, sourceVersionId, sourceMediaId, sourceMediaFingerprint: 'source-fingerprint-v1', mediaId: previewMediaId, exportHash, size: 21, templateId: 'template_1', templateUpdatedAt: new Date().toISOString(), templateConfigHash: 'template-hash', confirmedAt: new Date().toISOString() }]
    } });
  };
  const reviewCreate = (instance: express.Express, sessionId: string, revision: number, destination: 'x' | 'deviantart', copy: unknown) =>
    request(instance).post(`${base}/session/${sessionId}/draft/review`).send({ expectedRevision: revision, sourcePostId: postId, previewReviewId, destination, copy });
  const confirm = (instance: express.Express, sessionId: string, revision: number, reviewId: string) =>
    request(instance).post(`${base}/session/${sessionId}/draft/confirm`).send({ expectedRevision: revision, reviewId });

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    editor = new GalleryEditorService(db); drafts = createPrismaConversationDraftVariantStore(db);
    await db.campaign.create({ data: { id: campaignId, creatorId, name: 'Draft fixture', upstreamUpdatedAt: new Date(), versionSeq: 1 } });
    await db.post.create({ data: { id: postId, creatorId, campaignId, upstreamStatus: 'active', source: 'PATREON', createdAt: new Date(), versions: { create: {
      id: sourceVersionId, versionSeq: 1, upstreamRevision: 'draft-source-1', title: 'Source artwork', publishedAt: new Date(), ingestedAt: new Date(), mediaIds: [sourceMediaId], tagIds: ['tag_coast'], tierIds: []
    } } } });
    await db.mediaAsset.create({ data: {
      id: sourceMediaId, creatorId, postIds: [postId], primaryPostId: postId, upstreamStatus: MediaUpstreamStatus.active,
      currentVersionSeq: 1, currentUpstreamRevision: 'draft-source-media-1', currentMimeType: 'image/png', currentUpstreamUrl: 'https://example.invalid/source.png', currentRole: 'main', currentStorageKey: null,
      currentIngestedAt: new Date(), versionsJson: [], ingestOrigin: MediaIngestOrigin.PATREON, processingStatus: MediaProcessingStatus.READY, processingError: null
    } });
    await db.mediaAsset.create({ data: {
      id: previewMediaId, creatorId, postIds: [postId], primaryPostId: postId, upstreamStatus: MediaUpstreamStatus.active,
      currentVersionSeq: 1, currentUpstreamRevision: `relay:preview-export:${previewReviewId}`, currentMimeType: 'image/jpeg', currentUpstreamUrl: null, currentRole: 'preview', currentStorageKey: previewKey,
      currentIngestedAt: new Date(), versionsJson: [{ sha256: exportHash, size: 21, storage_key: previewKey, source_post_id: postId, source_version_id: sourceVersionId, review_id: previewReviewId }],
      ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD, processingStatus: MediaProcessingStatus.READY, processingError: null
    } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.galleryEditorCommit.deleteMany({ where: { creatorId } });
    await db.galleryEditorSession.deleteMany({ where: { creatorId } });
    await db.postDistributionAttempt.deleteMany({ where: { creatorId } });
    await db.postbotTask.deleteMany({ where: { creatorId } });
    await db.postDistributionPlan.deleteMany({ where: { creatorId } });
    await db.creatorPostingGoal.deleteMany({ where: { creatorId } });
    await db.mediaAsset.deleteMany({ where: { creatorId } });
    await db.post.deleteMany({ where: { creatorId } });
    await db.campaign.deleteMany({ where: { creatorId } });
    await db.$disconnect();
  });

  it('creates, reuses, edits, replays and reads exact drafts after restart while legacy writers reject managed variants', async () => {
    const instance = app(), session = await createSession();
    const firstReview = await reviewCreate(instance, session.id, session.revision, 'x', copyX).expect(200);
    const firstConfirmedRevision = firstReview.body.data.revision;
    const confirmed = await confirm(instance, session.id, firstConfirmedRevision, firstReview.body.data.review.reviewId).expect(200);
    const xReceipt = confirmed.body.data.receipt;
    expect(xReceipt).toMatchObject({ sourcePostId: postId, sourceVersionId, previewMediaId, destination: 'x', revision: 0 });
    const plan = await db.postDistributionPlan.findFirstOrThrow({ where: { id: xReceipt.planId } });
    const xVariant = await db.postDistributionVariant.findFirstOrThrow({ where: { id: xReceipt.variantId } });
    expect(plan.conversationalGroupKey).toMatch(/^conversation-draft:/);
    expect((plan.assistantPlan as any)).toMatchObject({ preview_media_id: previewMediaId, media_routing_by_destination: { x: 'preview' } });
    expect((plan.assistantPlan as any).conversation_draft_v1.variants.x.revisions[0]).toMatchObject({ revision: 0, before: null, after: copyX });
    expect(xVariant).toMatchObject({ destination: 'x', status: 'draft', postText: copyX.postText, platformFields: { media_version: 'preview', analytics_content_role: 'promo' } });
    await expect(patchDistributionVariant(db, creatorId, xVariant.id, { post_text: 'Bypass' })).rejects.toMatchObject({ details: [{ field: 'conversation_managed' }] });
    await expect(approveDistributionVariant(db, creatorId, xVariant.id)).rejects.toMatchObject({ details: [{ field: 'conversation_managed' }] });
    await expect(startDistributionHandoff(db, creatorId, xVariant.id)).rejects.toMatchObject({ details: [{ field: 'conversation_managed' }] });
    await request(instance).post(`${base}/session/${session.id}/draft/review`).send({ expectedRevision: firstConfirmedRevision + 1, sourcePostId: postId, previewReviewId: 'foreign-preview-receipt', destination: 'x', copy: copyX }).expect(409);
    await reviewCreate(instance, session.id, firstConfirmedRevision + 1, 'x', { postText: 'x'.repeat(281) }).expect(400);
    expect(await db.postDistributionVariant.count({ where: { planId: plan.id } })).toBe(1);

    await db.postDistributionVariant.update({ where: { id: xVariant.id }, data: { status: 'approved', approvedAt: new Date() } });
    const editRead = await request(instance).post(`${base}/session/${session.id}/draft/edit/review`).send({ expectedRevision: firstConfirmedRevision + 1, expectedVariantRevision: 0, variantId: xVariant.id, copy: { postText: 'Exact edited X copy.' } }).expect(200);
    const editConfirm = await request(instance).post(`${base}/session/${session.id}/draft/edit/confirm`).send({ expectedRevision: editRead.body.data.revision, reviewId: editRead.body.data.review.reviewId }).expect(200);
    expect(editConfirm.body.data.receipt.revision).toBe(1);
    const edited = await db.postDistributionVariant.findFirstOrThrow({ where: { id: xVariant.id } });
    expect(edited).toMatchObject({ status: 'draft', approvedAt: null, postText: 'Exact edited X copy.' });
    const history = (await db.postDistributionPlan.findFirstOrThrow({ where: { id: plan.id } })).assistantPlan as any;
    expect(history.conversation_draft_v1.variants.x.revisions).toMatchObject([
      { revision: 0, before: null, after: copyX },
      { revision: 1, before: copyX, after: { postText: 'Exact edited X copy.' } }
    ]);
    await request(instance).post(`${base}/session/${session.id}/draft/edit/review`).send({ expectedRevision: editRead.body.data.revision + 1, expectedVariantRevision: 0, variantId: xVariant.id, copy: { postText: 'Stale revision.' } }).expect(409);

    const daReviewA = await reviewCreate(instance, session.id, editRead.body.data.revision + 1, 'deviantart', copyDa).expect(200);
    const otherSession = await createSession();
    const daReviewB = await reviewCreate(instance, otherSession.id, otherSession.revision, 'deviantart', copyDa).expect(200);
    const [daFirst, daSecond] = await Promise.all([
      confirm(instance, session.id, daReviewA.body.data.revision, daReviewA.body.data.review.reviewId),
      confirm(instance, otherSession.id, daReviewB.body.data.revision, daReviewB.body.data.review.reviewId)
    ]);
    expect([daFirst.status, daSecond.status].sort()).toEqual([200, 200]);
    expect(daFirst.body.data.receipt.variantId).toBe(daSecond.body.data.receipt.variantId);
    const daVariant = await db.postDistributionVariant.findFirstOrThrow({ where: { id: daFirst.body.data.receipt.variantId } });
    expect(daVariant).toMatchObject({ destination: 'deviantart', title: copyDa.title, bodyText: copyDa.bodyText, tags: copyDa.tags, status: 'draft', platformFields: { media_version: 'preview', analytics_content_role: 'promo' } });
    expect(await db.postDistributionVariant.count({ where: { planId: plan.id } })).toBe(2);

    editor = new GalleryEditorService(db);
    const reopened = await request(app()).get(`${base}/session/${session.id}/drafts`).expect(200);
    expect(reopened.body.data.drafts.find((row: any) => row.variantId === xVariant.id)).toMatchObject({ currentRevision: 1, currentCopy: { postText: 'Exact edited X copy.' }, revisions: [{ revision: 0 }, { revision: 1 }] });
    const exactReplay = await confirm(app(), session.id, editRead.body.data.revision + 1, editRead.body.data.review.reviewId).expect(200);
    expect(exactReplay.body.data.replayed).toBe(true);
    const staleSourceSession = await createSession();
    const staleSourceReview = await reviewCreate(app(), staleSourceSession.id, staleSourceSession.revision, 'x', copyX).expect(200);
    await db.postPresentation.create({ data: { creatorId, postId, titleMode: 'custom', relayTitle: 'Changed after draft review' } });
    await confirm(app(), staleSourceSession.id, staleSourceReview.body.data.revision, staleSourceReview.body.data.review.reviewId).expect(409);
    expect(await db.postDistributionVariant.count({ where: { planId: plan.id } })).toBe(2);
    const durableSession = await editor.read(creatorId, accountId, session.id);
    await db.creatorPostingGoal.create({ data: { creatorId, timezone: 'Europe/Berlin' } });
    const scheduleReview = await request(app()).post(`${base}/session/${session.id}/draft/schedule/review`).send({ expectedRevision: durableSession.revision, variantId: xVariant.id, scheduledLocal: '2026-11-02T09:30' }).expect(200);
    expect(scheduleReview.body.data.review).toMatchObject({ destination: 'x', sourcePostId: postId, sourceVersionId, previewMediaId, scheduledLocal: '2026-11-02T09:30', timezone: 'Europe/Berlin', scheduledFor: '2026-11-02T08:30:00.000Z', copy: { postText: 'Exact edited X copy.' } });
    const scheduleBody = { expectedRevision: scheduleReview.body.data.revision, reviewId: scheduleReview.body.data.review.reviewId };
    const [scheduleA, scheduleB] = await Promise.all([
      request(app()).post(`${base}/session/${session.id}/draft/schedule/confirm`).send(scheduleBody),
      request(app()).post(`${base}/session/${session.id}/draft/schedule/confirm`).send(scheduleBody)
    ]);
    expect([scheduleA.status, scheduleB.status]).toEqual([200, 200]);
    expect(scheduleA.body.data.receipt.taskId).toBe(scheduleB.body.data.receipt.taskId);
    expect([scheduleA.body.data.replayed, scheduleB.body.data.replayed].sort()).toEqual([false, true]);
    expect(await db.postbotTask.count({ where: { creatorId, planId: plan.id, variantId: xVariant.id, action: 'post', status: 'pending' } })).toBe(1);
    const scheduledVariant = await db.postDistributionVariant.findFirstOrThrow({ where: { id: xVariant.id } });
    expect(scheduledVariant).toMatchObject({ scheduledFor: new Date('2026-11-02T08:30:00.000Z'), remindMe: false });
    const scheduleJournal = (await db.postDistributionPlan.findFirstOrThrow({ where: { id: plan.id } })).assistantPlan as any;
    expect(scheduleJournal.conversation_draft_v1.scheduleReceipts).toMatchObject([{ reviewId: scheduleBody.reviewId, taskId: scheduleA.body.data.receipt.taskId, timezone: 'Europe/Berlin', scheduledFor: '2026-11-02T08:30:00.000Z' }]);

    editor = new GalleryEditorService(db);
    const reopenedSession = await editor.read(creatorId, accountId, session.id);
    expect((reopenedSession.context.conversation as any).scheduleReceipts).toMatchObject([{ taskId: scheduleA.body.data.receipt.taskId, previewMediaId, scheduledLocal: '2026-11-02T09:30' }]);
    expect((await request(app()).get(`${base}/session/${session.id}/drafts`).expect(200)).body.data.scheduleReceipts).toHaveLength(1);
    const rail = await getCreatorScheduleRail(db, creatorId, { month: '2026-11', now: new Date('2026-10-25T12:00:00.000Z') });
    const railItem = [...rail.ready, ...rail.events].find(item => item.task_id === scheduleA.body.data.receipt.taskId);
    expect(rail.timezone).toBe('Europe/Berlin');
    expect(railItem).toMatchObject({ post_id: postId, variant_id: xVariant.id, at: '2026-11-02T08:30:00.000Z', media_ids: [previewMediaId], media_count: 1, needs_media: false });
    expect([...rail.ready, ...rail.events].filter(item => item.task_id === scheduleA.body.data.receipt.taskId)).toHaveLength(1);

    const daSession = await editor.read(creatorId, accountId, session.id);
    const timezoneReview = await request(app()).post(`${base}/session/${session.id}/draft/schedule/review`).send({ expectedRevision: daSession.revision, variantId: daVariant.id, scheduledLocal: '2026-11-03T09:30' }).expect(200);
    await db.creatorPostingGoal.update({ where: { creatorId }, data: { timezone: 'UTC' } });
    const reviewedScheduleSession = await editor.read(creatorId, accountId, session.id);
    const pendingSchedule = reviewedScheduleSession.context.conversation!.pendingScheduleReview!;
    await expect(drafts.confirmSchedule({
      reviewId: pendingSchedule.id, creatorId, actorId: accountId, sessionId: session.id,
      sessionRevision: reviewedScheduleSession.revision, nowMs: Date.now(),
      expectedVariantRevision: pendingSchedule.expectedVariantRevision, variantId: pendingSchedule.variantId,
      planId: pendingSchedule.planId, destination: pendingSchedule.destination, sourcePostId: pendingSchedule.sourcePostId,
      sourceVersionId: pendingSchedule.sourceVersionId, previewMediaId: pendingSchedule.previewMediaId,
      exportHash: pendingSchedule.exportHash, scheduledLocal: pendingSchedule.scheduledLocal,
      timezone: pendingSchedule.timezone, scheduledFor: pendingSchedule.scheduledFor
    })).rejects.toMatchObject({ code: 'conflict' });
    expect(await db.postbotTask.count({ where: { creatorId, planId: plan.id } })).toBe(1);
    await db.creatorPostingGoal.update({ where: { creatorId }, data: { timezone: 'Europe/Berlin' } });

    const refreshed = await request(app()).post(`${base}/session/${session.id}/refresh`).send({ expectedRevision: (await editor.read(creatorId, accountId, session.id)).revision }).expect(200);
    expect(refreshed.body.data.draftReceipts).toHaveLength(3);
    expect(refreshed.body.data.scheduleReceipts).toHaveLength(1);
    const draftReceipts = await request(app()).get(`${base}/session/${session.id}/drafts`).expect(200);
    expect(draftReceipts.body.data.drafts).toHaveLength(2);
  });
});
