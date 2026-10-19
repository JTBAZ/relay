import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import type { CreateCreatorScheduleEventBody, CreatorScheduleEventWire } from '../distribution/creator-schedule-event-contract.js';
import { CreatorScheduleEventNotFoundError, CreatorScheduleEventPlanRequiredError, CreatorScheduleEventValidationError } from '../distribution/creator-schedule-event-service.js';
import type { LibraryScheduleAttachment, LibraryScheduleSource } from '../distribution/library-schedule-source.js';
import { errorEnvelope, successEnvelope } from '../contracts/api.js';
import { reviewRealLibraryManualEvents, type RealLibraryScheduleReview } from './real-library-review.js';
import { reviewBenchSchedule, type ScheduleReview, type ScheduleReviewPayload } from './schedule-review.js';
import { bindBenchVariantSource, buildBenchVariantRows, createBenchDistributionVariantAdapter, exactBenchVariant, loadBenchVariantSource, sha256, type BenchVariantBinding, type BenchVariantEditClaims, type BenchVariantRows, type BenchVariantSource } from './distribution-variant-adapter.js';
import type { EditorProvider } from '../gallery-editor/provider.js';
import { interpretBenchVariantEdit, resolveBenchVariantEditTarget, variantChatInputBytes, type BenchVariantChatCandidate } from './variant-chat.js';

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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
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
      const variant = exactBenchVariant(source, result.review.destination as 'x' | 'deviantart', result.review.title);
      if (!variant) return invalid(res, traceId, 'The approved posting text or selected media exceeds the destination limits.');
      const binding = bindBenchVariantSource(source);
      const variantHash = sha256(variant.approved);
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
      const variant = exactBenchVariant(current, claims.payload.destination as 'x' | 'deviantart', claims.payload.title);
      if (!variant || sha256(variant.approved) !== claims.variantHash) return res.status(409).json(errorEnvelope('SOURCE_CHANGED', 'The reviewed variant no longer matches this source. Review again.', traceId));
      let writable = false;
      try { writable = await options.guardMutation(req, res, traceId, principal.creatorId); } catch { writable = false; }
      if (!writable) {
        if (!res.headersSent) return res.status(423).json(errorEnvelope('STUDIO_WRITE_LOCKED', 'Studio writes are temporarily unavailable.', traceId));
        return;
      }
      const identity = sha256({ namespace: 'bench-distribution-variant-v3', creatorId: principal.creatorId, payload: claims.payload, source: claims.source, variantHash: claims.variantHash });
      const facts = { creatorId: principal.creatorId, payload: claims.payload, source: claims.source, variantHash: claims.variantHash };
      try {
        const saved = await options.distributionVariantAdapter.commit(identity, facts, () => buildBenchVariantRows({
          creatorId: principal.creatorId, identity, payload: claims.payload, source: current!, binding: currentBinding,
          approved: variant.approved, diff: variant.diff, variantHash: claims.variantHash,
        }));
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
