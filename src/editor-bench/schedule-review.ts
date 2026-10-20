import { matchesSchema } from '../gallery-editor/action-validation.js';
import { INTERPRETED_REQUEST_SCHEMA, MAX_REQUEST_CHARS } from '../conversational-planning/intent.js';
import type { PlanStep, TimeSpec } from '../conversational-planning/contract.js';
import { BENCH_IDS, createBenchFixture, createBenchMediaDescriptors, createBenchPostCards, type BenchFixture } from './fixtures.js';
import { runPostingBench } from './routing.js';
import { mapManualPostingBatch, mapManualPostingEvent, MANUAL_POSTING_BATCH_SCHEMA, MANUAL_POSTING_EVENT_SCHEMA } from './manual-posting-event.js';

const MAX_INTENT_BYTES = 100_000;

export type ScheduleReviewPayload = {
  event_type: 'make_post';
  destination: 'patreon' | 'x' | 'deviantart';
  title: string;
  note: string;
  due_at: string;
  remind_me: false;
  target_mode: 'new_post' | 'existing_post';
  post_id: string | null;
  external_url: null;
  create_relay_draft: false;
};

export type ScheduleReview = {
  source: { title: string; mediaLabel: string };
  destination: 'patreon' | 'x' | 'deviantart';
  title: string;
  dueAt: { local: string; timezone: 'Europe/London'; utc: string };
  warning: string;
  createPayload: ScheduleReviewPayload;
};

export type ScheduleReviewResult =
  | { kind: 'review'; review: ScheduleReview; reviewKind?: 'compiled_patreon' | 'direct_manual' }
  | { kind: 'batch_review'; reviews: ScheduleReview[] }
  | { kind: 'refused'; code: string; message: string };

export type ScheduleReviewCandidate = {
  latestRequest: string;
  structuredIntent: unknown;
  selectedPostIds: string[];
  selectedMediaIds: string[];
};

