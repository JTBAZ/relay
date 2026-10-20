import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import type { CreateCreatorScheduleEventBody, CreatorScheduleEventWire } from '../distribution/creator-schedule-event-contract.js';
import { CreatorScheduleEventNotFoundError, CreatorScheduleEventPlanRequiredError, CreatorScheduleEventValidationError } from '../distribution/creator-schedule-event-service.js';
import type { LibraryScheduleAttachment, LibraryScheduleSource } from '../distribution/library-schedule-source.js';
import { errorEnvelope, successEnvelope } from '../contracts/api.js';
import { reviewRealLibraryManualEvents, type RealLibraryScheduleReview } from './real-library-review.js';
import { reviewBenchSchedule, type ScheduleReview, type ScheduleReviewPayload } from './schedule-review.js';
import { bindBenchVariantSource, commitBenchVariantV3, createBenchDistributionVariantAdapter, loadBenchVariantSource, reviewBenchVariantV3, sha256, type BenchVariantBinding, type BenchVariantEditClaims, type BenchVariantRows, type BenchVariantSource } from './distribution-variant-adapter.js';
import type { EditorProvider } from '../gallery-editor/provider.js';
import { interpretBenchVariantEdit, resolveBenchVariantEditTarget, variantChatInputBytes, type BenchVariantChatCandidate } from './variant-chat.js';
import { createBenchConversationStore, conversationSnapshot, interpretBenchConversation, resolveConversationSelection, conversationFixtureHash } from './conversation.js';
import { runCurationBench } from './curation.js';
import { effectivePostTitle, simulateEditorActions, buildChangeCart } from '../gallery-editor/state.js';
import { createBenchPostCards } from './fixtures.js';
import { currentBenchRequestClock } from './routing.js';

const TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_LIMIT = 8_192;
const CREATE_KEYS = ['event_type', 'destination', 'title', 'note', 'due_at', 'remind_me', 'target_mode', 'post_id', 'external_url', 'create_relay_draft'];

export type BenchScheduleEventFacts = {
  eventType: string;
  destination: string | null;
  title: string;
  note: string | null;
  dueAt: Date;
  postId: string | null;
  externalUrl: string | null;
  remindMe: boolean;
  mediaIds?: string[];
};

type OwnedEvent = { facts: BenchScheduleEventFacts; event: CreatorScheduleEventWire };
type Principal = { creatorId: string; accountId: string };
export type BenchScheduleRouteOptions = {
  development: boolean;
  signingSecret: Buffer;
  authenticateCreator: (req: Request, options: { readonlySession: true }) => Promise<Principal | null>;
  guardMutation: (req: Request, res: Response, traceId: string, creatorId: string) => Promise<boolean>;
  assertCorePlan?: (creatorId: string) => Promise<void>;
  createEvent: (creatorId: string, payload: ScheduleReviewPayload, eventId: string, attachment?: LibraryScheduleAttachment) => Promise<CreatorScheduleEventWire>;
  readEvent: (creatorId: string, eventId: string) => Promise<OwnedEvent | null>;
  getLibrarySource?: (creatorId: string, postId: string) => Promise<LibraryScheduleSource>;
  validateLibraryAttachment?: (creatorId: string, binding: LibraryScheduleAttachment) => Promise<LibraryScheduleSource>;
  traceId: (req: Request) => string;
  distributionVariantAdapter?: ReturnType<typeof createBenchDistributionVariantAdapter>;
  getVariantEditProvider?: () => Promise<EditorProvider | null>;
  loadBenchVariantSource?: (creatorId: string, postId: string, mediaIds: string[]) => Promise<BenchVariantSource | null> | BenchVariantSource | null;
};

