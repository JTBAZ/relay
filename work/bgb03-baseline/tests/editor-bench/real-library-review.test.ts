import { describe, expect, it } from 'vitest';
import { reviewRealLibraryManualEvents } from '../../src/editor-bench/real-library-review.js';

const source = {
  postId: 'post-real-aurora', versionId: 'version-3', title: 'Aurora Study', media: [
    { id: 'media-second', label: 'Panel 2 · image/png', mime: 'image/png', processingStatus: 'READY' },
    { id: 'media-first', label: 'Panel 1 · image/png', mime: 'image/png', processingStatus: 'READY' },
  ],
};
const latestRequest = 'Schedule an X cue titled Aurora thread on 2026-10-24 at 10:00 Europe/London and a Patreon cue titled Aurora supporter on 2026-10-25 at 11:30 Europe/London';
const intent = {
  kind: 'real_library_manual_events', events: [
    { destination: 'x', title_text: 'Aurora thread', time_kind: 'absolute_local', local_date: '2026-10-24', weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: '2026-10-24 at 10:00 Europe/London' },
    { destination: 'patreon', title_text: 'Aurora supporter', time_kind: 'absolute_local', local_date: '2026-10-25', weekday: null, weekday_qualifier: null, local_time: '11:30', timezone: 'Europe/London', time_text: '2026-10-25 at 11:30 Europe/London' },
  ],
};
const input = { latestRequest, source: { postId: source.postId, versionId: source.versionId, mediaIds: ['media-second', 'media-first'] }, intent };

describe('real Library manual review mapping', () => {
  it('retains selected media order and creates existing-post payloads for every destination', async () => {
    const result = await reviewRealLibraryManualEvents(input, { now: () => new Date('2026-10-17T12:00:00.000Z'), loadSource: async binding => ({ ...source, media: binding.mediaIds.map(id => source.media.find(media => media.id === id)!) }) });
    expect(result).toMatchObject({ kind: 'real_library_review', source: input.source, intent, items: [
      { destination: 'x', review: { title: 'Aurora thread', attachment: { postId: source.postId, versionId: source.versionId, mediaIds: ['media-second', 'media-first'] }, createPayload: { target_mode: 'existing_post', post_id: source.postId, external_url: null, remind_me: false, create_relay_draft: false } } },
      { destination: 'patreon', review: { title: 'Aurora supporter', attachment: { postId: source.postId, versionId: source.versionId, mediaIds: ['media-second', 'media-first'] }, createPayload: { target_mode: 'existing_post', post_id: source.postId } } },
    ] });
    if (result.kind === 'real_library_review') expect(result.items[0]!.review.source.mediaLabel).toBe('Panel 2 · image/png, Panel 1 · image/png');
  });

  it('returns no partial reviews when a later destination fails literal grounding', async () => {
    const invalid = { ...intent, events: [intent.events[0], { ...intent.events[1], title_text: 'Unrequested title' }] };
    const result = await reviewRealLibraryManualEvents({ ...input, intent: invalid }, { now: () => new Date('2026-10-17T12:00:00.000Z'), loadSource: async () => source });
    expect(result).toMatchObject({ kind: 'refused', code: 'literal_grounding_required' });
    expect(result).not.toHaveProperty('items');
  });

  it('refuses duplicate destinations and stale source bindings before review', async () => {
    const duplicate = { ...intent, events: [intent.events[0], { ...intent.events[1], destination: 'x' }] };
    await expect(reviewRealLibraryManualEvents({ ...input, intent: duplicate }, { loadSource: async () => source })).resolves.toMatchObject({ kind: 'refused', code: 'duplicate_destination' });
    await expect(reviewRealLibraryManualEvents(input, { loadSource: async () => ({ ...source, versionId: 'version-4' }) })).resolves.toMatchObject({ kind: 'refused', code: 'source_binding_mismatch' });
  });
});
