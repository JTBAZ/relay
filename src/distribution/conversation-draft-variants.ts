import { randomUUID } from 'node:crypto';
import { MediaProcessingStatus, MediaUpstreamStatus, PostUpstreamStatus, Prisma, type PrismaClient } from '@prisma/client';
import { fingerprint } from '../gallery-editor/state.js';
import { serializable } from '../gallery-editor/service.js';
import { resolveLibraryPosts } from '../gallery-editor/context.js';
import { buildDistributionPlanCreateData, buildDistributionVariantCreateData } from './distribution-row-builders.js';
import { buildVariantMediaPlatformFields } from './media-binding.js';
import type { FormattedPlatformVariant } from './platform-formatters.js';
import { getCreatorPostingGoal, resolvePostingGoalTimezone } from '../autopost/posting-goal-service.js';
import { parseStrictScheduledLocal, resolveZonedLocalDateTimeToUtc } from '../goal-cycle/planner/schedule-local.js';

export type ConversationDraftDestination = 'x' | 'deviantart';
export type ConversationDraftCopy = { postText: string } | { title: string; bodyText: string; tags: string[] };
export type ConversationDraftIdentity = {
  reviewId: string; creatorId: string; actorId: string; sessionId: string; sessionRevision: number;
  sourcePostId: string; sourceVersionId: string; previewMediaId: string; exportHash: string;
  sourceDigest: string;
  destination: ConversationDraftDestination; copy: ConversationDraftCopy;
};
type JournalEntry = { revision: number; reviewId: string; before: ConversationDraftCopy | null; after: ConversationDraftCopy; confirmedAt: string };
type ManagedHandoffReceipt = { reviewId: string; attemptId: string; planId: string; variantId: string; destination: ConversationDraftDestination; sourcePostId: string; sourceVersionId: string; previewMediaId: string; exportHash: string; copyHash: string; revision: number; taskId: string; scheduledFor: string; confirmedAt: string };
type ManagedState = { version: 1; sourcePostId: string; sourceVersionId: string; previewMediaId: string; exportHash: string; sourceDigest: string; variants: Record<string, { variantId: string; revision: number; revisions: JournalEntry[] }>; scheduleReceipts?: ConversationScheduleReceipt[]; handoffReceipts?: ManagedHandoffReceipt[] };
type Receipt = { reviewId: string; planId: string; variantId: string; destination: ConversationDraftDestination; sourcePostId: string; sourceVersionId: string; previewMediaId: string; revision: number; confirmedAt: string };
export type ConversationScheduleReceipt = { reviewId: string; planId: string; variantId: string; taskId: string; destination: ConversationDraftDestination; sourcePostId: string; sourceVersionId: string; previewMediaId: string; scheduledLocal: string; timezone: string; scheduledFor: string; confirmedAt: string };
const ns = 'conversation_draft_v1';
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const validCopy = (destination: ConversationDraftDestination, copy: ConversationDraftCopy) => destination === 'x'
  ? 'postText' in copy && copy.postText.trim().length > 0 && copy.postText.length <= 280
  : 'title' in copy && 'bodyText' in copy && Array.isArray(copy.tags) && Boolean(copy.title.trim()) && Boolean(copy.bodyText.trim()) && copy.tags.length <= 30;
const same = (a: unknown, b: unknown) => fingerprint(a) === fingerprint(b);

export class ConversationDraftError extends Error {
  constructor(public readonly code: 'invalid' | 'conflict' | 'not_found' | 'unavailable', message: string) { super(message); }
}