function refused(code: string, message: string): ScheduleReviewResult {
  return { kind: 'refused', code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validateCandidate(value: unknown): ScheduleReviewCandidate | ScheduleReviewResult {
  if (!isRecord(value) || !exactKeys(value, ['latestRequest', 'structuredIntent', 'selectedPostIds', 'selectedMediaIds'])) {
    return refused('invalid_request', 'Send the latest request, interpreted intent, and fixture selection for review.');
  }
  if (typeof value.latestRequest !== 'string' || !value.latestRequest.trim() || value.latestRequest.length > MAX_REQUEST_CHARS) {
    return refused('request_limit', 'The latest request must contain 1–4,000 characters.');
  }
  const direct = matchesSchema(value.structuredIntent, MANUAL_POSTING_EVENT_SCHEMA) || matchesSchema(value.structuredIntent, MANUAL_POSTING_BATCH_SCHEMA);
  if (!direct && !matchesSchema(value.structuredIntent, INTERPRETED_REQUEST_SCHEMA)) {
    return refused('invalid_intent', 'The interpreted intent does not match the strict posting request shape.');
  }
  try {
    if (Buffer.byteLength(JSON.stringify(value.structuredIntent) ?? '', 'utf8') > MAX_INTENT_BYTES) {
      return refused('intent_limit', 'The interpreted intent must be at most 100,000 UTF-8 bytes.');
    }
  } catch {
    return refused('invalid_intent', 'The interpreted intent must contain JSON data only.');
  }
  if (!Array.isArray(value.selectedPostIds) || value.selectedPostIds.length !== 1 || typeof value.selectedPostIds[0] !== 'string' ||
      !Array.isArray(value.selectedMediaIds) || value.selectedMediaIds.length < 1 || value.selectedMediaIds.length > 3 ||
      value.selectedMediaIds.some(id => typeof id !== 'string')) {
    return refused('single_fixture_required', 'Choose exactly one sample post and one to three of its sample media items.');
  }
  const postId = value.selectedPostIds[0];
  const mediaIds = value.selectedMediaIds as string[];
  if (!(BENCH_IDS.posts as readonly string[]).includes(postId) || mediaIds.some(id => !(BENCH_IDS.media as readonly string[]).includes(id))) {
    return refused('foreign_fixture', 'Only server-owned editor bench sample IDs can be reviewed.');
  }
  if (new Set(mediaIds).size !== mediaIds.length) return refused('invalid_selection', 'Choose distinct sample media items.');
  const allMedia = createBenchMediaDescriptors();
  const media = mediaIds.map(id => allMedia.find(item => item.id === id));
  if (media.some(item => !item || item.postId !== postId)) {
    return refused('fixture_association_mismatch', 'The selected sample media must belong to the selected sample post.');
  }
  return {
    latestRequest: value.latestRequest,
    structuredIntent: value.structuredIntent,
    selectedPostIds: [postId],
    selectedMediaIds: mediaIds,
  };
}

function literalTitle(step: PlanStep | undefined): string | null {
  return step && step.title.mode === 'literal' ? step.title.value : null;
}

function isFutureAbsolute(time: TimeSpec | null, now: Date): time is Extract<TimeSpec, { kind: 'absolute' }> {
  return !!time && time.kind === 'absolute' && Number.isFinite(Date.parse(time.at_utc)) && Date.parse(time.at_utc) > now.getTime();
}

/** Recompiles a strict interpreted request against server-owned fixture data and returns only the safe manual-event mapping. */
export async function reviewBenchSchedule(value: unknown, options: { now?: () => Date; fixture?: BenchFixture } = {}): Promise<ScheduleReviewResult> {
  const candidate = validateCandidate(value);
  if ('kind' in candidate) return candidate;
  if (matchesSchema(candidate.structuredIntent, MANUAL_POSTING_EVENT_SCHEMA)) {
    const mapped = mapManualPostingEvent(candidate.latestRequest, candidate.structuredIntent, candidate.selectedPostIds, candidate.selectedMediaIds, (options.now ?? (() => new Date()))(), options.fixture ?? createBenchFixture());
    if (mapped.kind !== 'proposal') return refused(mapped.code, mapped.message);
    const review = mapped.proposal;
    return { kind: 'review', review, reviewKind: 'direct_manual' };
  }
  if (matchesSchema(candidate.structuredIntent, MANUAL_POSTING_BATCH_SCHEMA)) {
    const mapped = mapManualPostingBatch(candidate.latestRequest, candidate.structuredIntent, candidate.selectedPostIds, candidate.selectedMediaIds, (options.now ?? (() => new Date()))());
    if (mapped.kind !== 'proposal') return refused(mapped.code, mapped.message);
    return { kind: 'batch_review', reviews: mapped.proposals };
  }
  const intent = candidate.structuredIntent as { outcome: string; requests: Array<Record<string, unknown>> };
  if (intent.outcome !== 'proposal' || intent.requests.length !== 1) {
    return refused('single_action_only', 'Review supports one complete Patreon posting request at a time.');
  }
  const action = intent.requests[0]!;
  const sourceRef = isRecord(action.source_ref) ? action.source_ref : null;
  const sourceMatchesSelection = !!sourceRef && (sourceRef.mode === 'selection' && sourceRef.id === null || sourceRef.mode === 'post_id' && sourceRef.id === candidate.selectedPostIds[0]);
  const absoluteTimeIntent = action.time_kind === 'absolute_local' && typeof action.local_date === 'string' &&
    action.weekday === null && action.weekday_qualifier === null && typeof action.local_time === 'string';
  const weekdayTimeIntent = action.time_kind === 'weekday' && action.local_date === null &&
    (action.weekday_qualifier === 'this' || action.weekday_qualifier === 'next') && typeof action.weekday === 'string' && typeof action.local_time === 'string';
  if (action.kind !== 'primary_draft' || action.command !== 'add' || action.destination !== 'patreon' ||
      action.delivery_intent !== 'prepare_for_creator_handoff' || action.enabled !== true ||
      action.title_mode !== 'literal' || typeof action.title_text !== 'string' || !action.title_text.trim() ||
      action.title_text.length > 200 || action.title_text !== action.title_text.trim() || !sourceMatchesSelection ||
      !(absoluteTimeIntent || weekdayTimeIntent) || action.timezone !== 'Europe/London') {
    return refused('unsupported_action', 'This review requires one enabled, literal-title Patreon draft for creator handoff with a future Europe/London date and time, using the current sample selection. Titles must be at most 200 characters with no surrounding whitespace.');
  }

  const now = (options.now ?? (() => new Date()))();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return refused('invalid_clock', 'A valid server clock is required to review a future posting time.');
  const compiled = await runPostingBench({
    mode: 'mock_posting', selectedPostIds: candidate.selectedPostIds, selectedMediaIds: candidate.selectedMediaIds,
    replay: { kind: 'edited', latestRequest: candidate.latestRequest, structuredIntent: candidate.structuredIntent },
  }, { useCurrentClock: true, now: () => now });
  if (compiled.status !== 'proposal' || !isRecord(compiled.result) || !isRecord(compiled.result.snapshot)) {
    const message = compiled.message ?? compiled.diagnostics[0] ?? 'The request needs clarification before it can be reviewed.';
    return refused(compiled.status === 'clarification' ? 'clarification_required' : 'plan_refused', message);
  }

  const snapshot = compiled.result.snapshot as Record<string, unknown>;
  const steps = Array.isArray(snapshot.steps) ? snapshot.steps as PlanStep[] : [];
  const groups = Array.isArray(snapshot.distribution_groups) ? snapshot.distribution_groups as Array<Record<string, unknown>> : [];
  const draft = steps.find(step => step.capability === 'prepare_post_draft');
  const distribution = steps.find(step => step.capability === 'prepare_distribution');
  const handoff = steps.find(step => step.capability === 'publish_handoff');
  const snapshotSource = isRecord(snapshot.source) ? snapshot.source : null;
  if (steps.length !== 3 || !draft || !distribution || !handoff ||
      steps.some(step => !step.enabled || step.capability !== 'prepare_post_draft' && step.capability !== 'prepare_distribution' && step.capability !== 'publish_handoff') ||
      !snapshotSource || snapshotSource.kind !== 'existing_post' || snapshotSource.post_id !== candidate.selectedPostIds[0] ||
      !Array.isArray(snapshotSource.selected_media_ids) || snapshotSource.selected_media_ids.length !== candidate.selectedMediaIds.length ||
      candidate.selectedMediaIds.some(id => !(snapshotSource.selected_media_ids as unknown[]).includes(id)) ||
      draft.target_post_id !== candidate.selectedPostIds[0] || draft.intended_destination !== 'patreon' ||
      draft.depends_on.length !== 0 || distribution.destination !== 'patreon' || distribution.source_step_id !== draft.step_id ||
      distribution.preview_step_id !== null || distribution.time !== null ||
      distribution.depends_on.length !== 1 || distribution.depends_on[0] !== draft.step_id ||
      handoff.destination !== 'patreon' || handoff.distribution_step_id !== distribution.step_id ||
      handoff.depends_on.length !== 1 || handoff.depends_on[0] !== distribution.step_id || handoff.time !== null ||
      groups.length !== 1 || groups[0]?.source_step_id !== draft.step_id || groups[0]?.preview_step_id !== null ||
      distribution.distribution_group_id !== groups[0]?.group_id ||
      !Array.isArray(groups[0]?.destination_step_ids) || (groups[0]!.destination_step_ids as unknown[]).length !== 1 ||
      (groups[0]!.destination_step_ids as unknown[])[0] !== distribution.step_id) {
    return refused('unsupported_graph', 'The compiled request must contain exactly one enabled Patreon draft, distribution, and handoff chain with no extra actions.');
  }
  const title = literalTitle(draft);
  const distributionTitle = literalTitle(distribution);
  if (!title || title !== action.title_text || distributionTitle !== title || distribution.copy_title.mode !== 'literal' || distribution.copy_title.value !== title) {
    return refused('literal_title_required', 'The compiled Patreon title must exactly match the requested literal title.');
  }
  if (!isFutureAbsolute(draft.time, now) || draft.time.timezone !== 'Europe/London') {
    return refused('future_time_required', 'Choose a valid future absolute date and time in Europe/London.');
  }

  const fixture = createBenchFixture();
  const source = createBenchPostCards(fixture).find(post => post.postId === candidate.selectedPostIds[0]);
  const media = candidate.selectedMediaIds.map(id => createBenchMediaDescriptors(fixture).find(item => item.id === id));
  if (!source || media.some(item => !item)) return refused('fixture_metadata_missing', 'The selected sample source could not be resolved.');
  const note = `Prepared from the “${source.title}” sample in the editor bench. Sample media is not attached to this event.`;
  const dueAt = { local: draft.time.local, timezone: 'Europe/London' as const, utc: new Date(draft.time.at_utc).toISOString() };
  return {
    kind: 'review', reviewKind: 'compiled_patreon',
    review: {
      source: { title: source.title, mediaLabel: media.map(item => item!.label).join(', ') }, destination: 'patreon', title, dueAt,
      warning: 'This creates one manual Schedule Rail event. The source and media are sample fixtures; no draft, media attachment, preview, handoff, publication, or reminder is created.',
      createPayload: {
        event_type: 'make_post', destination: 'patreon', title, note, due_at: dueAt.utc,
        remind_me: false, target_mode: 'new_post', post_id: null, external_url: null, create_relay_draft: false,
      },
    },
  };
}
