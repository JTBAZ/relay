import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { MediaIngestOrigin, MediaProcessingStatus, MediaUpstreamStatus, Prisma, type PrismaClient } from '@prisma/client';
import { parsePreviewTemplateConfig, type PreviewTemplateConfigV1 } from '../distribution/preview-template-config.js';
import { buildRelayR2ObjectKey } from '../storage/relay-upload-r2.js';
import { serializable } from '../gallery-editor/service.js';
import { fingerprint } from '../gallery-editor/state.js';
import type { EditorContext } from '../gallery-editor/types.js';

export const MAX_REAL_PREVIEW_BYTES = 1024 * 1024;
const REVIEW_TTL_MS = 15 * 60_000;

export type PreviewObjectStore = {
  read(key: string, maxBytes: number): Promise<Buffer>;
  putIfAbsent(key: string, bytes: Buffer, contentType: 'image/jpeg'): Promise<boolean>;
};

export type PreviewReviewFacts = {
  sourceVersionId: string;
  sourceMediaFingerprint: string;
  templateUpdatedAt: string;
  templateConfig: PreviewTemplateConfigV1;
  templateConfigHash: string;
  stagedStorageKey: string;
  exportHash: string;
  size: number;
};

export type PreviewReviewInput = {
  creatorId: string;
  sourcePostId: string;
  sourceMediaId: string;
  templateId: string;
  stagedMediaId: string;
};

export type PreviewExportStore = {
  inspect(input: PreviewReviewInput): Promise<PreviewReviewFacts>;
  confirm(input: {
    creatorId: string;
    actorId: string;
    sessionId: string;
    revision: number;
    review: NonNullable<NonNullable<EditorContext['conversation']>['pendingPreviewReview']>;
    now: Date;
  }): Promise<NonNullable<NonNullable<EditorContext['conversation']>['previewReceipts']>[number]>;
};

function mediaFingerprint(row: {
  creatorId: string; id: string; upstreamStatus: string; currentVersionSeq: number;
  currentUpstreamRevision: string; currentStorageKey: string | null; currentMimeType: string | null;
  currentUpstreamUrl: string | null; processingStatus: string;
}): string {
  return fingerprint([row.creatorId, row.id, row.upstreamStatus, row.currentVersionSeq, row.currentUpstreamRevision,
    row.currentStorageKey, row.currentMimeType, row.currentUpstreamUrl, row.processingStatus]);
}

async function validatedJpeg(bytes: Buffer): Promise<{ hash: string; size: number }> {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_REAL_PREVIEW_BYTES) throw new Error('preview_invalid_size');
  try {
    const metadata = await sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' }).metadata();
    if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height) throw new Error('preview_invalid_jpeg');
    await sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' }).stats();
  } catch { throw new Error('preview_invalid_jpeg'); }
  return { hash: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
}

async function readSource(prisma: PrismaClient | Prisma.TransactionClient, creatorId: string, postId: string, mediaId: string) {
  const post = await prisma.post.findFirst({
    where: { id: postId, creatorId, upstreamStatus: 'active' },
    select: { id: true, versions: { orderBy: { versionSeq: 'desc' }, take: 1, select: { id: true, mediaIds: true } } }
  });
  const version = post?.versions[0];
  if (!version || !version.mediaIds.includes(mediaId)) throw new Error('preview_source_changed');
  const media = await prisma.mediaAsset.findFirst({ where: { id: mediaId, creatorId }, select: {
    id: true, creatorId: true, primaryPostId: true, postIds: true, upstreamStatus: true, currentVersionSeq: true,
    currentUpstreamRevision: true, currentStorageKey: true, currentMimeType: true, currentUpstreamUrl: true,
    processingStatus: true, currentRole: true
  } });
  if (!media || media.upstreamStatus !== MediaUpstreamStatus.active || media.processingStatus !== MediaProcessingStatus.READY ||
      !media.currentMimeType?.toLowerCase().startsWith('image/') || (media.primaryPostId !== postId && !media.postIds.includes(postId))) {
    throw new Error('preview_source_changed');
  }
  return { post, version, media, fingerprint: mediaFingerprint(media) };
}