export function createPrismaConversationDraftVariantStore(prisma: PrismaClient) {
  async function currentSourceDigest(tx: Prisma.TransactionClient, creatorId: string, sourcePostId: string) {
    const post = await tx.post.findFirst({ where: { id: sourcePostId, creatorId, upstreamStatus: PostUpstreamStatus.active }, select: { id: true, versions: { orderBy: { versionSeq: 'desc' }, take: 1, select: { id: true } } } });
    const resolved = await resolveLibraryPosts(tx, creatorId, [sourcePostId]);
    const current = resolved.resolvedPosts[0];
    if (!post?.versions[0] || !current) throw new ConversationDraftError('conflict', 'The selected source is no longer available.');
    return fingerprint({ versionId: post.versions[0].id, current });
  }

  async function validateReceipt(tx: Prisma.TransactionClient, input: Pick<ConversationDraftIdentity, 'creatorId' | 'sourcePostId' | 'sourceVersionId' | 'previewMediaId' | 'exportHash' | 'sourceDigest'>) {
    const [post, media] = await Promise.all([
      tx.post.findFirst({ where: { id: input.sourcePostId, creatorId: input.creatorId, upstreamStatus: PostUpstreamStatus.active }, select: { id: true, versions: { where: { id: input.sourceVersionId }, select: { id: true }, take: 1 } } }),
      tx.mediaAsset.findFirst({ where: { id: input.previewMediaId, creatorId: input.creatorId, primaryPostId: input.sourcePostId, upstreamStatus: MediaUpstreamStatus.active, processingStatus: MediaProcessingStatus.READY, currentMimeType: 'image/jpeg' }, select: { id: true, versionsJson: true, currentStorageKey: true } })
    ]);
    const provenance = Array.isArray(media?.versionsJson) ? object(media.versionsJson[0]) : {};
    if (!post || !post.versions.length || !media || provenance.sha256 !== input.exportHash || provenance.source_version_id !== input.sourceVersionId || provenance.source_post_id !== input.sourcePostId || media.currentStorageKey !== provenance.storage_key) throw new ConversationDraftError('conflict', 'The selected source or confirmed Previewizer export is no longer available.');
    if (await currentSourceDigest(tx, input.creatorId, input.sourcePostId) !== input.sourceDigest) throw new ConversationDraftError('conflict', 'The Library source changed after draft review. Review the copy again.');
  }

  async function validatePinnedAssets(tx: Prisma.TransactionClient, creatorId: string, state: ManagedState) {
    const [post, media] = await Promise.all([
      tx.post.findFirst({ where: { id: state.sourcePostId, creatorId, upstreamStatus: PostUpstreamStatus.active }, select: { id: true, versions: { where: { id: state.sourceVersionId }, select: { id: true }, take: 1 } } }),
      tx.mediaAsset.findFirst({ where: { id: state.previewMediaId, creatorId, primaryPostId: state.sourcePostId, upstreamStatus: MediaUpstreamStatus.active, processingStatus: MediaProcessingStatus.READY, currentMimeType: 'image/jpeg' }, select: { id: true, versionsJson: true, currentStorageKey: true } })
    ]);
    const provenance = Array.isArray(media?.versionsJson) ? object(media.versionsJson[0]) : {};
    if (!post?.versions.length || !media || provenance.sha256 !== state.exportHash || provenance.source_version_id !== state.sourceVersionId || provenance.source_post_id !== state.sourcePostId || media.currentStorageKey !== provenance.storage_key) throw new ConversationDraftError('conflict', 'The selected source or confirmed Previewizer export is no longer available.');
  }

  async function recordScheduleReview(creatorId: string, variantId: string) {
    const managed = await inspectManaged(creatorId, variantId);
    if (!['draft', 'approved'].includes(managed.row.status)) throw new ConversationDraftError('conflict', 'This destination draft can no longer be scheduled.');
    await serializable(prisma, tx => validatePinnedAssets(tx, creatorId, managed.state));
    return managed;
  }

  async function confirmSchedule(input: {
    reviewId: string; creatorId: string; actorId: string; sessionId: string; sessionRevision: number; nowMs: number;
    expectedVariantRevision: number; variantId: string; planId: string; destination: ConversationDraftDestination;
    sourcePostId: string; sourceVersionId: string; previewMediaId: string; exportHash: string;
    scheduledLocal: string; timezone: string; scheduledFor: string;
  }): Promise<{ receipt: ConversationScheduleReceipt; reused: boolean }> {
    const scheduledFor = new Date(input.scheduledFor);
    if (!Number.isFinite(scheduledFor.getTime()) || scheduledFor.toISOString() !== input.scheduledFor) throw new ConversationDraftError('invalid', 'The reviewed UTC schedule is invalid.');
    return serializable(prisma, async tx => {
      const replaySession = await tx.galleryEditorSession.findFirst({ where: { id: input.sessionId, creatorId: input.creatorId, actorId: input.actorId }, select: { context: true } });
      const replayContext = object(replaySession?.context), replayConversation = object(replayContext.conversation);
      const sessionReceipt = (Array.isArray(replayConversation.scheduleReceipts) ? replayConversation.scheduleReceipts : []).find((row: any) => row.reviewId === input.reviewId) as ConversationScheduleReceipt | undefined;
      if (sessionReceipt) return { receipt: sessionReceipt, reused: true };

      await tx.$queryRaw`SELECT id FROM gallery_editor_sessions WHERE id = ${input.sessionId} AND creator_id = ${input.creatorId} AND actor_id = ${input.actorId} FOR UPDATE`;
      const session = await tx.galleryEditorSession.findFirst({ where: { id: input.sessionId, creatorId: input.creatorId, actorId: input.actorId } });
      const context = object(session?.context), conversation = object(context.conversation), pending = object(conversation.pendingScheduleReview);
      if (!session || session.revision !== input.sessionRevision || pending.id !== input.reviewId || pending.expectedRevision !== input.sessionRevision || pending.expiresAt <= input.nowMs || pending.expectedVariantRevision !== input.expectedVariantRevision || pending.variantId !== input.variantId || pending.planId !== input.planId || pending.destination !== input.destination || pending.sourcePostId !== input.sourcePostId || pending.sourceVersionId !== input.sourceVersionId || pending.previewMediaId !== input.previewMediaId || pending.exportHash !== input.exportHash || pending.scheduledLocal !== input.scheduledLocal || pending.timezone !== input.timezone || pending.scheduledFor !== input.scheduledFor || context.selectedPostIds?.length !== 1 || context.selectedPostIds[0] !== input.sourcePostId) throw new ConversationDraftError('conflict', 'The schedule review is stale. Review the date again.');

      await tx.$queryRaw`SELECT id FROM post_distribution_plans WHERE id = ${input.planId} AND creator_id = ${input.creatorId} FOR UPDATE`;
      const plan = await tx.postDistributionPlan.findFirst({ where: { id: input.planId, creatorId: input.creatorId } });
      const state = object(object(plan?.assistantPlan)[ns]) as ManagedState;
      const entry = state.variants?.[input.destination];
      if (!plan?.conversationalGroupKey?.startsWith('conversation-draft:') || state.version !== 1 || state.sourcePostId !== input.sourcePostId || state.sourceVersionId !== input.sourceVersionId || state.previewMediaId !== input.previewMediaId || state.exportHash !== input.exportHash || !entry || entry.variantId !== input.variantId || entry.revision !== input.expectedVariantRevision) throw new ConversationDraftError('conflict', 'The destination draft changed after schedule review. Review it again.');
      await validatePinnedAssets(tx, input.creatorId, state);
      const timezone = resolvePostingGoalTimezone((await getCreatorPostingGoal(tx as unknown as PrismaClient, input.creatorId)).timezone);
      const localParts = parseStrictScheduledLocal(input.scheduledLocal);
      if (timezone !== input.timezone || !localParts || resolveZonedLocalDateTimeToUtc(localParts, timezone).toISOString() !== input.scheduledFor) throw new ConversationDraftError('conflict', 'The creator time zone or reviewed local date changed. Review the schedule again.');
      const variant = await tx.postDistributionVariant.findFirst({ where: { id: input.variantId, creatorId: input.creatorId, planId: input.planId, postId: input.sourcePostId, destination: input.destination } });
      if (!variant || !['draft', 'approved'].includes(variant.status)) throw new ConversationDraftError('conflict', 'The destination draft can no longer be scheduled.');
      const priorTask = await tx.postbotTask.findFirst({ where: { creatorId: input.creatorId, planId: input.planId, variantId: input.variantId, action: 'post' } });
      if (priorTask) throw new ConversationDraftError('conflict', 'This destination already has a Rail task. Review the current schedule.');
      const changed = await tx.postDistributionVariant.updateMany({ where: { id: variant.id, creatorId: input.creatorId, updatedAt: variant.updatedAt, status: variant.status }, data: { scheduledFor, remindMe: false } });
      if (changed.count !== 1) throw new ConversationDraftError('conflict', 'The destination draft changed while its schedule was confirmed.');
      const task = await tx.postbotTask.create({ data: { creatorId: input.creatorId, postId: input.sourcePostId, planId: input.planId, variantId: input.variantId, destination: input.destination, action: 'post', rationale: 'Creator-confirmed schedule.', suggestedTime: scheduledFor, remindMe: false, status: 'pending' } });
      const confirmedAt = new Date().toISOString();
      const receipt: ConversationScheduleReceipt = { reviewId: input.reviewId, planId: input.planId, variantId: input.variantId, taskId: task.id, destination: input.destination, sourcePostId: input.sourcePostId, sourceVersionId: input.sourceVersionId, previewMediaId: input.previewMediaId, scheduledLocal: input.scheduledLocal, timezone: input.timezone, scheduledFor: scheduledFor.toISOString(), confirmedAt };
      const priorReceipts = Array.isArray(state.scheduleReceipts) ? state.scheduleReceipts : [];
      await tx.postDistributionPlan.update({ where: { id: plan.id }, data: { assistantPlan: { ...object(plan.assistantPlan), [ns]: { ...state, scheduleReceipts: [...priorReceipts, receipt] } } as Prisma.InputJsonValue } });
      const cart = object(session.cart);
      const nextConversation = { ...conversation, pendingScheduleReview: undefined, scheduleReceipts: [...(Array.isArray(conversation.scheduleReceipts) ? conversation.scheduleReceipts : []), receipt] };
      const updated = await tx.galleryEditorSession.updateMany({ where: { id: input.sessionId, creatorId: input.creatorId, actorId: input.actorId, revision: input.sessionRevision }, data: { revision: input.sessionRevision + 1, context: { ...context, conversation: nextConversation } as Prisma.InputJsonValue, cart: { ...cart, revision: input.sessionRevision + 1 } as Prisma.InputJsonValue } });
      if (updated.count !== 1) throw new ConversationDraftError('conflict', 'The conversation changed before the schedule was confirmed.');
      return { receipt, reused: false };
    });
  }

  const copyFor = (destination: ConversationDraftDestination, row: { postText: string | null; title: string | null; bodyText: string | null; tags: string[] }): ConversationDraftCopy =>
    destination === 'x' ? { postText: row.postText ?? '' } : { title: row.title ?? '', bodyText: row.bodyText ?? '', tags: [...row.tags] };

  async function recordHandoffReview(creatorId: string, variantId: string) {
    const managed = await inspectManaged(creatorId, variantId);
    const copy = copyFor(managed.row.destination as ConversationDraftDestination, managed.row);
    const revision = [...managed.entry.revisions].reverse().find(row => row.revision === managed.entry.revision);
    const schedule = [...(managed.state.scheduleReceipts ?? [])].reverse().find(row => row.variantId === variantId);
    if (!['draft', 'approved'].includes(managed.row.status) || !revision || !same(revision.after, copy) || !schedule || schedule.planId !== managed.plan.id || schedule.destination !== managed.row.destination || schedule.sourcePostId !== managed.state.sourcePostId || schedule.sourceVersionId !== managed.state.sourceVersionId || schedule.previewMediaId !== managed.state.previewMediaId) throw new ConversationDraftError('conflict', 'The destination draft needs a current confirmed Rail schedule before handoff.');
    await serializable(prisma, async tx => {
      await validatePinnedAssets(tx, creatorId, managed.state);
      const task = await tx.postbotTask.findFirst({ where: { id: schedule.taskId, creatorId, planId: managed.plan.id, postId: managed.state.sourcePostId, variantId, destination: managed.row.destination, action: 'post', status: 'pending' }, select: { id: true, suggestedTime: true } });
      if (!task?.suggestedTime || task.suggestedTime.toISOString() !== schedule.scheduledFor || managed.row.scheduledFor?.toISOString() !== schedule.scheduledFor) throw new ConversationDraftError('conflict', 'The confirmed Rail cue changed. Review the schedule again.');
    });
    return { ...managed, copy, copyHash: fingerprint(copy), schedule };
  }

  async function confirmHandoff(input: {
    reviewId: string; creatorId: string; actorId: string; sessionId: string; sessionRevision: number; nowMs: number;
    expectedVariantRevision: number; variantId: string; planId: string; destination: ConversationDraftDestination;
    sourcePostId: string; sourceVersionId: string; previewMediaId: string; exportHash: string; copyHash: string;
    taskId: string; scheduledFor: string;
  }): Promise<{ receipt: ManagedHandoffReceipt; reused: boolean }> {
    return serializable(prisma, async tx => {
      const sessionKey = { id: input.sessionId, creatorId: input.creatorId, actorId: input.actorId };
      const replaySession = await tx.galleryEditorSession.findFirst({ where: sessionKey, select: { context: true } });
      const replayContext = object(replaySession?.context), replayConversation = object(replayContext.conversation);
      const sessionReceipt = (Array.isArray(replayConversation.handoffReceipts) ? replayConversation.handoffReceipts : []).find((row: any) => row.reviewId === input.reviewId) as ManagedHandoffReceipt | undefined;
      if (sessionReceipt) return { receipt: sessionReceipt, reused: true };

      await tx.$queryRaw`SELECT id FROM gallery_editor_sessions WHERE id = ${input.sessionId} AND creator_id = ${input.creatorId} AND actor_id = ${input.actorId} FOR UPDATE`;
      const session = await tx.galleryEditorSession.findFirst({ where: sessionKey });
      const context = object(session?.context), conversation = object(context.conversation), pending = object(conversation.pendingHandoffReview);
      if (!session || session.revision !== input.sessionRevision || pending.id !== input.reviewId || pending.expectedRevision !== input.sessionRevision || pending.expiresAt <= input.nowMs || pending.expectedVariantRevision !== input.expectedVariantRevision || pending.variantId !== input.variantId || pending.planId !== input.planId || pending.destination !== input.destination || pending.sourcePostId !== input.sourcePostId || pending.sourceVersionId !== input.sourceVersionId || pending.previewMediaId !== input.previewMediaId || pending.exportHash !== input.exportHash || pending.copyHash !== input.copyHash || pending.taskId !== input.taskId || pending.scheduledFor !== input.scheduledFor || context.selectedPostIds?.length !== 1 || context.selectedPostIds[0] !== input.sourcePostId) throw new ConversationDraftError('conflict', 'This handoff review is stale. Review the current draft again.');

      await tx.$queryRaw`SELECT id FROM post_distribution_plans WHERE id = ${input.planId} AND creator_id = ${input.creatorId} FOR UPDATE`;
      const plan = await tx.postDistributionPlan.findFirst({ where: { id: input.planId, creatorId: input.creatorId } });
      const state = object(object(plan?.assistantPlan)[ns]) as ManagedState;
      const entry = state.variants?.[input.destination];
      if (!plan?.conversationalGroupKey?.startsWith('conversation-draft:') || state.version !== 1 || state.sourcePostId !== input.sourcePostId || state.sourceVersionId !== input.sourceVersionId || state.previewMediaId !== input.previewMediaId || state.exportHash !== input.exportHash || !entry || entry.variantId !== input.variantId || entry.revision !== input.expectedVariantRevision) throw new ConversationDraftError('conflict', 'The destination draft changed after handoff review. Review it again.');
      const prior = (state.handoffReceipts ?? []).find(row => row.reviewId === input.reviewId);
      if (prior) return { receipt: prior, reused: true };

      await tx.$queryRaw`SELECT id FROM post_distribution_variants WHERE id = ${input.variantId} AND creator_id = ${input.creatorId} AND plan_id = ${input.planId} FOR UPDATE`;
      const variant = await tx.postDistributionVariant.findFirst({ where: { id: input.variantId, creatorId: input.creatorId, planId: input.planId, postId: input.sourcePostId, destination: input.destination } });
      if (!variant || !['draft', 'approved'].includes(variant.status)) throw new ConversationDraftError('conflict', 'The destination draft is no longer available for handoff.');
      const copy = copyFor(input.destination, variant);
      const latestRevision = [...entry.revisions].reverse().find(row => row.revision === entry.revision);
      if (fingerprint(copy) !== input.copyHash || !latestRevision || !same(latestRevision.after, copy)) throw new ConversationDraftError('conflict', 'The approved copy changed after handoff review. Review it again.');
      await validatePinnedAssets(tx, input.creatorId, state);

      await tx.$queryRaw`SELECT id FROM postbot_tasks WHERE id = ${input.taskId} AND creator_id = ${input.creatorId} AND plan_id = ${input.planId} AND variant_id = ${input.variantId} FOR UPDATE`;
      const schedule = [...(state.scheduleReceipts ?? [])].reverse().find(row => row.variantId === input.variantId && row.taskId === input.taskId);
      const task = await tx.postbotTask.findFirst({ where: { id: input.taskId, creatorId: input.creatorId, planId: input.planId, postId: input.sourcePostId, variantId: input.variantId, destination: input.destination, action: 'post', status: 'pending' }, select: { id: true, suggestedTime: true } });
      if (!schedule || schedule.scheduledFor !== input.scheduledFor || !task?.suggestedTime || task.suggestedTime.toISOString() !== input.scheduledFor || variant.scheduledFor?.toISOString() !== input.scheduledFor) throw new ConversationDraftError('conflict', 'The confirmed Rail cue changed after handoff review. Review the schedule again.');

      const priorForRevision = (state.handoffReceipts ?? []).find(row => row.variantId === input.variantId && row.revision === entry.revision);
      if (priorForRevision) return { receipt: priorForRevision, reused: true };
      const confirmedAt = new Date(input.nowMs).toISOString();
      const receipt: ManagedHandoffReceipt = { reviewId: input.reviewId, attemptId: `pda_${randomUUID()}`, planId: input.planId, variantId: input.variantId, destination: input.destination, sourcePostId: input.sourcePostId, sourceVersionId: input.sourceVersionId, previewMediaId: input.previewMediaId, exportHash: input.exportHash, copyHash: input.copyHash, revision: entry.revision, taskId: input.taskId, scheduledFor: input.scheduledFor, confirmedAt };
      const updatedVariant = await tx.postDistributionVariant.updateMany({ where: { id: input.variantId, creatorId: input.creatorId, planId: input.planId, updatedAt: variant.updatedAt, status: variant.status }, data: { status: 'handed_off', approvedAt: variant.approvedAt ?? new Date(input.nowMs) } });
      if (updatedVariant.count !== 1) throw new ConversationDraftError('conflict', 'The destination draft changed while handoff was confirmed.');
      await tx.postDistributionAttempt.create({ data: { id: receipt.attemptId, variantId: input.variantId, postId: input.sourcePostId, creatorId: input.creatorId, destination: input.destination, status: 'started' } });
      await tx.postDistributionPlan.update({ where: { id: input.planId }, data: { assistantPlan: { ...object(plan.assistantPlan), [ns]: { ...state, handoffReceipts: [...(state.handoffReceipts ?? []), receipt] } } as Prisma.InputJsonValue } });
      const cart = object(session.cart);
      const nextConversation: Record<string, any> = { ...conversation, handoffReceipts: [...(Array.isArray(conversation.handoffReceipts) ? conversation.handoffReceipts : []), receipt] };
      delete nextConversation.pendingHandoffReview;
      const updatedSession = await tx.galleryEditorSession.updateMany({ where: { id: input.sessionId, creatorId: input.creatorId, actorId: input.actorId, revision: input.sessionRevision }, data: { revision: input.sessionRevision + 1, context: { ...context, conversation: nextConversation } as Prisma.InputJsonValue, cart: { ...cart, revision: input.sessionRevision + 1 } as Prisma.InputJsonValue } });
      if (updatedSession.count !== 1) throw new ConversationDraftError('conflict', 'The conversation changed before handoff was confirmed.');
      return { receipt, reused: false };
    });
  }

  async function lockSession(tx: Prisma.TransactionClient, input: ConversationDraftIdentity & { expectedVariantRevision?: number; variantId?: string }, expectedReviewKind: 'create' | 'edit') {
    await tx.$queryRaw`SELECT id FROM gallery_editor_sessions WHERE id = ${input.sessionId} AND creator_id = ${input.creatorId} AND actor_id = ${input.actorId} FOR UPDATE`;
    const session = await tx.galleryEditorSession.findFirst({ where: { id: input.sessionId, creatorId: input.creatorId, actorId: input.actorId } });
    const context = object(session?.context), conversation = object(context.conversation), pending = object(conversation.pendingDraftReview);
    if (!session || session.revision !== input.sessionRevision || pending.id !== input.reviewId || pending.kind !== expectedReviewKind || pending.expectedRevision !== input.sessionRevision || pending.expiresAt <= Date.now() || context.selectedPostIds?.length !== 1 || context.selectedPostIds[0] !== input.sourcePostId || pending.sourcePostId !== input.sourcePostId || pending.sourceVersionId !== input.sourceVersionId || pending.previewMediaId !== input.previewMediaId || pending.exportHash !== input.exportHash || pending.sourceDigest !== input.sourceDigest || pending.destination !== input.destination || fingerprint(pending.after) !== fingerprint(input.copy) || (expectedReviewKind === 'create' && (pending.before !== null || pending.variantId !== undefined)) || (expectedReviewKind === 'edit' && (pending.expectedVariantRevision !== input.expectedVariantRevision || pending.variantId !== (input as ConversationDraftIdentity & { variantId?: string }).variantId))) throw new ConversationDraftError('conflict', 'The draft review is stale. Review the copy again.');
    return { session, context, conversation };
  }

  async function findReplay(tx: Prisma.TransactionClient, input: ConversationDraftIdentity, groupKey: string, variantId?: string): Promise<Receipt | null> {
    const session = await tx.galleryEditorSession.findFirst({ where: { id: input.sessionId, creatorId: input.creatorId, actorId: input.actorId }, select: { context: true } });
    const context = object(session?.context), conversation = object(context.conversation);
    const receipt = (Array.isArray(conversation.draftReceipts) ? conversation.draftReceipts : []).find((item: any) => item.reviewId === input.reviewId);
    if (receipt) return receipt as Receipt;
    const plan = variantId
      ? await tx.postDistributionPlan.findFirst({ where: { creatorId: input.creatorId, conversationalGroupKey: groupKey }, include: { variants: true } })
      : await tx.postDistributionPlan.findFirst({ where: { creatorId: input.creatorId, postId: input.sourcePostId, conversationalGroupKey: groupKey }, include: { variants: true } });
    if (!plan) return null;
    const state = object(object(plan.assistantPlan)[ns]) as ManagedState;
    const entry = state.variants?.[input.destination];
    if (!entry || (variantId && entry.variantId !== variantId)) return null;
    const revision = entry.revisions.find(row => row.reviewId === input.reviewId);
    return revision ? { reviewId: input.reviewId, planId: plan.id, variantId: entry.variantId, destination: input.destination, sourcePostId: state.sourcePostId, sourceVersionId: state.sourceVersionId, previewMediaId: state.previewMediaId, revision: revision.revision, confirmedAt: revision.confirmedAt } : null;
  }

  async function appendReceiptAndAdvanceSession(tx: Prisma.TransactionClient, input: ConversationDraftIdentity, context: Record<string, any>, conversation: Record<string, any>, receipt: Receipt) {
    const nextConversation: Record<string, any> = { ...conversation, draftReceipts: [...(Array.isArray(conversation.draftReceipts) ? conversation.draftReceipts : []), receipt] };
    delete nextConversation.pendingDraftReview;
    const nextContext = { ...context, conversation: nextConversation };
    const session = await tx.galleryEditorSession.findFirstOrThrow({ where: { id: input.sessionId, creatorId: input.creatorId, actorId: input.actorId } });
    const cart = object(session.cart);
    const changed = await tx.galleryEditorSession.updateMany({ where: { id: input.sessionId, creatorId: input.creatorId, actorId: input.actorId, revision: input.sessionRevision }, data: {
      revision: input.sessionRevision + 1, context: nextContext as Prisma.InputJsonValue,
      cart: { ...cart, revision: input.sessionRevision + 1 } as Prisma.InputJsonValue
    } });
    if (changed.count !== 1) throw new ConversationDraftError('conflict', 'The conversation changed before the draft was confirmed.');
  }

  async function confirmCreate(input: ConversationDraftIdentity): Promise<{ receipt: Receipt; reused: boolean }> {
    if (!validCopy(input.destination, input.copy)) throw new ConversationDraftError('invalid', 'The copy is empty or exceeds the destination limits.');
    const groupKey = `conversation-draft:${fingerprint({ creatorId: input.creatorId, sourcePostId: input.sourcePostId, sourceVersionId: input.sourceVersionId, previewMediaId: input.previewMediaId, exportHash: input.exportHash })}`;
    return serializable(prisma, async tx => {
      const replay = await findReplay(tx, input, groupKey);
      if (replay) return { receipt: replay, reused: true };
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${groupKey}, 0))`;
      const { context, conversation } = await lockSession(tx, input, 'create');
      await validateReceipt(tx, input);
      const post = await tx.post.findFirstOrThrow({ where: { id: input.sourcePostId, creatorId: input.creatorId }, select: { id: true } });
      let plan = await tx.postDistributionPlan.findFirst({ where: { creatorId: input.creatorId, postId: post.id, conversationalGroupKey: groupKey }, include: { variants: true } });
      let state: ManagedState;
      if (plan) {
        const planData = object(plan.assistantPlan), stored = object(planData[ns]);
        if (stored.version !== 1 || stored.sourcePostId !== input.sourcePostId || stored.sourceVersionId !== input.sourceVersionId || stored.previewMediaId !== input.previewMediaId || stored.exportHash !== input.exportHash) throw new ConversationDraftError('conflict', 'A conflicting managed draft already exists.');
        state = stored as ManagedState;
      } else {
        state = { version: 1, sourcePostId: input.sourcePostId, sourceVersionId: input.sourceVersionId, previewMediaId: input.previewMediaId, exportHash: input.exportHash, sourceDigest: input.sourceDigest, variants: {} };
        const data = buildDistributionPlanCreateData({ creatorId: input.creatorId, postId: post.id, status: 'active', assistantMode: 'none', assistantContext: {}, assistantPlan: { preview_media_id: input.previewMediaId, media_routing_by_destination: { [input.destination]: 'preview' }, [ns]: state } });
        plan = await tx.postDistributionPlan.create({ data: { ...data, conversationalGroupKey: groupKey }, include: { variants: true } });
      }
      const existing = plan.variants?.find(row => row.destination === input.destination);
      let variantId: string, revision: number, reused = false, confirmedAt = new Date().toISOString();
      if (existing) {
        const entry = state.variants[input.destination];
        if (!entry || entry.variantId !== existing.id) throw new ConversationDraftError('conflict', 'The destination draft needs review in Conversation.');
        const previous = entry.revisions.find(row => row.reviewId === input.reviewId);
        if (previous) {
          const receipt = { reviewId: input.reviewId, planId: plan.id, variantId: existing.id, destination: input.destination, sourcePostId: input.sourcePostId, sourceVersionId: input.sourceVersionId, previewMediaId: input.previewMediaId, revision: previous.revision, confirmedAt: previous.confirmedAt };
          return { receipt, reused: true };
        }
        const currentCopy = input.destination === 'x' ? { postText: existing.postText ?? '' } : { title: existing.title ?? '', bodyText: existing.bodyText ?? '', tags: existing.tags };
        if (!same(currentCopy, input.copy)) throw new ConversationDraftError('conflict', 'A draft already exists for this source and export. Review it through the edit flow.');
        variantId = existing.id; revision = entry.revision; reused = true;
      } else {
        const daCopy = input.copy as Extract<ConversationDraftCopy, { title: string }>;
        const formatted: FormattedPlatformVariant = input.destination === 'x'
          ? { destination: 'x', title: null, bodyText: null, postText: (input.copy as Extract<ConversationDraftCopy, { postText: string }>).postText, tags: [], platformFields: buildVariantMediaPlatformFields({ mediaVersion: 'preview', destination: 'x' }), advice: { warnings: [] } }
          : { destination: 'deviantart', title: daCopy.title, bodyText: daCopy.bodyText, postText: null, tags: [...daCopy.tags], platformFields: { mature: false, no_ai: false, created_using_ai: false, ...buildVariantMediaPlatformFields({ mediaVersion: 'preview', destination: 'deviantart' }) }, advice: { warnings: [] } };
        const row = await tx.postDistributionVariant.create({ data: buildDistributionVariantCreateData({ planId: plan.id, postId: post.id, creatorId: input.creatorId, variant: formatted, status: 'draft', assistantEnabled: false }) });
        variantId = row.id; revision = 0;
        state.variants[input.destination] = { variantId, revision, revisions: [{ revision, reviewId: input.reviewId, before: null, after: input.copy, confirmedAt }] };
        const nextPlan = { ...object(plan.assistantPlan), preview_media_id: input.previewMediaId, media_routing_by_destination: { ...object(object(plan.assistantPlan).media_routing_by_destination), [input.destination]: 'preview' }, [ns]: state };
        await tx.postDistributionPlan.update({ where: { id: plan.id }, data: { assistantPlan: nextPlan as Prisma.InputJsonValue } });
        plan = { ...plan, assistantPlan: nextPlan, variants: [...(plan.variants ?? []), row] };
      }
      const receipt: Receipt = { reviewId: input.reviewId, planId: plan.id, variantId, destination: input.destination, sourcePostId: input.sourcePostId, sourceVersionId: input.sourceVersionId, previewMediaId: input.previewMediaId, revision, confirmedAt };
      await appendReceiptAndAdvanceSession(tx, input, context, conversation, receipt);
      return { receipt, reused };
    });
  }

  async function inspectManaged(creatorId: string, variantId: string) {
    const row = await prisma.postDistributionVariant.findFirst({ where: { id: variantId, creatorId }, include: { plan: true } });
    if (!row) throw new ConversationDraftError('not_found', 'Destination draft not found.');
    const state = object(object(row.plan.assistantPlan)[ns]) as ManagedState;
    const entry = state.variants?.[row.destination];
    if (!row.plan.conversationalGroupKey?.startsWith('conversation-draft:') || state.version !== 1 || !entry || entry.variantId !== row.id) throw new ConversationDraftError('not_found', 'Destination draft is not managed by Conversation.');
    return { row, plan: row.plan, state, entry };
  }

  async function readHistory(creatorId: string, receipts: Receipt[]) {
    const uniqueReceipts = [...new Map(receipts.map(receipt => [receipt.variantId, receipt])).values()];
    const rows = await Promise.all(uniqueReceipts.map(async receipt => {
      const managed = await inspectManaged(creatorId, receipt.variantId);
      if (managed.plan.id !== receipt.planId || managed.state.sourcePostId !== receipt.sourcePostId || managed.state.sourceVersionId !== receipt.sourceVersionId || managed.state.previewMediaId !== receipt.previewMediaId) return null;
      const currentCopy = receipt.destination === 'x'
        ? { postText: managed.row.postText ?? '' }
        : { title: managed.row.title ?? '', bodyText: managed.row.bodyText ?? '', tags: managed.row.tags };
      return { ...receipt, currentRevision: managed.entry.revision, currentCopy, revisions: managed.entry.revisions };
    }));
    return rows.filter((row): row is NonNullable<typeof row> => row !== null);
  }

  async function assertReceipt(input: Pick<ConversationDraftIdentity, 'creatorId' | 'sourcePostId' | 'sourceVersionId' | 'previewMediaId' | 'exportHash'>) {
    await serializable(prisma, async tx => validateReceipt(tx, { ...input, sourceDigest: await currentSourceDigest(tx, input.creatorId, input.sourcePostId) }));
  }

  async function readSourceDigest(creatorId: string, sourcePostId: string) { return serializable(prisma, tx => currentSourceDigest(tx, creatorId, sourcePostId)); }

  async function confirmEdit(input: ConversationDraftIdentity & { variantId: string; expectedVariantRevision: number }): Promise<{ receipt: Receipt; reused: boolean }> {
    if (!validCopy(input.destination, input.copy)) throw new ConversationDraftError('invalid', 'The copy is empty or exceeds the destination limits.');
    const groupKey = `conversation-draft:${fingerprint({ creatorId: input.creatorId, sourcePostId: input.sourcePostId, sourceVersionId: input.sourceVersionId, previewMediaId: input.previewMediaId, exportHash: input.exportHash })}`;
    return serializable(prisma, async tx => {
      const replay = await findReplay(tx, input, groupKey, input.variantId);
      if (replay) return { receipt: replay, reused: true };
      const { context, conversation } = await lockSession(tx, input, 'edit');
      await validateReceipt(tx, input);
      const found = await tx.postDistributionVariant.findFirst({ where: { id: input.variantId, creatorId: input.creatorId }, include: { plan: true } });
      if (!found) throw new ConversationDraftError('not_found', 'Destination draft not found.');
      await tx.$queryRaw`SELECT id FROM post_distribution_plans WHERE id = ${found.planId} AND creator_id = ${input.creatorId} FOR UPDATE`;
      const plan = await tx.postDistributionPlan.findFirstOrThrow({ where: { id: found.planId, creatorId: input.creatorId } });
      const state = object(object(plan.assistantPlan)[ns]) as ManagedState, entry = state.variants?.[input.destination];
      if (!entry || entry.variantId !== found.id || state.sourcePostId !== input.sourcePostId || state.sourceVersionId !== input.sourceVersionId || state.previewMediaId !== input.previewMediaId || state.exportHash !== input.exportHash || found.destination !== input.destination) throw new ConversationDraftError('not_found', 'Destination draft is not managed by Conversation.');
      if (entry.revision !== input.expectedVariantRevision || found.status === 'posted' || found.status === 'handed_off' || found.status === 'skipped') throw new ConversationDraftError('conflict', 'The destination draft changed or can no longer be edited. Review it again.');
      const before: ConversationDraftCopy = input.destination === 'x' ? { postText: found.postText ?? '' } : { title: found.title ?? '', bodyText: found.bodyText ?? '', tags: found.tags };
      if (fingerprint(before) !== fingerprint(object(object(conversation.pendingDraftReview).before))) throw new ConversationDraftError('conflict', 'The destination copy changed after review. Review it again.');
      const confirmedAt = new Date().toISOString(), revision = entry.revision + 1;
      const afterEntry: JournalEntry = { revision, reviewId: input.reviewId, before, after: input.copy, confirmedAt };
      const nextState: ManagedState = { ...state, variants: { ...state.variants, [input.destination]: { ...entry, revision, revisions: [...entry.revisions, afterEntry] } } };
      const daCopy = input.copy as Extract<ConversationDraftCopy, { title: string }>;
      const formatted: FormattedPlatformVariant = input.destination === 'x'
        ? { destination: 'x', title: null, bodyText: null, postText: (input.copy as Extract<ConversationDraftCopy, { postText: string }>).postText, tags: [], platformFields: object(found.platformFields), advice: {} }
        : { destination: 'deviantart', title: daCopy.title, bodyText: daCopy.bodyText, postText: null, tags: [...daCopy.tags], platformFields: object(found.platformFields), advice: {} };
      const data = buildDistributionVariantCreateData({ planId: found.planId, postId: found.postId, creatorId: found.creatorId, variant: formatted, status: 'draft', assistantEnabled: false });
      const { planId: _planId, postId: _postId, creatorId: _creatorId, destination: _destination, ...variantData } = data;
      const update = await tx.postDistributionVariant.updateMany({ where: { id: found.id, creatorId: input.creatorId, updatedAt: found.updatedAt, status: found.status }, data: { ...variantData, approvedAt: null } });
      if (update.count !== 1) throw new ConversationDraftError('conflict', 'The destination draft changed while the edit was confirmed.');
      const nextPlan = { ...object(plan.assistantPlan), [ns]: nextState };
      await tx.postDistributionPlan.update({ where: { id: plan.id }, data: { assistantPlan: nextPlan as Prisma.InputJsonValue } });
      const receipt: Receipt = { reviewId: input.reviewId, planId: plan.id, variantId: found.id, destination: input.destination, sourcePostId: state.sourcePostId, sourceVersionId: state.sourceVersionId, previewMediaId: state.previewMediaId, revision, confirmedAt };
      await appendReceiptAndAdvanceSession(tx, input, context, conversation, receipt);
      return { receipt, reused: false };
    });
  }

  return { confirmCreate, confirmEdit, inspectManaged, assertReceipt, readSourceDigest, readHistory, recordScheduleReview, confirmSchedule, recordHandoffReview, confirmHandoff };
}
