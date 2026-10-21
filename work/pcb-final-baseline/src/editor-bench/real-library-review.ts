import { objectSchema, matchesSchema } from '../gallery-editor/action-validation.js';
import type { LibraryScheduleSource } from '../distribution/library-schedule-source.js';
import { mapManualPostingCueItem, MANUAL_POSTING_EVENT_ITEM_SCHEMA, type ManualPostingCueItem } from './manual-posting-event.js';
import type { ScheduleReview, ScheduleReviewPayload } from './schedule-review.js';

const choice = (...values: string[]) => ({ type: 'string', enum: values });
const clarificationSchema = objectSchema({ kind: choice('clarification'), question: { type: 'string', minLength: 1, maxLength: 1000 } });
export const REAL_LIBRARY_MANUAL_INTENT_SCHEMA = objectSchema({
  kind: choice('real_library_manual_events'),
  events: { type: 'array', maxItems: 3, items: MANUAL_POSTING_EVENT_ITEM_SCHEMA },
});
export const REAL_LIBRARY_MODEL_RESPONSE_SCHEMA = { anyOf: [REAL_LIBRARY_MANUAL_INTENT_SCHEMA, clarificationSchema] };
/** Structured Outputs requires a top-level object; the application still consumes the inner union. */
export const REAL_LIBRARY_PROVIDER_RESPONSE_SCHEMA = objectSchema({ result: REAL_LIBRARY_MODEL_RESPONSE_SCHEMA });

export type RealLibraryManualIntent = { kind: 'real_library_manual_events'; events: ManualPostingCueItem[] };
export type RealLibraryModelResponse = RealLibraryManualIntent | { kind: 'clarification'; question: string };
export type LibraryScheduleBinding = { postId: string; versionId: string; mediaIds: string[] };
export type RealLibraryScheduleReview = Omit<ScheduleReview, 'createPayload'> & {
  attachment: LibraryScheduleBinding;
  createPayload: Omit<ScheduleReviewPayload, 'target_mode' | 'post_id'> & { target_mode: 'existing_post'; post_id: string };
};
export type RealLibraryReviewItem = { destination: 'patreon' | 'x' | 'deviantart'; review: RealLibraryScheduleReview };
export type RealLibraryReviewResult =
  | { kind: 'real_library_review'; source: LibraryScheduleBinding; intent: RealLibraryManualIntent; items: RealLibraryReviewItem[] }
  | { kind: 'refused'; code: string; message: string };

function refused(code: string, message: string): RealLibraryReviewResult { return { kind: 'refused', code, message }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }

/** Build all event reviews against one freshly validated source; a failed item returns no partial review. */
export function reviewRealLibraryManualEvents(
  value: unknown,
  options: { now?: () => Date; loadSource: (binding: LibraryScheduleBinding) => Promise<LibraryScheduleSource> },
): Promise<RealLibraryReviewResult> {
  return reviewInner(value, options);
}

async function reviewInner(
  value: unknown,
  options: { now?: () => Date; loadSource: (binding: LibraryScheduleBinding) => Promise<LibraryScheduleSource> },
): Promise<RealLibraryReviewResult> {
  if (!isRecord(value) || !exactKeys(value, ['latestRequest', 'source', 'intent']) || typeof value.latestRequest !== 'string' || !value.latestRequest.trim() || value.latestRequest.length > 4000) {
    return refused('invalid_request', 'Send the latest request, Library source binding, and interpreted manual events.');
  }
  if (!matchesSchema(value.intent, REAL_LIBRARY_MANUAL_INTENT_SCHEMA)) return refused('invalid_intent', 'The interpreted events do not match the strict Library manual-event shape.');
  const intent = value.intent as RealLibraryManualIntent;
  if (intent.events.length < 1 || intent.events.length > 3) return refused('invalid_event_count', 'Choose one to three Library manual events.');
  const destinations = intent.events.map(event => event.destination);
  if (new Set(destinations).size !== destinations.length) return refused('duplicate_destination', 'Choose each destination only once.');
  if (!isRecord(value.source) || !exactKeys(value.source, ['postId', 'versionId', 'mediaIds']) ||
      typeof value.source.postId !== 'string' || !value.source.postId.trim() || typeof value.source.versionId !== 'string' || !value.source.versionId.trim() ||
      !Array.isArray(value.source.mediaIds) || value.source.mediaIds.length < 1 || value.source.mediaIds.length > 3 ||
      value.source.mediaIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(value.source.mediaIds).size !== value.source.mediaIds.length) {
    return refused('invalid_source', 'Choose one current Library post and one to three distinct media items.');
  }
  const binding: LibraryScheduleBinding = { postId: value.source.postId, versionId: value.source.versionId, mediaIds: [...value.source.mediaIds] as string[] };
  let source: LibraryScheduleSource;
  try { source = await options.loadSource(binding); }
  catch { return refused('source_unavailable', 'The Library source changed or its selected media is no longer available. Choose the source again.'); }
  if (source.postId !== binding.postId || source.versionId !== binding.versionId || source.media.length !== binding.mediaIds.length || source.media.some((media, index) => media.id !== binding.mediaIds[index])) {
    return refused('source_binding_mismatch', 'The Library source or selected media changed. Choose the source again.');
  }
  const now = (options.now ?? (() => new Date()))();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return refused('invalid_clock', 'A valid server clock is required to review future posting times.');
  const mediaLabel = source.media.map(media => media.label).join(', ');
  const items: RealLibraryReviewItem[] = [];
  for (const event of intent.events) {
    const mapped = mapManualPostingCueItem(value.latestRequest, event, { title: source.title, mediaLabel }, now);
    if (mapped.kind !== 'proposal') return refused(mapped.code, mapped.message);
    const attachment = { postId: binding.postId, versionId: binding.versionId, mediaIds: [...binding.mediaIds] };
    const createPayload: RealLibraryScheduleReview['createPayload'] = {
      ...mapped.proposal.createPayload,
      note: `Manual publishing cue for the selected Library media on “${source.title}”. No automatic posting, draft, export, or reminder is created.`,
      target_mode: 'existing_post', post_id: binding.postId, external_url: null,
    };
    items.push({ destination: event.destination, review: {
      ...mapped.proposal,
      warning: 'Saving this event links the selected Library media. Posting requires a separate action and your confirmation on the destination site.',
      attachment, createPayload,
    } });
  }
  return { kind: 'real_library_review', source: binding, intent, items };
}

export function isRealLibraryModelResponse(value: unknown): value is RealLibraryModelResponse {
  if (!matchesSchema(value, REAL_LIBRARY_MODEL_RESPONSE_SCHEMA)) return false;
  if (isRecord(value) && value.kind === 'clarification') return typeof value.question === 'string' && !!value.question.trim();
  return matchesSchema(value, REAL_LIBRARY_MANUAL_INTENT_SCHEMA) && (value as RealLibraryManualIntent).events.length >= 1;
}