function failIfStale(error: unknown): never {
  if (error instanceof Error && error.message.startsWith('preview_')) throw error;
  throw new Error('preview_confirmation_conflict');
}

export function createPrismaRealLibraryPreviewExportStore(prisma: PrismaClient, objects: PreviewObjectStore): PreviewExportStore {
  return {
    async inspect(input) {
      const { version, fingerprint: sourceFingerprint } = await readSource(prisma, input.creatorId, input.sourcePostId, input.sourceMediaId);
      const [template, staged] = await Promise.all([
        prisma.creatorPreviewTemplate.findFirst({ where: { id: input.templateId, creatorId: input.creatorId }, select: { id: true, updatedAt: true, config: true } }),
        prisma.mediaAsset.findFirst({ where: { id: input.stagedMediaId, creatorId: input.creatorId, ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD }, select: {
          id: true, creatorId: true, primaryPostId: true, postIds: true, upstreamStatus: true, processingStatus: true,
          currentMimeType: true, currentStorageKey: true
        } })
      ]);
      if (!template) throw new Error('preview_template_unavailable');
      if (!staged || staged.primaryPostId || staged.postIds.length || staged.upstreamStatus !== MediaUpstreamStatus.active || staged.processingStatus !== MediaProcessingStatus.READY || staged.currentMimeType?.toLowerCase() !== 'image/jpeg' || staged.currentStorageKey !== buildRelayR2ObjectKey(input.creatorId, staged.id)) throw new Error('preview_upload_unavailable');
      const templateConfig = parsePreviewTemplateConfig(template.config);
      const bytes = await objects.read(staged.currentStorageKey, MAX_REAL_PREVIEW_BYTES);
      const validated = await validatedJpeg(bytes);
      return { sourceVersionId: version.id, sourceMediaFingerprint: sourceFingerprint,
        templateUpdatedAt: template.updatedAt.toISOString(), templateConfig,
        templateConfigHash: fingerprint(templateConfig), stagedStorageKey: staged.currentStorageKey,
        exportHash: validated.hash, size: validated.size };
    },

    async confirm({ creatorId, actorId, sessionId, revision, review, now }) {
      if (review.expiresAt <= now.getTime()) throw new Error('preview_review_expired');
      const staged = await prisma.mediaAsset.findFirst({ where: { id: review.stagedMediaId, creatorId, ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD }, select: {
        id: true, primaryPostId: true, postIds: true, upstreamStatus: true, processingStatus: true,
        currentMimeType: true, currentStorageKey: true
      } });
      if (!staged || staged.primaryPostId || staged.postIds.length || staged.upstreamStatus !== MediaUpstreamStatus.active || staged.processingStatus !== MediaProcessingStatus.READY || staged.currentMimeType?.toLowerCase() !== 'image/jpeg' || staged.currentStorageKey !== review.stagedStorageKey || staged.currentStorageKey !== buildRelayR2ObjectKey(creatorId, staged.id)) throw new Error('preview_upload_changed');
      const bytes = await objects.read(review.stagedStorageKey, MAX_REAL_PREVIEW_BYTES);
      const validated = await validatedJpeg(bytes);
      if (validated.hash !== review.exportHash || validated.size !== review.size) throw new Error('preview_upload_changed');

      const mediaId = `relay_preview_${fingerprint([creatorId, sessionId, review.id])}`;
      const storageKey = buildRelayR2ObjectKey(creatorId, mediaId);
      if (!(await objects.putIfAbsent(storageKey, bytes, 'image/jpeg'))) {
        const sealed = await objects.read(storageKey, MAX_REAL_PREVIEW_BYTES);
        const sealedFacts = await validatedJpeg(sealed);
        if (sealedFacts.hash !== review.exportHash || sealedFacts.size !== review.size) throw new Error('preview_sealed_object_conflict');
      }

      const receipt = {
        reviewId: review.id, sourcePostId: review.sourcePostId, sourceVersionId: review.sourceVersionId,
        sourceMediaId: review.sourceMediaId, sourceMediaFingerprint: review.sourceMediaFingerprint,
        mediaId, exportHash: review.exportHash, size: review.size,
        templateId: review.templateId, templateUpdatedAt: review.templateUpdatedAt,
        templateConfigHash: review.templateConfigHash, confirmedAt: now.toISOString()
      };
      let committedReceipt = receipt;
      try {
        await serializable(prisma, async tx => {
          await tx.$queryRaw`SELECT id FROM gallery_editor_sessions WHERE id = ${sessionId} AND creator_id = ${creatorId} AND actor_id = ${actorId} FOR UPDATE`;
          const session = await tx.galleryEditorSession.findFirst({ where: { id: sessionId, creatorId, actorId } });
          if (!session) throw new Error('preview_confirmation_conflict');
          const context = session.context as unknown as EditorContext;
          const conversation = context.conversation;
          const replay = conversation?.previewReceipts?.find(item => item.reviewId === review.id);
          if (replay) { committedReceipt = replay; return; }
          if (session.revision !== revision || !conversation || fingerprint(conversation.pendingPreviewReview) !== fingerprint(review) || review.expectedRevision !== revision || review.expiresAt <= now.getTime() ||
              context.selectedPostIds.length !== 1 || context.selectedPostIds[0] !== review.sourcePostId) throw new Error('preview_confirmation_conflict');
          await tx.$queryRaw`SELECT id FROM posts WHERE id = ${review.sourcePostId} AND creator_id = ${creatorId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM media_assets WHERE id = ${review.sourceMediaId} AND creator_id = ${creatorId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM media_assets WHERE id = ${review.stagedMediaId} AND creator_id = ${creatorId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM creator_preview_templates WHERE id = ${review.templateId} AND creator_id = ${creatorId} FOR UPDATE`;
          const source = await readSource(tx, creatorId, review.sourcePostId, review.sourceMediaId);
          const [template, stagedNow, existing] = await Promise.all([
            tx.creatorPreviewTemplate.findFirst({ where: { id: review.templateId, creatorId }, select: { updatedAt: true, config: true } }),
            tx.mediaAsset.findFirst({ where: { id: review.stagedMediaId, creatorId, ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD }, select: { currentStorageKey: true, processingStatus: true, currentMimeType: true, primaryPostId: true, postIds: true, upstreamStatus: true } }),
            tx.mediaAsset.findFirst({ where: { id: mediaId, creatorId } })
          ]);
          if (source.version.id !== review.sourceVersionId || source.fingerprint !== review.sourceMediaFingerprint || !template || template.updatedAt.toISOString() !== review.templateUpdatedAt ||
              fingerprint(parsePreviewTemplateConfig(template.config)) !== review.templateConfigHash || !stagedNow || stagedNow.currentStorageKey !== review.stagedStorageKey ||
              stagedNow.processingStatus !== MediaProcessingStatus.READY || stagedNow.currentMimeType?.toLowerCase() !== 'image/jpeg' || stagedNow.primaryPostId || stagedNow.postIds.length || stagedNow.upstreamStatus !== MediaUpstreamStatus.active || stagedNow.currentStorageKey !== buildRelayR2ObjectKey(creatorId, review.stagedMediaId)) {
            throw new Error('preview_confirmation_conflict');
          }
          if (existing) {
            const versions = Array.isArray(existing.versionsJson) ? existing.versionsJson as Array<Record<string, unknown>> : [];
            const provenance = versions[0];
            if (existing.creatorId !== creatorId || existing.primaryPostId !== review.sourcePostId || existing.currentStorageKey !== storageKey || existing.processingStatus !== MediaProcessingStatus.READY ||
                provenance?.sha256 !== review.exportHash || provenance?.review_id !== review.id || provenance?.source_media_fingerprint !== review.sourceMediaFingerprint ||
                provenance?.source_version_id !== review.sourceVersionId || provenance?.source_post_id !== review.sourcePostId || provenance?.template_config_hash !== review.templateConfigHash) throw new Error('preview_sealed_media_conflict');
          } else {
            await tx.mediaAsset.create({ data: {
              id: mediaId, creatorId, postIds: [review.sourcePostId], primaryPostId: review.sourcePostId,
              upstreamStatus: MediaUpstreamStatus.active, currentVersionSeq: 1, currentUpstreamRevision: `relay:preview-export:${review.id}`,
              currentMimeType: 'image/jpeg', currentUpstreamUrl: null, currentRole: 'preview', currentStorageKey: storageKey,
              currentIngestedAt: now, versionsJson: [{ version_seq: 1, upstream_revision: `relay:preview-export:${review.id}`, mime_type: 'image/jpeg', storage_key: storageKey, ingested_at: now.toISOString(), sha256: review.exportHash, size: review.size, source_post_id: review.sourcePostId, source_version_id: review.sourceVersionId, source_media_id: review.sourceMediaId, source_media_fingerprint: review.sourceMediaFingerprint, template_id: review.templateId, template_updated_at: review.templateUpdatedAt, template_config: review.templateConfig as Prisma.InputJsonValue, template_config_hash: review.templateConfigHash, staged_media_id: review.stagedMediaId, review_id: review.id }] as unknown as Prisma.InputJsonValue,
              ingestOrigin: MediaIngestOrigin.RELAY_UPLOAD, processingStatus: MediaProcessingStatus.READY, processingError: null
            } });
          }
          const nextContext: EditorContext = { ...context, conversation: { ...conversation, pendingPreviewReview: undefined, previewReceipts: [...(conversation.previewReceipts ?? []), receipt] } };
          const cart = session.cart as Record<string, unknown>;
          const updated = await tx.galleryEditorSession.updateMany({ where: { id: sessionId, creatorId, actorId, revision }, data: { revision: revision + 1, cart: { ...cart, revision: revision + 1 } as Prisma.InputJsonValue, context: nextContext as unknown as Prisma.InputJsonValue } });
          if (updated.count !== 1) throw new Error('preview_confirmation_conflict');
        });
      } catch (error) { failIfStale(error); }
      return committedReceipt;
    }
  };
}

