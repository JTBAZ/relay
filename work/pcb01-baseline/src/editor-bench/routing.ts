import { compileNewPlan, type TrustedLookup } from '../conversational-planning/compiler.js';
import { createCalendarResolver } from '../conversational-planning/calendar-resolver.js';
import { interpretRequest, type InterpretedRequest, type PlanningProvider, type PlanningProviderResponse } from '../conversational-planning/intent.js';
import { BENCH_CREATOR_ID, BENCH_IDS, createBenchFixture, createBenchMediaDescriptors, createBenchPostCards, type BenchExample } from './fixtures.js';
import type { BenchProvenance, BenchRequest, BenchResponse, BenchStatus } from './curation.js';
import type { PreviewTemplateConfigV1 } from '../distribution/preview-template-config.js';

export type PostingExample = Omit<BenchExample, 'mode'> & { mode: 'mock_posting' };
export interface RunPostingOptions { provider?: PlanningProvider; signal?: AbortSignal; now?: () => Date; useCurrentClock?: boolean }
const destinationReadiness = new Map([
  ['patreon', 'available'], ['x', 'needs_credential'], ['deviantart', 'needs_extension'], ['bluesky', 'needs_credential'],
] as const);
export type BenchRequestClock = { receivedAtUtc: string; localDate: string; timezone: 'Europe/London' };
type RequestClock = BenchRequestClock;
const requestTime: RequestClock = { receivedAtUtc: '2026-10-15T10:00:00.000Z', localDate: '2026-10-15', timezone: 'Europe/London' };
export function currentBenchRequestClock(date: Date): RequestClock {
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(safeDate);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { receivedAtUtc: safeDate.toISOString(), localDate: `${values.year}-${values.month}-${values.day}`, timezone: 'Europe/London' };
}

const primaryRequest = 'Prepare a Patreon draft titled Aurora';
const xRequest = 'create an X teaser titled Aurora square using Square teaser';
const daRequest = 'create a DeviantArt teaser titled Aurora gallery using Square teaser';
const replyRequest = 'prepare a disabled X reply block placeholder one day after publication at 10:00 Europe/London';
const checkRequest = 'prepare a disabled X engagement check placeholder two days after publication at 10:00 Europe/London';
const squarePreviewTemplate: PreviewTemplateConfigV1 = {
  schemaVersion: 1, preset: 'tight_crop', aspectKey: '1:1', compositionId: null, compositionProps: null,
  compositionVariantIndex: null, overlayDoc: {}, templateOptions: {},
  destination: { selectedDestinationId: 'x', customDestinationUrl: null },
};
export function getBenchSquarePreviewTemplate() {
  return { id: 'bench_template_square' as const, name: 'Square teaser' as const, config: structuredClone(squarePreviewTemplate) };
}
export const POSTING_EXAMPLES: PostingExample[] = [{
  id: 'blocked-handoffs-and-paused-followups', mode: 'mock_posting', title: 'Blocked handoffs and paused follow-ups',
  latestRequest: `${primaryRequest}, ${xRequest}, and ${daRequest}, then ${replyRequest} and ${checkRequest}.`,
  selectedPostIds: [BENCH_IDS.posts[0]], selectedMediaIds: [BENCH_IDS.media[0]],
  structuredIntent: {
    base_revision: null, outcome: 'proposal', question: null,
    requests: [
      { command: 'add', target_handle: null, changed_fields: [], kind: 'primary_draft', source_ref: { mode: 'selection', id: null }, destination: 'patreon', title_mode: 'literal', title_text: 'Aurora', template_ref: { mode: 'none', value: null }, enabled: true, delivery_intent: 'prepare_for_creator_handoff', social_action: null, time_kind: 'none', local_date: null, weekday: null, weekday_qualifier: null, timezone: null, day_offset: null, target_destination: null, local_time: null, time_text: null, request_quote: primaryRequest },
      { command: 'add', target_handle: null, changed_fields: [], kind: 'teaser', source_ref: { mode: 'selection', id: null }, destination: 'x', title_mode: 'literal', title_text: 'Aurora square', template_ref: { mode: 'id', value: 'bench_template_square' }, enabled: true, delivery_intent: 'prepare_for_creator_handoff', social_action: null, time_kind: 'none', local_date: null, weekday: null, weekday_qualifier: null, timezone: null, day_offset: null, target_destination: null, local_time: null, time_text: null, request_quote: xRequest },
      { command: 'add', target_handle: null, changed_fields: [], kind: 'teaser', source_ref: { mode: 'selection', id: null }, destination: 'deviantart', title_mode: 'literal', title_text: 'Aurora gallery', template_ref: { mode: 'id', value: 'bench_template_square' }, enabled: true, delivery_intent: 'prepare_for_creator_handoff', social_action: null, time_kind: 'none', local_date: null, weekday: null, weekday_qualifier: null, timezone: null, day_offset: null, target_destination: null, local_time: null, time_text: null, request_quote: daRequest },
      // The quoted request explicitly asks to keep these placeholder actions disabled until X is connected.
      { command: 'add', target_handle: null, changed_fields: [], kind: 'followup', source_ref: { mode: 'selection', id: null }, destination: 'x', title_mode: 'none', title_text: null, template_ref: { mode: 'none', value: null }, enabled: false, delivery_intent: 'none', social_action: 'reply_block', time_kind: 'publication_calendar_day', local_date: null, weekday: null, weekday_qualifier: null, timezone: 'Europe/London', day_offset: 1, target_destination: 'x', local_time: '10:00', time_text: 'one day after publication at 10:00 Europe/London', request_quote: replyRequest },
      { command: 'add', target_handle: null, changed_fields: [], kind: 'followup', source_ref: { mode: 'selection', id: null }, destination: 'x', title_mode: 'none', title_text: null, template_ref: { mode: 'none', value: null }, enabled: false, delivery_intent: 'none', social_action: 'engagement_check', time_kind: 'publication_calendar_day', local_date: null, weekday: null, weekday_qualifier: null, timezone: 'Europe/London', day_offset: 2, target_destination: 'x', local_time: '10:00', time_text: 'two days after publication at 10:00 Europe/London', request_quote: checkRequest },
    ],
  },
}];

