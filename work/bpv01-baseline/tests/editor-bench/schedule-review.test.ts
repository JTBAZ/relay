import { describe, expect, it } from 'vitest';
import { BENCH_IDS } from '../../src/editor-bench/fixtures.js';
import { reviewBenchSchedule } from '../../src/editor-bench/schedule-review.js';

const request = 'Prepare a Patreon post titled Aurora at 17:30 Europe/London on 2026-10-20';
const intent = (overrides: Record<string, unknown> = {}, quote = request) => ({
  base_revision: null, outcome: 'proposal', question: null,
  requests: [{
    command: 'add', target_handle: null, changed_fields: [], kind: 'primary_draft',
    source_ref: { mode: 'selection', id: null }, destination: 'patreon', title_mode: 'literal', title_text: 'Aurora',
    template_ref: { mode: 'none', value: null }, enabled: true, delivery_intent: 'prepare_for_creator_handoff', social_action: null,
    time_kind: 'absolute_local', local_date: '2026-10-20', weekday: null, weekday_qualifier: null, timezone: 'Europe/London',
    day_offset: null, target_destination: null, local_time: '17:30', time_text: '17:30 Europe/London on 2026-10-20', request_quote: quote,
    ...overrides,
  }],
});
const candidate = (changes: Record<string, unknown> = {}) => ({
  latestRequest: request, structuredIntent: intent(), selectedPostIds: [BENCH_IDS.posts[0]], selectedMediaIds: [BENCH_IDS.media[0]], ...changes,
});
const now = () => new Date('2026-10-17T12:00:00.000Z');