type SignedReviewV1 = { v: 1; creatorId: string; expiresAt: number; payload: ScheduleReviewPayload };
type SignedReviewV2 = { v: 2; creatorId: string; expiresAt: number; payload: ScheduleReviewPayload; attachment: LibraryScheduleAttachment };
type SignedReviewV3 = { v: 3; creatorId: string; expiresAt: number; payload: ScheduleReviewPayload; source: BenchVariantBinding; variantHash: string };
type SignedReview = SignedReviewV1 | SignedReviewV2 | SignedReviewV3;
type SignedVariantEdit = { kind: 'bench_variant_edit_v1'; expiresAt: number } & BenchVariantEditClaims;
type SignedConversationReview = { kind: 'bench_conversation_pending_v1'; creatorId: string; sessionId: string; pendingId: string; revision: number; actionHash: string; sourceHash: string; expiresAt: number };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function hasStandaloneReference(text: string, reference: string): boolean {
  let from = 0;
  while (from <= text.length - reference.length) {
    const index = text.toLocaleLowerCase('en-GB').indexOf(reference.toLocaleLowerCase('en-GB'), from);
    if (index < 0) return false;
    const before = text[index - 1] ?? '', after = text[index + reference.length] ?? '';
    if (!/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after)) return true;
    from = index + 1;
  }
  return false;
}
function signature(secret: Buffer, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}
function tokenFor(secret: Buffer, claims: SignedReview): string {
  const encoded = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${encoded}.${signature(secret, encoded)}`;
}
function variantEditTokenFor(secret: Buffer, claims: SignedVariantEdit): string {
  const encoded = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${encoded}.${signature(secret, encoded)}`;
}
function conversationTokenFor(secret: Buffer, claims: SignedConversationReview): string {
  const encoded = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${encoded}.${signature(secret, encoded)}`;
}
function verifyConversationToken(secret: Buffer, token: unknown): SignedConversationReview | null {
  if (typeof token !== 'string' || token.length < 20 || token.length > TOKEN_LIMIT) return null;
  const split = token.split('.'); if (split.length !== 2) return null;
  const [encoded, supplied] = split as [string, string];
  const expected = signature(secret, encoded), a = Buffer.from(supplied, 'base64url'), b = Buffer.from(expected, 'base64url');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const keys = ['kind', 'creatorId', 'sessionId', 'pendingId', 'revision', 'actionHash', 'sourceHash', 'expiresAt'];
    if (!record(value) || !exactKeys(value, keys) || value.kind !== 'bench_conversation_pending_v1' || typeof value.creatorId !== 'string' || typeof value.sessionId !== 'string' || typeof value.pendingId !== 'string' ||
        !Number.isSafeInteger(value.revision) || typeof value.actionHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.actionHash) || typeof value.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceHash) ||
        !Number.isSafeInteger(value.expiresAt) || (value.expiresAt as number) <= Date.now()) return null;
    return value as SignedConversationReview;
  } catch { return null; }
}
function verifyVariantEditToken(secret: Buffer, token: unknown): SignedVariantEdit | null {
  if (typeof token !== 'string' || token.length < 20 || token.length > TOKEN_LIMIT) return null;
  const split = token.split('.');
  if (split.length !== 2) return null;
  const [encoded, supplied] = split as [string, string];
  const expected = signature(secret, encoded);
  const a = Buffer.from(supplied, 'base64url'), b = Buffer.from(expected, 'base64url');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const keys = ['kind', 'expiresAt', 'creatorId', 'variantId', 'eventId', 'planId', 'field', 'destination', 'expectedRevision', 'oldTextHash', 'newText', 'sourceVersionKey', 'sourceFingerprint'];
    if (!record(parsed) || !exactKeys(parsed, keys) || parsed.kind !== 'bench_variant_edit_v1' || typeof parsed.creatorId !== 'string' || !parsed.creatorId ||
        typeof parsed.expiresAt !== 'number' || !Number.isSafeInteger(parsed.expiresAt) || parsed.expiresAt <= Date.now() ||
        typeof parsed.variantId !== 'string' || !parsed.variantId.startsWith('bench_variant_') || typeof parsed.eventId !== 'string' || !parsed.eventId.startsWith('bench_event_') ||
        typeof parsed.planId !== 'string' || !parsed.planId.startsWith('bench_plan_') ||
        (parsed.field !== 'postText' && parsed.field !== 'title') || (parsed.destination !== 'x' && parsed.destination !== 'deviantart') ||
        parsed.field !== (parsed.destination === 'x' ? 'postText' : 'title') || !Number.isSafeInteger(parsed.expectedRevision) || (parsed.expectedRevision as number) < 0 ||
        typeof parsed.oldTextHash !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.oldTextHash) || typeof parsed.newText !== 'string' ||
        !parsed.newText || parsed.newText !== parsed.newText.trim() || parsed.newText.length > 200 ||
        typeof parsed.sourceVersionKey !== 'string' || parsed.sourceVersionKey.length > 160 || typeof parsed.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.sourceFingerprint)) return null;
    return parsed as SignedVariantEdit;
  } catch { return null; }
}
function validPayload(value: unknown, version: 1 | 2 = 1): value is ScheduleReviewPayload {
  if (!record(value) || !exactKeys(value, CREATE_KEYS)) return false;
  if (value.event_type !== 'make_post' || !['patreon', 'x', 'deviantart'].includes(String(value.destination)) || value.remind_me !== false ||
      value.external_url !== null || value.create_relay_draft !== false ||
      typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200 || value.title !== value.title.trim() ||
      typeof value.note !== 'string' || value.note.length > 2000 || typeof value.due_at !== 'string') return false;
  if (version === 1 ? value.target_mode !== 'new_post' || value.post_id !== null : value.target_mode !== 'existing_post' || typeof value.post_id !== 'string' || !value.post_id.trim()) return false;
  const due = new Date(value.due_at);
  return Number.isFinite(due.getTime()) && due.toISOString() === value.due_at && due.getTime() > Date.now();
}
function validAttachment(value: unknown): value is LibraryScheduleAttachment {
  return record(value) && exactKeys(value, ['postId', 'versionId', 'mediaIds']) &&
    typeof value.postId === 'string' && !!value.postId.trim() && !value.postId.startsWith('bench_') &&
    typeof value.versionId === 'string' && !!value.versionId.trim() &&
    Array.isArray(value.mediaIds) && value.mediaIds.length >= 1 && value.mediaIds.length <= 3 &&
    value.mediaIds.every(id => typeof id === 'string' && !!id.trim() && !id.startsWith('bench_')) && new Set(value.mediaIds).size === value.mediaIds.length;
}
function verifyToken(secret: Buffer, token: unknown): SignedReview | null {
  if (typeof token !== 'string' || token.length < 20 || token.length > TOKEN_LIMIT) return null;
  const split = token.split('.');
  if (split.length !== 2) return null;
  const [encoded, supplied] = split as [string, string];
  const expected = signature(secret, encoded);
  const a = Buffer.from(supplied, 'base64url'), b = Buffer.from(expected, 'base64url');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!record(parsed) || (parsed.v !== 1 && parsed.v !== 2 && parsed.v !== 3) || typeof parsed.creatorId !== 'string' || !parsed.creatorId ||
        typeof parsed.expiresAt !== 'number' || !Number.isSafeInteger(parsed.expiresAt) || parsed.expiresAt <= Date.now()) return null;
    if (parsed.v === 1) {
      if (!exactKeys(parsed, ['v', 'creatorId', 'expiresAt', 'payload']) || !validPayload(parsed.payload, 1)) return null;
      return parsed as SignedReviewV1;
    }
    if (parsed.v === 3) {
      if (!exactKeys(parsed, ['v', 'creatorId', 'expiresAt', 'payload', 'source', 'variantHash']) || !validPayload(parsed.payload, 1) ||
          parsed.payload.destination !== 'x' && parsed.payload.destination !== 'deviantart' ||
          typeof parsed.variantHash !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.variantHash) || !record(parsed.source) ||
          !exactKeys(parsed.source, ['postId', 'mediaIds', 'versionKey', 'fingerprint']) ||
          typeof parsed.source.postId !== 'string' || !parsed.source.postId.startsWith('bench_post_') ||
          !Array.isArray(parsed.source.mediaIds) || parsed.source.mediaIds.length < 1 || parsed.source.mediaIds.length > 3 ||
          parsed.source.mediaIds.some(id => typeof id !== 'string' || !id.startsWith('bench_media_')) || new Set(parsed.source.mediaIds).size !== parsed.source.mediaIds.length ||
          typeof parsed.source.versionKey !== 'string' || parsed.source.versionKey.length > 160 || typeof parsed.source.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.source.fingerprint)) return null;
      return parsed as SignedReviewV3;
    }
    if (!exactKeys(parsed, ['v', 'creatorId', 'expiresAt', 'payload', 'attachment']) || !validPayload(parsed.payload, 2) || !validAttachment(parsed.attachment) || parsed.payload.post_id !== parsed.attachment.postId) return null;
    return parsed as SignedReviewV2;
  } catch { return null; }
}
function eventId(creatorId: string, payload: ScheduleReviewPayload, attachment?: LibraryScheduleAttachment): string {
  const hash = createHash('sha256');
  if (attachment) hash.update('relay-editor-bench-event-id-v2\0').update(creatorId).update('\0').update(JSON.stringify(payload)).update('\0').update(attachment.postId).update('\0').update(JSON.stringify(attachment.mediaIds));
  else hash.update('relay-editor-bench-event-id-v1\0').update(creatorId).update('\0').update(JSON.stringify(payload));
  const digest = hash.digest('hex');
  return `bench_event_${digest}`;
}
function factsMatch(event: OwnedEvent, claims: SignedReview): boolean {
  const payload = claims.payload;
  const common = event.facts.eventType === payload.event_type && event.facts.destination === payload.destination &&
    event.facts.title === payload.title && event.facts.note === payload.note &&
    event.facts.dueAt.toISOString() === payload.due_at && event.facts.postId === payload.post_id &&
    event.facts.externalUrl === null && event.facts.remindMe === false;
  if (!common) return false;
  if (claims.v === 1) return payload.post_id === null && !(event.facts.mediaIds?.length);
  if (claims.v === 2) return event.facts.postId === claims.attachment.postId && JSON.stringify(event.facts.mediaIds ?? []) === JSON.stringify(claims.attachment.mediaIds);
  return false;
}
function invalid(res: Response, traceId: string, message: string) {
  return res.status(400).json(errorEnvelope('VALIDATION_ERROR', message, traceId));
}

function buildVariantEditReview(options: BenchScheduleRouteOptions, creatorId: string, variantId: string, expectedRevision: number, newText: string):
  | { kind: 'not_found' }
  | { kind: 'invalid'; message: string }
  | { kind: 'stale'; currentRevision: number }
  | { kind: 'review'; body: Record<string, unknown> } {
  const adapter = options.distributionVariantAdapter;
  if (!adapter) return { kind: 'not_found' };
  const found = adapter.readVariant(creatorId, variantId);
  if (!found) return { kind: 'not_found' };
  const { currentRows: rows } = found;
  const variant = rows.variant;
  const event = rows.event;
  const destination = variant.destination;
  const field: BenchVariantEditClaims['field'] | null = destination === 'x' ? 'postText' : destination === 'deviantart' ? 'title' : null;
  const source = variant.advice?.bench_source_v1?.source;
  const currentRevision = variant.advice?.bench_variant_revisions_v1?.currentRevision;
  const oldText = field ? variant[field] : null;
  const linkedAndPinned = field && typeof oldText === 'string' && event.id === variant.advice?.bench_source_v1?.event_link?.event_id &&
    event.linkage?.plan_id === rows.plan.id && event.linkage?.variant_id === variant.id && variant.planId === rows.plan.id &&
    event.destination === destination && event.title === oldText && typeof source?.version_key === 'string' && typeof source?.fingerprint === 'string';
  if (variant.status !== 'draft' || event.status !== 'pending' || !linkedAndPinned) return { kind: 'invalid', message: 'This draft or its linked pending cue is no longer editable.' };
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 0) return { kind: 'invalid', message: 'This draft has no valid edit revision.' };
  if (expectedRevision !== currentRevision) return { kind: 'stale', currentRevision };
  if (!newText.trim() || newText !== newText.trim() || newText.length > 200 || (destination === 'x' && newText.length > 280)) return { kind: 'invalid', message: 'Provide trimmed posting text within the destination limit.' };
  const common = { variantId: variant.id, eventId: event.id, planId: rows.plan.id, field: field!, destination: destination as 'x' | 'deviantart' };
  const sourcePin = { sourceVersionKey: source.version_key as string, sourceFingerprint: source.fingerprint as string };
  const preview = { ...common, expectedRevision: currentRevision, ...sourcePin, oldText, newText, fieldDiff: { field, before: oldText, after: newText } };
  if (newText === oldText) return { kind: 'review', body: { unchanged: true, ...preview } };
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const claims: SignedVariantEdit = { kind: 'bench_variant_edit_v1', expiresAt, creatorId, ...common,
    expectedRevision: currentRevision, oldTextHash: sha256(oldText), newText, ...sourcePin };
  return { kind: 'review', body: { unchanged: false, ...preview, reviewToken: variantEditTokenFor(options.signingSecret, claims), expiresAt: new Date(expiresAt).toISOString() } };
}

/** Registers the dev-only review and explicit confirm endpoints for one API instance. */
export function registerBenchScheduleRoutes(app: express.Application, options: BenchScheduleRouteOptions): void {
  const router = express.Router();
  const conversationStore = createBenchConversationStore();
  router.use((_req, res, next) => {
    if (!options.development) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Not found.', options.traceId(_req)));
    res.setHeader('Cache-Control', 'private, no-store');
    return next();
  });
  const principalFor = async (req: Request, res: Response, traceId: string): Promise<Principal | null> => {
    try {
      const principal = await options.authenticateCreator(req, { readonlySession: true });
      if (!principal?.creatorId || !principal.accountId) {
        res.status(401).json(errorEnvelope('AUTH_ERROR', 'Authentication required.', traceId));
        return null;
      }
      return principal;
    } catch {
      res.status(401).json(errorEnvelope('AUTH_ERROR', 'Authentication required.', traceId));
      return null;
    }
  };

  router.get('/library-post/:postId', async (req, res) => {
    const traceId = options.traceId(req);
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!options.getLibrarySource) return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'Library source review is unavailable.', traceId));
    try {
      const postId = typeof req.params.postId === 'string' ? req.params.postId : '';
      const source = await options.getLibrarySource(principal.creatorId, postId);
      return res.status(200).json(successEnvelope(source, traceId));
    } catch (error) {
      const status = record(error) ? (error.statusCode === 404 ? 404 : error.statusCode === 400 ? 400 : 503) : 503;
      const message = error instanceof Error ? error.message : 'The Library source could not be read.';
      return res.status(status).json(errorEnvelope(status === 404 ? 'NOT_FOUND' : status === 400 ? 'VALIDATION_ERROR' : 'SERVICE_UNAVAILABLE', message, traceId));
    }
  });

  router.post('/library/review', async (req, res) => {
    const traceId = options.traceId(req);
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!options.validateLibraryAttachment) return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'Library source review is unavailable.', traceId));
    let result;
    try {
      result = await reviewRealLibraryManualEvents(req.body, {
        loadSource: binding => options.validateLibraryAttachment!(principal.creatorId, binding),
      });
    } catch { return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'Schedule review is temporarily unavailable.', traceId)); }
    if (result.kind === 'refused') return invalid(res, traceId, result.message);
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const expires = new Date(expiresAt).toISOString();
    const items = result.items.map(item => {
      const claims: SignedReviewV2 = { v: 2, creatorId: principal.creatorId, expiresAt, payload: item.review.createPayload, attachment: item.review.attachment };
      return { destination: item.destination, review: item.review, reviewToken: tokenFor(options.signingSecret, claims), expiresAt: expires };
    });
    return res.status(200).json(successEnvelope({ reviewKind: 'real_library_manual', source: result.source, intent: result.intent, items }, traceId));
  });

  router.post('/review', async (req, res) => {
    const traceId = options.traceId(req);
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    let result;
    try { result = await reviewBenchSchedule(req.body); }
    catch { return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'Schedule review is temporarily unavailable.', traceId)); }
    if (result.kind === 'refused') return invalid(res, traceId, result.message);
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const expires = new Date(expiresAt).toISOString();
    if (result.kind === 'batch_review') {
      const order: Record<ScheduleReviewPayload['destination'], number> = { patreon: 0, x: 1, deviantart: 2 };
      const items = [...result.reviews].sort((a, b) => order[a.destination] - order[b.destination]).map(review => {
        const claims: SignedReview = { v: 1, creatorId: principal.creatorId, expiresAt, payload: review.createPayload };
        return { destination: review.destination, review, reviewToken: tokenFor(options.signingSecret, claims), expiresAt: expires };
      });
      return res.status(200).json(successEnvelope({ reviewKind: 'manual_batch', items }, traceId));
    }
    if (result.reviewKind === 'direct_manual' && options.distributionVariantAdapter && options.loadBenchVariantSource) {
      const postIds = record(req.body) && Array.isArray(req.body.selectedPostIds) ? req.body.selectedPostIds : [];
      const mediaIds = record(req.body) && Array.isArray(req.body.selectedMediaIds) ? req.body.selectedMediaIds : [];
      const postId = postIds.length === 1 && typeof postIds[0] === 'string' ? postIds[0] : '';
      if (!postId || mediaIds.some(id => typeof id !== 'string')) return invalid(res, traceId, 'Choose one valid sample source and its ordered sample media.');
      let source: BenchVariantSource | null;
      try { source = await options.loadBenchVariantSource(principal.creatorId, postId, mediaIds as string[]); }
      catch { return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The sample source could not be loaded.', traceId)); }
      if (!source || source.postId !== postId) return invalid(res, traceId, 'The selected sample source or media is no longer available. Review again.');
      const reviewed = reviewBenchVariantV3(source, result.review.destination as 'x' | 'deviantart', result.review.title);
      if (!reviewed) return invalid(res, traceId, 'The approved posting text or selected media exceeds the destination limits.');
      const { variant, binding, variantHash } = reviewed;
      const claims: SignedReviewV3 = { v: 3, creatorId: principal.creatorId, expiresAt, payload: result.review.createPayload, source: binding, variantHash };
      const sourceValues = { title: source.title, description: source.description, tags: source.tagLabels, orderedMediaIds: source.mediaIds, selectedMedia: source.media };
      const finalValues = { title: variant.approved.title, bodyText: variant.approved.bodyText, postText: variant.approved.postText, tags: variant.approved.tags, platformFields: variant.approved.platformFields };
      return res.status(200).json(successEnvelope({
        review: result.review, reviewKind: result.reviewKind, reviewToken: tokenFor(options.signingSecret, claims), expiresAt: expires,
        variantPreview: { sourceVersion: { key: binding.versionKey, fingerprint: binding.fingerprint, revision: source.revision },
          source: sourceValues, variant: finalValues, fieldDiffs: variant.diff, selectedMediaIds: [...binding.mediaIds] },
      }, traceId));
    }
    const claims: SignedReview = { v: 1, creatorId: principal.creatorId, expiresAt, payload: result.review.createPayload };
    return res.status(200).json(successEnvelope({ review: result.review, reviewKind: result.reviewKind ?? 'compiled_patreon', reviewToken: tokenFor(options.signingSecret, claims), expiresAt: expires }, traceId));
  });

  router.post('/conversation/session', async (req, res) => {
    const traceId = options.traceId(req), principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, [])) return invalid(res, traceId, 'Start a conversation without submitting fixture data.');
    try {
      const session = conversationStore.create(principal.creatorId);
      return res.status(201).json(successEnvelope(conversationSnapshot(session), traceId));
    } catch { return res.status(429).json(errorEnvelope('CONFLICT', 'Too many active mock conversations. Close an older session and retry.', traceId)); }
  });

  router.get('/conversation/session/:sessionId', async (req, res) => {
    const traceId = options.traceId(req), principal = await principalFor(req, res, traceId);
    if (!principal) return;
    const sessionId = typeof req.params.sessionId === 'string' ? req.params.sessionId : '';
    const session = conversationStore.owned(principal.creatorId, sessionId);
    if (!session) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Conversation not found. Start a new mock conversation.', traceId));
    return res.status(200).json(successEnvelope(conversationSnapshot(session), traceId));
  });

  router.post('/conversation/turn', async (req, res) => {
    const traceId = options.traceId(req), principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, ['sessionId', 'revision', 'latestRequest']) || typeof req.body.sessionId !== 'string' || !Number.isSafeInteger(req.body.revision) || (req.body.revision as number) < 0 || typeof req.body.latestRequest !== 'string' || !req.body.latestRequest.trim() || req.body.latestRequest.length > 20000) return invalid(res, traceId, 'Provide the current conversation revision and one request.');
    const session = conversationStore.owned(principal.creatorId, req.body.sessionId);
    if (!session) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Conversation not found. Start a new mock conversation.', traceId));
    if (session.confirming) return res.status(409).json(errorEnvelope('CONFLICT', 'A conversation confirmation is in progress. Retry this turn after it completes.', traceId));
    if (req.body.revision !== session.revision) return res.status(409).json(errorEnvelope('CONFLICT', 'The conversation changed. Review its current cards and try again.', traceId));
    session.generation += 1;
    session.pending = null;
    const generation = session.generation, revision = session.revision;
    const latestRequest = req.body.latestRequest;
    const requestClock = currentBenchRequestClock(new Date());
    if (!options.getVariantEditProvider) return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'clarification', message: 'Conversation interpretation is unavailable. Try again later.' }, traceId));
    let provider: EditorProvider | null;
    try { provider = await options.getVariantEditProvider(); }
    catch { provider = null; }
    if (!provider) return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'clarification', message: 'Conversation interpretation is unavailable. Try again later.' }, traceId));
    const abort = new AbortController();
    const abortForDisconnect = () => { if (!res.writableEnded) abort.abort(); };
    res.once('close', abortForDisconnect);
    const providerTimer = setTimeout(() => abort.abort(), 90_000);
    let interpreted;
    try { interpreted = await interpretBenchConversation(latestRequest, session, provider, abort.signal, requestClock); }
    catch { return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The conversation could not be interpreted. Nothing changed.', traceId)); }
    finally { clearTimeout(providerTimer); res.off('close', abortForDisconnect); }
    if (abort.signal.aborted || res.destroyed) return;
    if (session.generation !== generation || session.revision !== revision) return res.status(409).json(errorEnvelope('CONFLICT', 'A newer turn replaced this response. Review the current conversation.', traceId));
    const action = interpreted.action;
    if (!action) return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'clarification', message: 'Please make one clear selection, edit or posting request.', diagnostic: interpreted.diagnostic, ...(interpreted.renameValidation ? { renameValidation: interpreted.renameValidation } : {}), usage: interpreted.usage }, traceId));
    if (action.kind === 'clarification') return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'clarification', message: action.question, usage: interpreted.usage }, traceId));
    if (action.kind === 'selection') {
      const refined = resolveConversationSelection(action, latestRequest, session, requestClock);
      if (!refined) return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'clarification', message: 'Please clarify which fixture posts to select or remove.', usage: interpreted.usage }, traceId));
      session.selectedPostIds = refined.selectedPostIds;
      session.excludedPostIds = refined.excludedPostIds;
      session.revision += 1;
      return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'selected', operation: refined.operation, usage: interpreted.usage }, traceId));
    }
    const selected = session.selectedPostIds.length === 1 ? session.selectedPostIds[0]! : null;
    const cards = createBenchPostCards(session.fixture);
    const card = selected ? cards.find(item => item.postId === selected) : null;
    if (!card) return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'clarification', message: 'Select exactly one post before editing or posting.', usage: interpreted.usage }, traceId));
    if ((action.kind === 'rename' || action.kind === 'tags')) {
      const titleTarget = action.targetQuote === card.title && cards.filter(item => item.title === card.title).length === 1 && latestRequest.includes(card.title);
      const deicticTarget = ['selected post', 'selected artwork', 'it'].includes(action.targetQuote.toLocaleLowerCase('en-GB')) && session.selectedPostIds.length === 1 && hasStandaloneReference(latestRequest, action.targetQuote);
      if (!titleTarget && !deicticTarget) return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'clarification', message: 'Name the selected post or refer to the selected post clearly so I can verify the target.', usage: interpreted.usage }, traceId));
    }
    let pendingAction: typeof action = action;
    let preview: Record<string, unknown>;
    let context: Record<string, unknown> | undefined;
    const sourceHash = sha256(conversationFixtureHash(session));
    if (action.kind === 'rename' || action.kind === 'tags') {
      const operation = action.kind === 'rename'
        ? { operation: 'rename', scope: 'post', target: { source: 'selection', ids: [] }, excludeIds: [], unresolved: [], scopeBasis: 'explicit', requestQuote: action.requestQuote, change: 'add', actionId: null, value: action.title }
        : { operation: 'tags', scope: 'post', target: { source: 'selection', ids: [] }, excludeIds: [], unresolved: [], scopeBasis: 'explicit', requestQuote: action.requestQuote, change: 'add', actionId: null, add: action.add, remove: action.remove, observationMediaIds: [] };
      const structuredIntent = { revision: session.fixture.revision, outcome: 'proposal', question: null, unresolved: [], observations: [], operations: [operation] };
      const compiled = await runCurationBench({ mode: 'curation', selectedPostIds: [selected], selectedMediaIds: [], replay: { kind: 'edited', latestRequest, structuredIntent } }, { fixture: session.fixture });
      const result = record(compiled.result) ? compiled.result : null;
      const actions = result && Array.isArray(result.actions) ? result.actions as Array<Record<string, unknown>> : [];
      const baseline = session.fixture.manualActions as Array<Record<string, unknown>>;
      const preserved = actions.filter(row => baseline.some(old => old.id === row.id));
      const delta = actions.filter(row => !baseline.some(old => old.id === row.id));
      const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      const expectedKind = action.kind === 'rename' ? 'rename_post' : 'tags';
      if (compiled.status !== 'proposal' || !sameJson(preserved, baseline) || delta.length !== 1 || delta[0]?.kind !== expectedKind || delta[0]?.postId !== selected || action.kind === 'tags' && Object.hasOwn(delta[0]!, 'mediaId')) return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'clarification', message: 'That single post edit could not be compiled safely. Clarify the exact change.', usage: interpreted.usage }, traceId));
      const deltaAction = delta[0]!;
      const after = simulateEditorActions(session.fixture.state, session.fixture.creatorId, [deltaAction as any]);
      const cart = buildChangeCart(session.fixture.state, after, [deltaAction as any], session.fixture.revision);
      const beforeCard = cards.find(item => item.postId === selected)!;
      const nextTags = action.kind === 'tags' ? [...new Set([...(beforeCard.tags ?? []).filter(tag => !action.remove.includes(tag)), ...action.add])] : [];
      const readableChange = action.kind === 'rename'
        ? [{ label: 'Title', before: beforeCard.title, after: String(deltaAction.title) }]
        : [{ label: 'Tags', before: beforeCard.tags?.join(', ') || 'No tags', after: nextTags.join(', ') || 'No tags' }];
      pendingAction = action;
      preview = { kind: 'edit', postId: selected, beforeAfter: readableChange, cart: cart.items.map(item => ({ label: item.title, before: item.before, after: item.after })), action: structuredClone(deltaAction) };
      context = { action: structuredClone(deltaAction) };
    } else {
      const mediaIds = card.mediaIds;
      if (!mediaIds.length || mediaIds.length > 3) return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'clarification', message: 'Choose one source with one to three ready sample images.', usage: interpreted.usage }, traceId));
      const reviewed = await reviewBenchSchedule({ latestRequest, structuredIntent: action.event, selectedPostIds: [selected], selectedMediaIds: mediaIds }, { fixture: session.fixture });
      if (reviewed.kind !== 'review' || reviewed.reviewKind !== 'direct_manual' || !options.distributionVariantAdapter) return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'clarification', message: reviewed.kind === 'refused' ? reviewed.message : 'This manual posting request needs clarification.', usage: interpreted.usage }, traceId));
      const source = loadBenchVariantSource(selected!, mediaIds, session.fixture);
      const variant = source ? reviewBenchVariantV3(source, reviewed.review.destination as 'x' | 'deviantart', reviewed.review.title) : null;
      if (!source || !variant) return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'clarification', message: 'The selected source or media no longer fits this destination.', usage: interpreted.usage }, traceId));
      preview = { kind: 'posting', review: reviewed.review, source: { title: source.title, fingerprint: variant.binding.fingerprint, mediaIds: variant.binding.mediaIds }, variant: { title: variant.variant.approved.title, bodyText: variant.variant.approved.bodyText, postText: variant.variant.approved.postText, tags: variant.variant.approved.tags }, fieldDiffs: variant.variant.diff };
      context = { postId: selected, mediaIds: [...mediaIds], payload: reviewed.review.createPayload, binding: variant.binding, variantHash: variant.variantHash };
    }
    if (abort.signal.aborted || res.destroyed) return;
    if (session.generation !== generation || session.revision !== revision || session.confirming) return res.status(409).json(errorEnvelope('CONFLICT', 'A newer turn replaced this review. Review the current conversation.', traceId));
    const pendingId = randomUUID(), expiresAt = Date.now() + TOKEN_TTL_MS;
    const claims: SignedConversationReview = { kind: 'bench_conversation_pending_v1', creatorId: principal.creatorId, sessionId: session.id, pendingId, revision: session.revision, actionHash: sha256(pendingAction), sourceHash, expiresAt };
    const reviewToken = conversationTokenFor(options.signingSecret, claims);
    session.pending = { id: pendingId, revision: session.revision, action: structuredClone(pendingAction), token: reviewToken, preview, context };
    return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), status: 'review', preview, reviewToken, expiresAt: new Date(expiresAt).toISOString(), usage: interpreted.usage }, traceId));
  });

  router.post('/conversation/confirm', async (req, res) => {
    const traceId = options.traceId(req), principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, ['sessionId', 'reviewToken']) || typeof req.body.sessionId !== 'string') return invalid(res, traceId, 'Submit the current conversation review token.');
    const session = conversationStore.owned(principal.creatorId, req.body.sessionId);
    const claims = verifyConversationToken(options.signingSecret, req.body.reviewToken);
    if (!session || !claims || claims.creatorId !== principal.creatorId || claims.sessionId !== session.id) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Conversation review not found. Review the current request again.', traceId));
    const replay = session.receipts.get(req.body.reviewToken as string);
    if (replay) return res.status(200).json(successEnvelope({ ...conversationSnapshot(session), receipt: structuredClone(replay), reused: true }, traceId));
    const pending = session.pending;
    if (!pending || pending.id !== claims.pendingId || pending.token !== req.body.reviewToken || pending.revision !== session.revision || claims.revision !== session.revision || claims.actionHash !== sha256(pending.action) || claims.sourceHash !== sha256(conversationFixtureHash(session))) return res.status(409).json(errorEnvelope('CONFLICT', 'This conversation review is stale. Review the current request again.', traceId));
    if (session.confirming) return res.status(409).json(errorEnvelope('CONFLICT', 'This conversation review is already being confirmed.', traceId));
    session.confirming = true;
    let writable = false;
    try { writable = await options.guardMutation(req, res, traceId, principal.creatorId); } catch { writable = false; }
    if (!writable) { session.confirming = false; if (!res.headersSent) return res.status(423).json(errorEnvelope('STUDIO_WRITE_LOCKED', 'Studio writes are temporarily unavailable.', traceId)); return; }
    try {
      let receipt: Record<string, unknown>;
      if (pending.preview.kind === 'edit') {
        const action = pending.context?.action as any;
        session.fixture.state = simulateEditorActions(session.fixture.state, session.fixture.creatorId, [action]);
        session.fixture.revision += 1;
        session.revision += 1;
        receipt = { scope: 'development_mock_only', ephemeral: true, kind: 'edit', beforeAfter: pending.preview.beforeAfter, cards: createBenchPostCards(session.fixture) };
      } else {
        if (!options.distributionVariantAdapter || !pending.context || !pending.context.postId || !Array.isArray(pending.context.mediaIds)) return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The mock distribution adapter is unavailable.', traceId));
        if (!record(pending.context.payload) || typeof pending.context.payload.due_at !== 'string' || Date.parse(pending.context.payload.due_at) <= Date.now()) return res.status(409).json(errorEnvelope('CONFLICT', 'The reviewed posting time has passed. Review a future time again.', traceId));
        const source = loadBenchVariantSource(String(pending.context.postId), pending.context.mediaIds as string[], session.fixture);
        const reviewed = source ? reviewBenchVariantV3(source, (pending.context.payload as ScheduleReviewPayload).destination as 'x' | 'deviantart', (pending.context.payload as ScheduleReviewPayload).title) : null;
        if (!source || !reviewed || reviewed.binding.fingerprint !== (pending.context.binding as BenchVariantBinding).fingerprint || reviewed.variantHash !== pending.context.variantHash) return res.status(409).json(errorEnvelope('SOURCE_CHANGED', 'The selected source changed. Review the current source again.', traceId));
        const saved = await commitBenchVariantV3(options.distributionVariantAdapter, principal.creatorId, pending.context.payload as ScheduleReviewPayload, reviewed);
        receipt = { scope: 'development_mock_only', ephemeral: true, kind: 'posting', reused: saved.reused, event: structuredClone(saved.rows.event), plan: structuredClone(saved.rows.plan), variant: structuredClone(saved.rows.variant) };
        session.revision += 1;
      }
      session.pending = null;
      session.generation += 1;
      const result = { receipt, ...conversationSnapshot(session) };
      session.receipts.set(req.body.reviewToken as string, structuredClone(receipt));
      return res.status(201).json(successEnvelope(result, traceId));
    } catch (error) {
      if (record(error) && error.code === 'CONFLICT') return res.status(409).json(errorEnvelope('CONFLICT', 'The mock posting records conflict with this review.', traceId));
      return res.status(500).json(errorEnvelope('INTERNAL', 'The conversation confirmation could not be completed.', traceId));
    } finally { session.confirming = false; }
  });

  router.post('/variant-edit/review', async (req, res) => {
    const traceId = options.traceId(req);
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!options.distributionVariantAdapter) return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The mock distribution adapter is unavailable.', traceId));
    if (!record(req.body) || !exactKeys(req.body, ['variantId', 'expectedRevision', 'newText']) ||
        typeof req.body.variantId !== 'string' || !req.body.variantId.trim() || !Number.isSafeInteger(req.body.expectedRevision) || (req.body.expectedRevision as number) < 0 ||
        typeof req.body.newText !== 'string' || !req.body.newText.trim() || req.body.newText !== req.body.newText.trim() || req.body.newText.length > 200) {
      return invalid(res, traceId, 'Provide one draft variant, its current revision, and a trimmed literal of at most 200 characters.');
    }
    const result = buildVariantEditReview(options, principal.creatorId, req.body.variantId, req.body.expectedRevision as number, req.body.newText as string);
    if (result.kind === 'not_found') return res.status(404).json(errorEnvelope('NOT_FOUND', 'Draft variant not found.', traceId));
    if (result.kind === 'invalid') return res.status(409).json(errorEnvelope('CONFLICT', result.message, traceId));
    if (result.kind === 'stale') return res.status(409).json({ error: { ...errorEnvelope('CONFLICT', 'The draft changed. Review the current text again.', traceId).error, current_revision: result.currentRevision } });
    return res.status(200).json(successEnvelope(result.body, traceId));
  });

  router.post('/variant-edit/chat', async (req, res) => {
    const traceId = options.traceId(req);
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    const adapter = options.distributionVariantAdapter;
    if (!adapter || !options.getVariantEditProvider) return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'Mock draft chat is unavailable.', traceId));
    if (!record(req.body) || !exactKeys(req.body, ['latestRequest']) || typeof req.body.latestRequest !== 'string' || !req.body.latestRequest.trim() || req.body.latestRequest.length > 4000) return invalid(res, traceId, 'Provide one request of at most 4,000 characters.');
    const latestRequest = req.body.latestRequest as string;
    const rows = adapter.listEditableVariants(principal.creatorId);
    const candidateRows = rows.filter(row => {
      const text = row.variant[row.variant.destination === 'x' ? 'postText' : 'title'];
      return typeof text === 'string' && Number.isSafeInteger(row.variant.advice?.bench_variant_revisions_v1?.currentRevision) && typeof row.variant.advice?.bench_source_v1?.source?.title === 'string';
    });
    const candidates: BenchVariantChatCandidate[] = candidateRows.map((row, index) => ({
      handle: `draft-${index + 1}`, destination: row.variant.destination,
      currentText: row.variant[row.variant.destination === 'x' ? 'postText' : 'title'],
      currentRevision: row.variant.advice?.bench_variant_revisions_v1?.currentRevision,
      sourceTitle: row.variant.advice?.bench_source_v1?.source?.title,
    }));
    if (!candidates.length) return res.status(200).json(successEnvelope({ decision: 'clarification', diagnostic: 'no_eligible_candidates', question: 'There are no eligible mock posting drafts to edit.' }, traceId));
    const sizes = variantChatInputBytes(latestRequest, candidates);
    if (sizes.candidateBytes > 8192) return res.status(200).json(successEnvelope({ decision: 'clarification', diagnostic: 'catalog_over_8k', question: 'The eligible draft list is too large to review safely. Narrow the request or remove old mock drafts.' }, traceId));
    if (sizes.totalBytes > 16384) return res.status(200).json(successEnvelope({ decision: 'clarification', diagnostic: 'payload_over_16k', question: 'The full review request is too large. Narrow the request or eligible draft list.' }, traceId));
    let provider: EditorProvider | null;
    try { provider = await options.getVariantEditProvider(); } catch { provider = null; }
    if (!provider) return res.status(200).json(successEnvelope({ decision: 'clarification', diagnostic: 'provider_unavailable', question: 'Draft chat is unavailable. You can still edit a draft directly.' }, traceId));
    const abort = new AbortController();
    const abortOnClose = () => { if (!res.writableEnded) abort.abort(); };
    req.once('aborted', abortOnClose); res.once('close', abortOnClose);
    try {
      const interpreted = await interpretBenchVariantEdit(latestRequest, candidates, provider, abort.signal);
      if (res.headersSent || res.destroyed) return;
      if (interpreted.decision.decision !== 'edit') return res.status(200).json(successEnvelope({ decision: 'clarification', diagnostic: interpreted.diagnostic, question: interpreted.decision.question }, traceId));
      const target = resolveBenchVariantEditTarget(interpreted.decision, candidates);
      if (!target) return res.status(200).json(successEnvelope({ decision: 'clarification', diagnostic: 'target_ambiguity', question: 'Please identify one draft by its current text, source title, or destination.' }, traceId));
      const targetIndex = Number(target.handle.slice('draft-'.length)) - 1;
      const targetRows = candidateRows[targetIndex];
      if (!targetRows) return res.status(200).json(successEnvelope({ decision: 'clarification', diagnostic: 'target_ambiguity', question: 'Please identify one current draft.' }, traceId));
      const result = buildVariantEditReview(options, principal.creatorId, targetRows.variant.id, target.currentRevision, interpreted.decision.newText);
      if (result.kind !== 'review') return res.status(200).json(successEnvelope({ decision: 'clarification', diagnostic: result.kind === 'stale' ? 'stale_review' : 'draft_ineligible', question: result.kind === 'stale' ? 'That draft changed while the request was reviewed. Review the current draft again.' : 'That draft is no longer eligible for editing.' }, traceId));
      return res.status(200).json(successEnvelope({ decision: result.body.unchanged ? 'unchanged' : 'review', diagnostic: result.body.unchanged ? 'unchanged' : 'review_ready', ...result.body }, traceId));
    } catch {
      if (!res.headersSent && !res.destroyed) return res.status(503).json({ ...errorEnvelope('SERVICE_UNAVAILABLE', 'Draft chat could not complete. You can still edit the draft directly.', traceId), diagnostic: 'provider_failure' });
    } finally { req.off('aborted', abortOnClose); res.off('close', abortOnClose); }
  });

  router.post('/variant-edit/confirm', async (req, res) => {
    const traceId = options.traceId(req);
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!options.distributionVariantAdapter) return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The mock distribution adapter is unavailable.', traceId));
    if (!record(req.body) || !exactKeys(req.body, ['reviewToken'])) return invalid(res, traceId, 'Submit the edit review token from the current review.');
    const claims = verifyVariantEditToken(options.signingSecret, req.body.reviewToken);
    if (!claims) return res.status(409).json(errorEnvelope('REVIEW_EXPIRED', 'This edit review expired or is invalid. Review the draft again.', traceId));
    if (claims.creatorId !== principal.creatorId) return res.status(403).json(errorEnvelope('FORBIDDEN', 'This edit belongs to a different creator.', traceId));
    const found = options.distributionVariantAdapter.readVariant(principal.creatorId, claims.variantId);
    if (!found) return res.status(404).json(errorEnvelope('NOT_FOUND', 'Draft variant not found.', traceId));
    let writable = false;
    try { writable = await options.guardMutation(req, res, traceId, principal.creatorId); } catch { writable = false; }
    if (!writable) {
      if (!res.headersSent) return res.status(423).json(errorEnvelope('STUDIO_WRITE_LOCKED', 'Studio writes are temporarily unavailable.', traceId));
      return;
    }
    const facts = { ...claims };
    const editIdentity = sha256({ namespace: 'bench_variant_edit_v1', claims });
    try {
      const saved = await options.distributionVariantAdapter.confirmEdit(found.identity, editIdentity, facts, claims, new Date().toISOString());
      return res.status(saved.reused ? 200 : 201).json(successEnvelope({ reused: saved.reused, revision: saved.revision,
        receipt: { scope: 'development_mock_only', ephemeral: true, plan: structuredClone(saved.rows.plan),
          variant: structuredClone(saved.rows.variant), event: structuredClone(saved.rows.event) } }, traceId));
    } catch (error) {
      if (record(error) && error.code === 'NOT_FOUND') return res.status(404).json(errorEnvelope('NOT_FOUND', 'Draft variant not found.', traceId));
      if (record(error) && error.code === 'STALE') {
        const currentRevision = Number.isSafeInteger(error.currentRevision) ? error.currentRevision as number : undefined;
        const base = errorEnvelope('CONFLICT', 'The draft changed. Review the current text again.', traceId).error;
        return res.status(409).json({ error: { ...base, ...(currentRevision === undefined ? {} : { current_revision: currentRevision }) } });
      }
      if (record(error) && error.code === 'CONFLICT') return res.status(409).json(errorEnvelope('CONFLICT', 'This edit conflicts with the saved mock draft.', traceId));
      return res.status(500).json(errorEnvelope('INTERNAL', 'The mock variant edit could not be committed.', traceId));
    }
  });

  router.post('/confirm', async (req, res) => {
    const traceId = options.traceId(req);
    const principal = await principalFor(req, res, traceId);
    if (!principal) return;
    if (!record(req.body) || !exactKeys(req.body, ['reviewToken'])) return invalid(res, traceId, 'Submit the review token from the current review.');
    const claims = verifyToken(options.signingSecret, req.body.reviewToken);
    if (!claims) return res.status(409).json(errorEnvelope('REVIEW_EXPIRED', 'This review expired or is invalid. Review the request again.', traceId));
    if (claims.creatorId !== principal.creatorId) return res.status(403).json(errorEnvelope('FORBIDDEN', 'This review belongs to a different creator.', traceId));
    if (claims.v === 3) {
      if (!options.distributionVariantAdapter || !options.loadBenchVariantSource) return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The mock distribution adapter is unavailable.', traceId));
      let current: BenchVariantSource | null;
      try { current = await options.loadBenchVariantSource(principal.creatorId, claims.source.postId, claims.source.mediaIds); }
      catch { return res.status(503).json(errorEnvelope('SERVICE_UNAVAILABLE', 'The sample source could not be reloaded.', traceId)); }
      const currentBinding = current ? bindBenchVariantSource(current) : null;
      if (!current || !currentBinding || JSON.stringify(currentBinding) !== JSON.stringify(claims.source)) return res.status(409).json(errorEnvelope('SOURCE_CHANGED', 'The sample source changed. Review the current source again.', traceId));
      const reviewed = reviewBenchVariantV3(current, claims.payload.destination as 'x' | 'deviantart', claims.payload.title);
      if (!reviewed || reviewed.variantHash !== claims.variantHash) return res.status(409).json(errorEnvelope('SOURCE_CHANGED', 'The reviewed variant no longer matches this source. Review again.', traceId));
      let writable = false;
      try { writable = await options.guardMutation(req, res, traceId, principal.creatorId); } catch { writable = false; }
      if (!writable) {
        if (!res.headersSent) return res.status(423).json(errorEnvelope('STUDIO_WRITE_LOCKED', 'Studio writes are temporarily unavailable.', traceId));
        return;
      }
      try {
        const saved = await commitBenchVariantV3(options.distributionVariantAdapter, principal.creatorId, claims.payload, reviewed);
        return res.status(saved.reused ? 200 : 201).json(successEnvelope({ event: saved.rows.event,
          reused: saved.reused, receipt: { scope: 'development_mock_only', ephemeral: true,
            plan: structuredClone(saved.rows.plan), variant: structuredClone(saved.rows.variant) } }, traceId));
      } catch (error) {
        if (record(error) && error.code === 'CONFLICT') return res.status(409).json(errorEnvelope('CONFLICT', 'Saved mock records conflict with this review identity.', traceId));
        return res.status(500).json(errorEnvelope('INTERNAL', 'The mock distribution records could not be committed.', traceId));
      }
    }
    let writable = false;
    try { writable = await options.guardMutation(req, res, traceId, principal.creatorId); }
    catch { writable = false; }
    if (!writable) {
      if (!res.headersSent) return res.status(423).json(errorEnvelope('STUDIO_WRITE_LOCKED', 'Studio writes are temporarily unavailable.', traceId));
      return;
    }
    const attachment = claims.v === 2 ? claims.attachment : undefined;
    const id = eventId(principal.creatorId, claims.payload, attachment);
    if (claims.v === 2) {
      // A saved Library event remains retryable after its source version changes,
      // but the readback must not bypass the same plan entitlement as a write.
      try {
        await options.assertCorePlan?.(principal.creatorId);
      } catch (error) {
        if (error instanceof CreatorScheduleEventPlanRequiredError) return res.status(402).json({ error: 'plan_required', required_plan: 'studio_core', trace_id: traceId });
        return res.status(500).json(errorEnvelope('INTERNAL', 'The schedule event could not be read.', traceId));
      }
      try {
        const existing = await options.readEvent(principal.creatorId, id);
        if (existing) {
          if (factsMatch(existing, claims)) return res.status(200).json(successEnvelope({ event: existing.event, reused: true }, traceId));
          return res.status(409).json(errorEnvelope('CONFLICT', 'An event already uses this review identity with different details.', traceId));
        }
      } catch {
        return res.status(500).json(errorEnvelope('INTERNAL', 'The schedule event could not be read.', traceId));
      }
    }
    try {
      const event = await options.createEvent(principal.creatorId, claims.payload, id, attachment);
      return res.status(201).json(successEnvelope({ event, reused: false }, traceId));
    } catch (error) {
      if (error instanceof CreatorScheduleEventPlanRequiredError) return res.status(402).json({ error: 'plan_required', required_plan: error.required_plan, trace_id: traceId });
      if (error instanceof CreatorScheduleEventValidationError) return res.status(error.statusCode).json(errorEnvelope('VALIDATION_ERROR', error.message, traceId));
      if (error instanceof CreatorScheduleEventNotFoundError) return res.status(error.statusCode).json(errorEnvelope('NOT_FOUND', error.message, traceId));
      const uniqueConflict = record(error) && error.code === 'P2002';
      if (!uniqueConflict) return res.status(500).json(errorEnvelope('INTERNAL', 'The schedule event could not be saved.', traceId));
      try {
        const existing = await options.readEvent(principal.creatorId, id);
        if (existing && factsMatch(existing, claims)) return res.status(200).json(successEnvelope({ event: existing.event, reused: true }, traceId));
      } catch { /* collision is reported below */ }
      return res.status(409).json(errorEnvelope('CONFLICT', 'An event already uses this review identity with different details.', traceId));
    }
  });
  app.use('/api/v1/editor-bench/schedule', router);
}

export type TrustedScheduleEventCreator = (creatorId: string, payload: CreateCreatorScheduleEventBody, eventId: string) => Promise<CreatorScheduleEventWire>;