const invalid = (message: string): BenchResponse => ({ mode: 'mock_posting', provenance: 'none', status: 'rejected', interpreted: null, result: null, beforeAfter: [], diagnostics: [message] });
function exactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function requestValid(value: unknown): value is BenchRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (!exactKeys(r, ['mode', 'selectedPostIds', 'selectedMediaIds', 'replay']) || r.mode !== 'mock_posting' || !Array.isArray(r.selectedPostIds) || !Array.isArray(r.selectedMediaIds) || r.selectedPostIds.length > 16 || r.selectedMediaIds.length > 32) return false;
  if ([...r.selectedPostIds, ...r.selectedMediaIds].some(id => typeof id !== 'string' || !id || id.length > 200)) return false;
  if (!r.replay || typeof r.replay !== 'object' || Array.isArray(r.replay)) return false;
  const replay = r.replay as Record<string, unknown>;
  if (replay.kind === 'example') return exactKeys(replay, ['kind', 'exampleId']) && typeof replay.exampleId === 'string' && replay.exampleId.length <= 100;
  if (replay.kind === 'edited') return exactKeys(replay, ['kind', 'latestRequest', 'structuredIntent']) && typeof replay.latestRequest === 'string' && replay.latestRequest.trim().length > 0 && replay.latestRequest.length <= 4000;
  if (replay.kind === 'free_text') return exactKeys(replay, ['kind', 'latestRequest']) && typeof replay.latestRequest === 'string' && replay.latestRequest.trim().length > 0 && replay.latestRequest.length <= 4000;
  return false;
}
function replayProvider(response: InterpretedRequest): PlanningProvider {
  const result: PlanningProviderResponse = { text: JSON.stringify(response), usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, finishReason: 'stop' };
  return { async respond() { return result; } };
}
export function buildBenchPlanningContext(selectedPostIds: string[], selectedMediaIds: string[], clock: RequestClock) {
  const fixture = createBenchFixture();
  const cards = createBenchPostCards(fixture);
  const posts = selectedPostIds.map(postId => {
    const card = cards.find(item => item.postId === postId)!;
    const statePost = fixture.state.tables.posts.find(row => row.id === postId)!;
    const member = fixture.state.tables.workMembers.find(row => row.postId === postId);
    const seriesMember = fixture.state.tables.seriesMembers.find(row => row.creativeWorkId === member?.creativeWorkId);
    return { id: postId, effective_title: card.title, publish_state: statePost.status === 'published' ? 'published' as const : 'draft' as const, series_member_id: seriesMember?.id ?? null, part_label: seriesMember?.partLabel ?? null, selected_media_ids: card.mediaIds.filter(id => selectedMediaIds.includes(id)), creative_work_id: member?.creativeWorkId ?? null };
  });
  const descriptors = createBenchMediaDescriptors(fixture);
  const media = selectedMediaIds.map(id => {
    const item = descriptors.find(asset => asset.id === id)!;
    return { id, filename: item.filename, mime: item.mimeType, processing_status: item.processingStatus, primary_post_id: item.postId, linked_post_ids: [item.postId] };
  });
  return {
    request_clock: { received_at_utc: clock.receivedAtUtc, local_date: clock.localDate, timezone: clock.timezone },
    plan_revision: null,
    selected: { media_ids: [...selectedMediaIds], post_ids: [...selectedPostIds], work_id: null },
    media, posts,
    templates: [{ id: 'bench_template_square', name: 'Square teaser' }],
    destinations: [...destinationReadiness].map(([id, readiness]) => ({ id, readiness })),
    creator_timezone: 'Europe/London', editable_nodes: [],
    allowed_request_kinds: ['primary_draft', 'teaser', 'followup'], allowed_social_actions: ['reply_block', 'engagement_check'], prior_clarification: null,
    // Metadata fields required by the interpreter projection. The compiler uses trusted fixture lookup below.
  };
}
function fixtureLookup(): TrustedLookup {
  const fixture = createBenchFixture();
  const cards = createBenchPostCards(fixture);
  const descriptors = createBenchMediaDescriptors(fixture);
  const mediaRows = descriptors.map(item => ({ id: item.id, creatorId: BENCH_CREATOR_ID, processingStatus: item.processingStatus === 'ready' ? 'READY' as const : item.processingStatus === 'failed' ? 'FAILED' as const : 'PENDING' as const, ingestOrigin: 'library', primaryPostId: item.postId, postIds: [item.postId], autopostDraftId: null, filename: item.filename, mimeType: item.mimeType }));
  const postRows = cards.map(post => {
    const statePost = fixture.state.tables.posts.find(row => row.id === post.postId)!;
    const member = fixture.state.tables.workMembers.find(row => row.postId === post.postId)!;
    const seriesMember = fixture.state.tables.seriesMembers.find(row => row.creativeWorkId === member.creativeWorkId);
    return { id: post.postId, creatorId: BENCH_CREATOR_ID, publishState: statePost.status === 'published' ? 'published' as const : 'draft' as const, effectiveTitle: post.title, mediaIds: [...post.mediaIds], creativeWorkId: member.creativeWorkId as string, seriesMemberId: typeof seriesMember?.id === 'string' ? seriesMember.id : null, verifiedPartLabel: typeof seriesMember?.partLabel === 'string' ? seriesMember.partLabel : null };
  });
  const template = { ...getBenchSquarePreviewTemplate(), creatorId: BENCH_CREATOR_ID, updatedAt: '2026-10-15T10:00:00.000Z' };
  return {
    async loadMedia(_creator, ids) { return mediaRows.filter(row => ids.includes(row.id)); },
    async loadPosts(_creator, ids) { return postRows.filter(row => ids.includes(row.id)); },
    async loadSourceRelations(_creator, ids) { return new Map(ids.map(id => {
      const postId = mediaRows.find(row => row.id === id)?.primaryPostId;
      const workId = fixture.state.tables.workMembers.find(row => row.postId === postId)?.creativeWorkId;
      const seriesMemberId = fixture.state.tables.seriesMembers.find(row => row.creativeWorkId === workId)?.id;
      return [id, { postIds: new Set(mediaRows.find(row => row.id === id)?.postIds ?? []), creativeWorkIds: new Set(workId ? [String(workId)] : []), creativeSeriesMemberIds: new Set(seriesMemberId ? [String(seriesMemberId)] : []) }] as const;
    })); },
    async loadTemplates(_creator, ids) { return ids.includes(template.id) ? [template] : []; },
    async listTemplatesByName(_creator, name) { return name === template.name ? [template] : []; },
    async destinationReadiness() { return new Map(destinationReadiness); },
    async hasAutopostEntitlement() { return true; },
  };
}
function statusFor(outcome: string, compileKind?: string): BenchStatus {
  if (compileKind === 'plan') return 'proposal';
  if (compileKind === 'clarification_preview' || outcome === 'clarification') return 'clarification';
  if (outcome === 'limitation' || compileKind === 'limitation') return 'limitation';
  if (outcome === 'no_change') return 'unchanged';
  if (outcome === 'unavailable') return 'unavailable';
  return 'rejected';
}
function graphFacts(snapshot: Extract<Awaited<ReturnType<typeof compileNewPlan>>, { kind: 'plan' }>['snapshot'], clock: RequestClock, fixed: boolean) {
  const steps = snapshot.steps.map(step => ({
    id: step.step_id, capability: step.capability, dependsOn: [...step.depends_on], enabled: step.enabled,
    destination: 'destination' in step ? step.destination : 'intended_destination' in step ? step.intended_destination : null,
    destinationReadiness: 'destination' in step ? destinationReadiness.get(step.destination) ?? 'unknown' : null,
    title: 'value' in step.title ? step.title.value : `${step.title.prefix}${step.title.part}${step.title.suffix}`,
    time: step.time,
  }));
  return { source: snapshot.source, steps, distributionGroups: snapshot.distribution_groups, clarifications: snapshot.clarifications, unresolvedRequests: snapshot.unresolved_requests, review: snapshot.review, requestClock: { receivedAtUtc: clock.receivedAtUtc, timezone: clock.timezone, localDate: clock.localDate, label: fixed ? 'Fixed fixture sample clock; this is not the current time.' : 'Current request clock used for this interpreted turn.' }, snapshot, note: 'Proposal only. No draft, preview, handoff, publication, or reminder has been executed.' };
}

