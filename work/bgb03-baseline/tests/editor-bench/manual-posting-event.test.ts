import { describe, expect, it } from 'vitest';
import { BENCH_IDS } from '../../src/editor-bench/fixtures.js';
import { mapManualPostingBatch, mapManualPostingEvent } from '../../src/editor-bench/manual-posting-event.js';

const makeIntent = (changes: Record<string, unknown> = {}) => ({
  kind: 'manual_posting_event', destination: 'x', source_ref: { mode: 'selection', id: null }, title_text: 'Aurora cue',
  time_kind: 'absolute_local', local_date: '2026-10-24', weekday: null, weekday_qualifier: null,
  local_time: '10:00', timezone: 'Europe/London', time_text: '2026-10-24 at 10:00 Europe/London', ...changes,
});
const time = '2026-10-24 at 10:00 Europe/London';

describe('direct manual posting event mapper', () => {
  it('maps a literal X event to a future unlinked proposal', () => {
    const result = mapManualPostingEvent(`Create an X cue titled Aurora cue on ${time}`, makeIntent(), [BENCH_IDS.posts[0]], [BENCH_IDS.media[0]], new Date('2026-10-17T12:00:00.000Z'));
    expect(result).toMatchObject({ kind: 'proposal', proposal: { destination: 'x', title: 'Aurora cue', dueAt: { local: '2026-10-24T10:00', utc: '2026-10-24T09:00:00.000Z' }, createPayload: { event_type: 'make_post', destination: 'x', post_id: null, external_url: null, create_relay_draft: false, remind_me: false } } });
    if (result.kind === 'proposal') expect(result.proposal.warning).toContain('no media attachment');
  });

  it('resolves a DeviantArt weekday across the London autumn clock change', () => {
    const latest = 'Make a DeviantArt cue titled Aurora cue this Sunday at 01:30 Europe/London';
    const result = mapManualPostingEvent(latest, makeIntent({ destination: 'deviantart', time_kind: 'weekday', local_date: null, weekday: 'sunday', weekday_qualifier: 'this', local_time: '01:30', time_text: 'this Sunday at 01:30 Europe/London' }), [BENCH_IDS.posts[0]], [BENCH_IDS.media[0]], new Date('2026-10-19T10:00:00.000Z'));
    expect(result).toMatchObject({ kind: 'proposal', proposal: { destination: 'deviantart', dueAt: { local: '2026-10-25T01:30', timezone: 'Europe/London', utc: '2026-10-25T00:30:00.000Z' } } });
  });

  it('refuses ungrounded title or time, foreign media, and an invalid clock', () => {
    const now = new Date('2026-10-17T12:00:00.000Z');
    const args = [`Create an X cue titled Aurora cue on ${time}`, [BENCH_IDS.posts[0]], [BENCH_IDS.media[0]], now] as const;
    expect(mapManualPostingEvent(args[0], makeIntent({ title_text: 'Made up' }), [...args[1]], [...args[2]], args[3])).toMatchObject({ kind: 'refused', code: 'literal_grounding_required' });
    expect(mapManualPostingEvent(args[0], makeIntent({ time_text: 'tomorrow' }), [...args[1]], [...args[2]], args[3])).toMatchObject({ kind: 'refused', code: 'literal_grounding_required' });
    expect(mapManualPostingEvent(args[0], makeIntent(), [...args[1]], [BENCH_IDS.media[1]], args[3])).toMatchObject({ kind: 'refused', code: 'fixture_association_mismatch' });
    expect(mapManualPostingEvent(args[0], makeIntent(), [...args[1]], [...args[2]], new Date('invalid'))).toMatchObject({ kind: 'refused', code: 'invalid_clock' });
  });

  it('maps distinct Patreon and X events with independent literal titles and times', () => {
    const latest = 'Schedule an X post titled Aurora thread on 2026-10-24 at 10:00 Europe/London and a Patreon post titled Aurora supporter on 2026-10-25 at 11:30 Europe/London';
    const batch = { kind: 'manual_posting_batch', source_ref: { mode: 'selection', id: null }, events: [
      { destination: 'x', title_text: 'Aurora thread', time_kind: 'absolute_local', local_date: '2026-10-24', weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: '2026-10-24 at 10:00 Europe/London' },
      { destination: 'patreon', title_text: 'Aurora supporter', time_kind: 'absolute_local', local_date: '2026-10-25', weekday: null, weekday_qualifier: null, local_time: '11:30', timezone: 'Europe/London', time_text: '2026-10-25 at 11:30 Europe/London' },
    ] };
    const result = mapManualPostingBatch(latest, batch, [BENCH_IDS.posts[0]], [BENCH_IDS.media[0]], new Date('2026-10-17T12:00:00.000Z'));
    expect(result).toMatchObject({ kind: 'proposal', proposals: [
      { destination: 'x', title: 'Aurora thread', dueAt: { local: '2026-10-24T10:00' }, createPayload: { destination: 'x', post_id: null, external_url: null, create_relay_draft: false, remind_me: false } },
      { destination: 'patreon', title: 'Aurora supporter', dueAt: { local: '2026-10-25T11:30' }, createPayload: { destination: 'patreon', post_id: null, external_url: null, create_relay_draft: false, remind_me: false } },
    ] });
  });

  it('refuses the whole batch when a later event is invalid or a destination is duplicated', () => {
    const latest = 'Schedule X and DeviantArt titled Aurora at 10:00 Europe/London on 2026-10-24';
    const event = (destination: 'x'|'deviantart', title_text = 'Aurora') => ({ destination, title_text, time_kind: 'absolute_local', local_date: '2026-10-24', weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: '10:00 Europe/London on 2026-10-24' });
    const base = { kind: 'manual_posting_batch', source_ref: { mode: 'selection', id: null }, events: [event('x'), event('deviantart')] };
    const args = [latest, [BENCH_IDS.posts[0]], [BENCH_IDS.media[0]], new Date('2026-10-17T12:00:00.000Z')] as const;
    expect(mapManualPostingBatch(args[0], { ...base, events: [base.events[0], { ...base.events[1], title_text: 'Made up' }] }, [...args[1]], [...args[2]], args[3])).toMatchObject({ kind: 'refused', code: 'literal_grounding_required' });
    expect(mapManualPostingBatch(args[0], { ...base, events: [base.events[0], event('x')] }, [...args[1]], [...args[2]], args[3])).toMatchObject({ kind: 'refused', code: 'duplicate_destination' });
  });
});