describe('editor bench schedule review mapping', () => {
  it('returns the one safe manual event payload from a future Patreon chain', async () => {
    const result = await reviewBenchSchedule(candidate(), { now });
    expect(result.kind).toBe('review');
    if (result.kind !== 'review') return;
    expect(result.review).toMatchObject({
      source: { title: 'Aurora study', mediaLabel: expect.any(String) }, destination: 'patreon', title: 'Aurora',
      dueAt: { local: '2026-10-20T17:30', timezone: 'Europe/London', utc: '2026-10-20T16:30:00.000Z' },
      createPayload: {
        event_type: 'make_post', destination: 'patreon', title: 'Aurora', due_at: '2026-10-20T16:30:00.000Z',
        remind_me: false, target_mode: 'new_post', post_id: null, external_url: null, create_relay_draft: false,
      },
    });
    expect(result.review.warning).toContain('sample fixtures');
    expect(JSON.stringify(result.review)).not.toContain(BENCH_IDS.posts[0]);
    expect(JSON.stringify(result.review)).not.toContain(BENCH_IDS.media[0]);
  });

  it('accepts a named fixture source, two owned media assets, and a future weekday', async () => {
    const latest = 'Prepare a Patreon post titled Two panels next Tuesday at 17:30 Europe/London';
    const selectedPostId = BENCH_IDS.posts[7];
    const selectedMediaIds = [BENCH_IDS.media[7], BENCH_IDS.media[8]];
    const namedIntent = intent({
      source_ref: { mode: 'post_id', id: selectedPostId }, title_text: 'Two panels',
      time_kind: 'weekday', local_date: null, weekday: 'tuesday', weekday_qualifier: 'next',
      time_text: 'next Tuesday at 17:30 Europe/London',
    }, latest);
    const result = await reviewBenchSchedule({ latestRequest: latest, structuredIntent: namedIntent, selectedPostIds: [selectedPostId], selectedMediaIds }, { now });
    expect(result.kind).toBe('review');
    if (result.kind !== 'review') return;
    expect(result.review).toMatchObject({
      title: 'Two panels',
      source: { mediaLabel: expect.stringContaining(', ') },
      dueAt: { local: '2026-10-20T17:30', timezone: 'Europe/London', utc: '2026-10-20T16:30:00.000Z' },
    });
  });

  it('refuses a missing time with an actionable clarification', async () => {
    const missing = intent({ time_kind: 'none', local_date: null, local_time: null, timezone: null });
    const result = await reviewBenchSchedule(candidate({ structuredIntent: missing }), { now });
    expect(result).toMatchObject({ kind: 'refused', code: 'unsupported_action', message: expect.stringContaining('future') });
  });

  it('refuses a foreign or unrelated sample source', async () => {
    const foreign = await reviewBenchSchedule(candidate({ selectedPostIds: ['post_from_my_account'] }), { now });
    expect(foreign).toMatchObject({ kind: 'refused', code: 'foreign_fixture' });
    const unrelated = await reviewBenchSchedule(candidate({ selectedMediaIds: [BENCH_IDS.media[1]] }), { now });
    expect(unrelated).toMatchObject({ kind: 'refused', code: 'fixture_association_mismatch' });
  });

  it('refuses compound actions even when extra actions are disabled', async () => {
    const compound = intent();
    (compound.requests as unknown[]).push({ ...((compound.requests as any[])[0]), kind: 'followup', enabled: false });
    const result = await reviewBenchSchedule(candidate({ structuredIntent: compound }), { now });
    expect(result).toMatchObject({ kind: 'refused', code: 'single_action_only' });
  });

  it('refuses source IDs that try to target a synthetic post directly', async () => {
    const forged = intent({ source_ref: { mode: 'post_id', id: BENCH_IDS.posts[1] } });
    const result = await reviewBenchSchedule(candidate({ structuredIntent: forged }), { now });
    expect(result).toMatchObject({ kind: 'refused', code: 'unsupported_action' });
  });

  it('refuses a date that has passed by the server clock', async () => {
    const result = await reviewBenchSchedule(candidate(), { now: () => new Date('2026-10-21T00:00:00.000Z') });
    expect(result).toMatchObject({ kind: 'refused', code: 'future_time_required' });
  });

  it('refuses malformed direct intents and legacy teasers without salvaging an event', async () => {
    const direct = { kind: 'manual_posting_event', destination: 'x', source_ref: { mode: 'selection', id: null }, title_text: 'Aurora cue', time_kind: 'absolute_local', local_date: '2026-10-24', weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: '2026-10-24 at 10:00 Europe/London' };
    const malformed = [
      { ...direct, destinations: ['x', 'deviantart'] },
      { ...direct, timezone: 'UTC' },
      { ...direct, local_time: null },
    ];
    for (const structuredIntent of malformed) {
      await expect(reviewBenchSchedule(candidate({ structuredIntent }), { now })).resolves.toMatchObject({ kind: 'refused' });
    }
    const teaser = intent({ kind: 'teaser', destination: 'x' });
    await expect(reviewBenchSchedule(candidate({ structuredIntent: teaser }), { now })).resolves.toMatchObject({ kind: 'refused', code: 'unsupported_action' });
  });

  it('revalidates the complete batch and returns no partial reviews when a later event fails', async () => {
    const latest = 'Schedule X Aurora thread on 2026-10-24 at 10:00 Europe/London and Patreon Aurora supporter on 2026-10-25 at 11:30 Europe/London';
    const batch = { kind: 'manual_posting_batch', source_ref: { mode: 'selection', id: null }, events: [
      { destination: 'x', title_text: 'Aurora thread', time_kind: 'absolute_local', local_date: '2026-10-24', weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: '2026-10-24 at 10:00 Europe/London' },
      { destination: 'patreon', title_text: 'Aurora supporter', time_kind: 'absolute_local', local_date: '2026-10-25', weekday: null, weekday_qualifier: null, local_time: '11:30', timezone: 'Europe/London', time_text: '2026-10-25 at 11:30 Europe/London' },
    ] };
    const input = { latestRequest: latest, structuredIntent: batch, selectedPostIds: [BENCH_IDS.posts[0]], selectedMediaIds: [BENCH_IDS.media[0]] };
    await expect(reviewBenchSchedule(input, { now })).resolves.toMatchObject({ kind: 'batch_review', reviews: [{ destination: 'x' }, { destination: 'patreon' }] });
    const invalidSecond = { ...batch, events: [batch.events[0], { ...batch.events[1], title_text: 'Invented title' }] };
    await expect(reviewBenchSchedule({ ...input, structuredIntent: invalidSecond }, { now })).resolves.toMatchObject({ kind: 'refused', code: 'literal_grounding_required' });
  });
});
