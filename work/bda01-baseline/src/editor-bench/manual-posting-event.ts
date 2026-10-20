import { objectSchema, matchesSchema } from '../gallery-editor/action-validation.js';
import { resolveAbsoluteTime } from '../conversational-planning/calendar-resolver.js';
import { BENCH_IDS, createBenchFixture, createBenchMediaDescriptors, createBenchPostCards, type BenchFixture } from './fixtures.js';
import { currentBenchRequestClock } from './routing.js';

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const choice = (...values: string[]) => ({ type: 'string', enum: values });
export const MANUAL_POSTING_EVENT_SCHEMA = objectSchema({
  kind: choice('manual_posting_event'), destination: choice('x', 'deviantart'),
  source_ref: { anyOf: [objectSchema({ mode: choice('selection'), id: { type: 'null' } }), objectSchema({ mode: choice('post_id'), id: { type: 'string', minLength: 1, maxLength: 200 } })] },
  title_text: { type: 'string', minLength: 1, maxLength: 200 },
  time_kind: choice('absolute_local', 'weekday'), local_date: nullable({ type: 'string', minLength: 10, maxLength: 10 }),
  weekday: nullable(choice('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  weekday_qualifier: nullable(choice('this','next')), local_time: { type: 'string', minLength: 5, maxLength: 5 },
  timezone: choice('Europe/London'), time_text: { type: 'string', minLength: 1, maxLength: 200 },
});
const manualEventFields = {
  destination: choice('patreon', 'x', 'deviantart'),
  title_text: { type: 'string', minLength: 1, maxLength: 200 },
  time_kind: choice('absolute_local', 'weekday'), local_date: nullable({ type: 'string', minLength: 10, maxLength: 10 }),
  weekday: nullable(choice('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  weekday_qualifier: nullable(choice('this','next')), local_time: { type: 'string', minLength: 5, maxLength: 5 },
  timezone: choice('Europe/London'), time_text: { type: 'string', minLength: 1, maxLength: 200 },
};
export const MANUAL_POSTING_EVENT_ITEM_SCHEMA = objectSchema(manualEventFields);
export const MANUAL_POSTING_BATCH_SCHEMA = objectSchema({
  kind: choice('manual_posting_batch'),
  source_ref: { anyOf: [objectSchema({ mode: choice('selection'), id: { type: 'null' } }), objectSchema({ mode: choice('post_id'), id: { type: 'string', minLength: 1, maxLength: 200 } })] },
  events: { type: 'array', maxItems: 3, items: MANUAL_POSTING_EVENT_ITEM_SCHEMA },
});
export type ManualPostingEventIntent = {
  kind: 'manual_posting_event'; destination: 'x' | 'deviantart';
  source_ref: { mode: 'selection'; id: null } | { mode: 'post_id'; id: string };
  title_text: string; time_kind: 'absolute_local' | 'weekday'; local_date: string | null;
  weekday: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | null;
  weekday_qualifier: 'this' | 'next' | null; local_time: string; timezone: 'Europe/London'; time_text: string;
};
type ManualPostingDestination = 'patreon' | 'x' | 'deviantart';
type ManualPostingEventDetails = Omit<ManualPostingEventIntent, 'destination'> & { destination: ManualPostingDestination };
export type ManualPostingCueItem = Omit<ManualPostingEventDetails, 'kind' | 'source_ref'>;
export type ManualPostingBatchIntent = {
  kind: 'manual_posting_batch';
  source_ref: ManualPostingEventIntent['source_ref'];
  events: Array<Omit<ManualPostingEventDetails, 'kind' | 'source_ref'>>;
};
export type ManualPostingProposal = {
  source: { title: string; mediaLabel: string }; destination: 'patreon' | 'x' | 'deviantart'; title: string;
  dueAt: { local: string; timezone: 'Europe/London'; utc: string }; warning: string;
  createPayload: { event_type: 'make_post'; destination: 'patreon' | 'x' | 'deviantart'; title: string; note: string; due_at: string; remind_me: false; target_mode: 'new_post'; post_id: null; external_url: null; create_relay_draft: false };
};
export type ManualMapping = { kind: 'proposal'; proposal: ManualPostingProposal } | { kind: 'refused'; code: string; message: string };
export type ManualBatchMapping = { kind: 'proposal'; proposals: ManualPostingProposal[] } | { kind: 'refused'; code: string; message: string };
const refuse = (code: string, message: string): ManualMapping => ({ kind: 'refused', code, message });
const refuseBatch = (code: string, message: string): ManualBatchMapping => ({ kind: 'refused', code, message });

/** Pure, fixture-bounded mapping for one explicit X/DeviantArt posting cue. */
export function mapManualPostingEvent(latestRequest: string, raw: unknown, postIds: string[], mediaIds: string[], now = new Date(), fixture: BenchFixture = createBenchFixture()): ManualMapping {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return refuse('invalid_clock', 'A valid server clock is required to review a future posting time.');
  if (!matchesSchema(raw, MANUAL_POSTING_EVENT_SCHEMA)) return refuse('invalid_manual_intent', 'The direct posting event did not match its strict shape.');
  const mapped = mapManualEventDetails(latestRequest, raw as ManualPostingEventIntent, postIds, mediaIds, now, fixture);
  return mapped.kind === 'proposal' ? { kind: 'proposal', proposal: mapped.proposal } : mapped;
}

/** All-or-nothing mapping for a common source with distinct destination events. */
export function mapManualPostingBatch(latestRequest: string, raw: unknown, postIds: string[], mediaIds: string[], now = new Date()): ManualBatchMapping {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return refuseBatch('invalid_clock', 'A valid server clock is required to review future posting times.');
  if (!matchesSchema(raw, MANUAL_POSTING_BATCH_SCHEMA)) return refuseBatch('invalid_manual_batch', 'The direct posting batch did not match its strict shape.');
  const intent = raw as ManualPostingBatchIntent;
  if (intent.events.length < 2 || intent.events.length > 3) return refuseBatch('invalid_manual_batch_size', 'A posting batch must contain two or three events.');
  const destinations = intent.events.map(event => event.destination);
  if (new Set(destinations).size !== destinations.length) return refuseBatch('duplicate_destination', 'Choose each destination only once in a posting batch.');
  const proposals: ManualPostingProposal[] = [];
  for (const event of intent.events) {
    const mapped = mapManualEventDetails(latestRequest, { kind: 'manual_posting_event', source_ref: intent.source_ref, ...event } as ManualPostingEventDetails, postIds, mediaIds, now);
    if (mapped.kind !== 'proposal') return refuseBatch(mapped.code, mapped.message);
    proposals.push(mapped.proposal);
  }
  return { kind: 'proposal', proposals };
}

function mapManualEventDetails(latestRequest: string, intent: ManualPostingEventDetails, postIds: string[], mediaIds: string[], now: Date, fixture: BenchFixture = createBenchFixture()): ManualMapping {
  if (postIds.length !== 1 || !mediaIds.length || mediaIds.length > 3 || new Set(postIds).size !== 1 || new Set(mediaIds).size !== mediaIds.length ||
      !(BENCH_IDS.posts as readonly string[]).includes(postIds[0]!) || mediaIds.some(id => !(BENCH_IDS.media as readonly string[]).includes(id))) return refuse('single_fixture_required', 'Choose one sample post and one to three of its distinct sample media items.');
  const media = mediaIds.map(id => createBenchMediaDescriptors(fixture).find(item => item.id === id));
  if (media.some(item => !item || item.postId !== postIds[0])) return refuse('fixture_association_mismatch', 'The selected sample media must belong to the selected sample post.');
  if (intent.source_ref.mode === 'post_id' ? intent.source_ref.id !== postIds[0] : intent.source_ref.id !== null) return refuse('source_mismatch', 'The event source must be the currently selected sample post.');
  const source = createBenchPostCards(fixture).find(post => post.postId === postIds[0]);
  if (!source) return refuse('fixture_metadata_missing', 'The selected sample source could not be resolved.');
  return mapManualPostingCueItem(latestRequest, {
    destination: intent.destination, title_text: intent.title_text, time_kind: intent.time_kind, local_date: intent.local_date,
    weekday: intent.weekday, weekday_qualifier: intent.weekday_qualifier, local_time: intent.local_time,
    timezone: intent.timezone, time_text: intent.time_text,
  }, { title: source.title, mediaLabel: media.map(item => item!.label).join(', ') }, now);
}

/** Shared literal title/time mapping for any server-authorized source binding. */
export function mapManualPostingCueItem(latestRequest: string, raw: unknown, source: { title: string; mediaLabel: string }, now = new Date()): ManualMapping {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return refuse('invalid_clock', 'A valid server clock is required to review a future posting time.');
  if (!matchesSchema(raw, MANUAL_POSTING_EVENT_ITEM_SCHEMA)) return refuse('invalid_manual_item', 'The posting event item did not match its strict shape.');
  const intent = raw as ManualPostingCueItem;
  if (!intent.title_text.trim() || intent.title_text !== intent.title_text.trim() || !latestRequest.includes(intent.title_text) || !intent.time_text.trim() || !latestRequest.includes(intent.time_text)) return refuse('literal_grounding_required', 'The event title and time must be copied literally from the latest request.');
  if ((intent.time_kind === 'absolute_local' && (intent.local_date === null || intent.weekday !== null || intent.weekday_qualifier !== null)) ||
      (intent.time_kind === 'weekday' && (intent.local_date !== null || intent.weekday === null))) return refuse('invalid_time_fields', 'Provide one complete local date or weekday, with an explicit time.');
  const resolved = resolveAbsoluteTime(intent, currentBenchRequestClock(now), 'Europe/London');
  if (resolved.kind !== 'resolved' || Date.parse(resolved.time.at_utc) <= now.getTime()) return refuse('future_time_required', 'Choose a valid future Europe/London date and time.');
  const dueAt = { local: resolved.time.local, timezone: 'Europe/London' as const, utc: new Date(resolved.time.at_utc).toISOString() };
  const note = `Posting cue for the “${source.title}” sample in the editor bench. Sample media is not attached to this event.`;
  return { kind: 'proposal', proposal: { source, destination: intent.destination, title: intent.title_text, dueAt,
    warning: 'This creates one manual Schedule Rail posting event. The source and media are sample fixtures; no media attachment, draft, export, handoff, publication, or reminder is created.',
    createPayload: { event_type: 'make_post', destination: intent.destination, title: intent.title_text, note, due_at: dueAt.utc, remind_me: false, target_mode: 'new_post', post_id: null, external_url: null, create_relay_draft: false } } };
}