/** Uses the existing strict interpreter validator and plan compiler against per-request fixtures. */
export async function runPostingBench(value: unknown, options: RunPostingOptions = {}): Promise<BenchResponse> {
  if (!requestValid(value)) return invalid('invalid_request: Request shape or selection bound is invalid.');
  const request = value;
  if (new Set(request.selectedPostIds).size !== request.selectedPostIds.length || new Set(request.selectedMediaIds).size !== request.selectedMediaIds.length) return invalid('invalid_selection: Choose distinct fixture IDs.');
  if (request.selectedPostIds.some(id => !(BENCH_IDS.posts as readonly string[]).includes(id)) || request.selectedMediaIds.some(id => !(BENCH_IDS.media as readonly string[]).includes(id))) return invalid('foreign_selection: Select only owned synthetic fixture IDs.');
  if (request.selectedPostIds.length > 4 || request.selectedMediaIds.length > 3) {
    const message = 'Mock posting can compile at most four selected posts and three media assets at a time. Choose one source or narrow the selection, then retry.';
    return { mode: 'mock_posting', provenance: 'none', status: 'clarification', interpreted: null, result: null, beforeAfter: [], diagnostics: ['selection_context_limit', message], message };
  }
  const replay = request.replay;
  let latestRequest: string, provider: PlanningProvider, provenance: BenchProvenance;
  if (replay.kind === 'example') {
    const example = POSTING_EXAMPLES.find(item => item.id === replay.exampleId);
    if (!example) return invalid('unknown_example: Choose a known mock-posting example.');
    const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
    if (!same(request.selectedPostIds, example.selectedPostIds) || !same(request.selectedMediaIds, example.selectedMediaIds)) return invalid('example_selection_mismatch: Load the example with its paired post and media.');
    latestRequest = example.latestRequest;
    provider = replayProvider(example.structuredIntent as unknown as InterpretedRequest);
    provenance = 'example_replay';
  } else if (replay.kind === 'edited') {
    let intentBytes = 0;
    try { intentBytes = Buffer.byteLength(JSON.stringify(replay.structuredIntent) ?? ''); }
    catch { return invalid('invalid_intent: Structured intent must be JSON data.'); }
    if (intentBytes > 100_000) return invalid('intent_limit: Structured intent must be at most 100,000 UTF-8 bytes.');
    latestRequest = replay.latestRequest;
    provider = replayProvider(replay.structuredIntent as InterpretedRequest);
    provenance = 'edited_replay';
  } else {
    if (!options.provider) return { mode: 'mock_posting', provenance: 'none', status: 'unavailable', interpreted: null, result: null, beforeAfter: [], diagnostics: ['model_interpretation_unavailable: Free text is not interpreted in offline mode. Load an example or edit strict structured intent.'], message: 'Model interpretation is unavailable. Edit structured intent or load a paired example.' };
    latestRequest = replay.latestRequest;
    provider = options.provider;
    provenance = 'model_interpretation';
  }
  const fixedClock = provenance !== 'model_interpretation' && !options.useCurrentClock;
  const requestClock = fixedClock ? requestTime : currentBenchRequestClock((options.now ?? (() => new Date()))());

  try {
    const interpreted = await interpretRequest({ latestRequest, rawContext: buildBenchPlanningContext(request.selectedPostIds, request.selectedMediaIds, requestClock), provider, signal: options.signal, deadlineMs: 30_000 });
    const resultProvenance = interpreted.outcome === 'error' ? 'none' : provenance;
    if (interpreted.outcome !== 'proposal') return {
      mode: 'mock_posting', provenance: resultProvenance, status: statusFor(interpreted.outcome), interpreted,
      result: null, beforeAfter: [], diagnostics: [interpreted.code ?? interpreted.outcome, interpreted.question ?? 'The interpreted request did not produce a plan.'],
      ...(interpreted.question ? { message: interpreted.question } : {}),
    };
    // The compiler schema is exact. Drop interpreter accounting/diagnostic fields before passing trusted intent.
    const trustedIntent: InterpretedRequest = {
      outcome: interpreted.outcome, base_revision: interpreted.base_revision,
      question: interpreted.question, requests: interpreted.requests,
    };
    const compiled = await compileNewPlan({
      interpreted: trustedIntent, latestRequest, creatorId: BENCH_CREATOR_ID,
      selectedMediaIds: request.selectedMediaIds, selectedPostIds: request.selectedPostIds,
      requestClock: { receivedAtUtc: requestClock.receivedAtUtc, timezone: requestClock.timezone }, sourceRevision: 'bench-fixture-v1', lookup: fixtureLookup(), calendarResolver: createCalendarResolver(),
      idFactory: (() => { let sequence = 0; return kind => `bench_${kind}_${++sequence}`; })(), now: () => requestClock.receivedAtUtc,
    });
    if (compiled.kind === 'plan') return {
      mode: 'mock_posting', provenance, status: compiled.snapshot.clarifications.length || compiled.snapshot.unresolved_requests.length ? 'clarification' : 'proposal', interpreted,
      result: graphFacts(compiled.snapshot, requestClock, fixedClock), beforeAfter: [],
      diagnostics: ['simulation_only: This graph describes a proposal; no node was executed.', ...compiled.snapshot.clarifications.map(slot => `${slot.reason}: ${slot.question}`), ...[...destinationReadiness].filter(([, value]) => value !== 'available').map(([destination, value]) => `${destination}_blocked: ${value}.`)],
      ...(compiled.snapshot.clarifications[0]?.question ? { message: compiled.snapshot.clarifications[0].question } : {}),
    };
    if (compiled.kind === 'clarification_preview') return {
      mode: 'mock_posting', provenance, status: 'clarification', interpreted,
      result: { source: compiled.source, slots: compiled.slots, unresolved: compiled.unresolved, note: 'Clarification preview only. No plan was executed.' }, beforeAfter: [],
      diagnostics: compiled.slots.map(slot => `${slot.reason}: ${slot.question}`),
      ...(compiled.slots[0]?.question ? { message: compiled.slots[0].question } : {}),
    };
    return { mode: 'mock_posting', provenance, status: 'limitation', interpreted, result: compiled, beforeAfter: [], diagnostics: [compiled.code] };
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message.slice(0, 500) : 'The posting proposal could not be compiled.';
    return { mode: 'mock_posting', provenance: provenance === 'model_interpretation' ? 'none' : provenance, status: 'rejected', interpreted: null, result: null, beforeAfter: [], diagnostics: [safeMessage], message: safeMessage };
  }
}