export function previewExportErrorMessage(error: unknown): { status: number; code: string; message: string } {
  const known: Record<string, [number, string, string]> = {
    preview_invalid_size: [413, 'PREVIEW_TOO_LARGE', 'The JPEG is empty or exceeds the 1 MiB Previewizer limit.'],
    preview_invalid_jpeg: [400, 'INVALID_PREVIEW', 'The uploaded file is not a valid JPEG image.'],
    preview_source_changed: [409, 'SOURCE_CHANGED', 'The selected source image changed. Review the export again.'],
    preview_template_unavailable: [404, 'TEMPLATE_NOT_FOUND', 'The owned Previewizer template is unavailable.'],
    preview_upload_unavailable: [409, 'UPLOAD_NOT_READY', 'The uploaded JPEG is not an owned ready Previewizer upload.'],
    preview_upload_changed: [409, 'PREVIEW_CHANGED', 'The uploaded JPEG changed after review. Review it again.'],
    preview_review_expired: [409, 'REVIEW_EXPIRED', 'This Previewizer review expired. Review the export again.'],
    preview_confirmation_conflict: [409, 'CONFLICT', 'The source, template, or conversation changed. Review the export again.'],
    preview_sealed_object_conflict: [409, 'CONFLICT', 'A conflicting sealed Previewizer asset already exists.'],
    preview_sealed_media_conflict: [409, 'CONFLICT', 'A conflicting sealed Previewizer asset already exists.']
  };
  const key = error instanceof Error ? error.message : '';
  const value = known[key];
  return value ? { status: value[0], code: value[1], message: value[2] } : { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'The Previewizer export could not be confirmed.' };
}

export function previewConfigHash(config: PreviewTemplateConfigV1): string { return fingerprint(config); }
export function previewReviewExpiry(nowMs: number): number { return nowMs + REVIEW_TTL_MS; }
