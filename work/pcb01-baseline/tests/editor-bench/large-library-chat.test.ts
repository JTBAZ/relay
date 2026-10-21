import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { matchesSchema } from '../../src/gallery-editor/action-validation.js';
import type { EditorProvider } from '../../src/gallery-editor/provider.js';
import { buildMockDateCandidates, buildMockLibraryVocabulary, createMockLargeLibraryResponseSchema, LARGE_LIBRARY_CHAT_LIMITS, runMockLargeLibraryChat } from '../../src/editor-bench/large-library-chat.js';
import { createMockLargeLibrarySnapshot } from '../../src/editor-bench/large-library-chat-fixture.js';
import { createLargeLibraryProofReportWriter } from '../../src/editor-bench/large-library-chat-report.js';
import { REAL_LIBRARY_MODEL_RESPONSE_SCHEMA } from '../../src/editor-bench/real-library-selection.js';
import { resolveDatePredicate } from '../../src/editor-bench/selector.js';
import type { RetrievalRefinementState } from '../../src/editor-bench/real-library-selection.js';

const now = new Date('2026-10-18T12:00:00.000Z');
const firstRequest = 'Select images tagged for the coast and published this month, excluding sketches.';
const followupRequest = 'Also add the full City of Heroes series and every piece whose description mentions Wonder Woman.';
const tag = (value: string, requestQuote: string) => ({ field: 'tag', value, requestQuote });
const image = { field: 'media_type', value: 'image', requestQuote: 'images' };
const firstSelection = {
  mode: 'replace', requestQuote: firstRequest,
  selector: {
    base: 'catalog', all: [image, tag('coastal', 'coast'), { field: 'published_date', op: 'in_month', value: 'this_month', requestQuote: 'this month' }],
    any: [], none: [tag('sketch', 'sketches')]
  }
};
const followupSelection = {
  mode: 'add', requestQuote: followupRequest,
  selector: {
    base: 'catalog', all: [],
    any: [
      { field: 'series_id', value: 'series_city_heroes', requestQuote: 'full City of Heroes series' },
      { field: 'description', value: 'Wonder Woman', requestQuote: 'description mentions Wonder Woman' }
    ], none: []
  }
};
function providerFor(result: unknown, seen: Array<Record<string, unknown>> = [], shouldThrow = false): EditorProvider {
  return { async respond(request) {
    seen.push(request as unknown as Record<string, unknown>);
    if (shouldThrow) throw new Error('provider test failure');
    return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }], usage: { inputTokens: 42, outputTokens: 13, costUsd: 0.0001 } };
  } };
}
function selected(snapshot: ReturnType<typeof createMockLargeLibrarySnapshot>, predicate: (post: typeof snapshot.posts[number]) => boolean) { return snapshot.posts.filter(predicate).map(post => post.postId); }

describe('large synthetic Library chat', () => {
  it('keeps full-catalog matches, all requested criteria, and input cost independent of 40 vs 1,001 rows', async () => {
    const small = createMockLargeLibrarySnapshot(40), large = createMockLargeLibrarySnapshot(1001);
    const smallSeen: Array<Record<string, unknown>> = [], largeSeen: Array<Record<string, unknown>> = [];
    const resultFor = (selection: unknown) => ({ kind: 'selection', selection, intent: null });
    const smallResult = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: small, provider: providerFor(resultFor(firstSelection), smallSeen), now });
    const largeResult = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: large, provider: providerFor(resultFor(firstSelection), largeSeen), now });
    const expectedSmall = selected(small, post => post.tags.includes('coastal') && post.publishedAt?.startsWith('2026-10-') === true && post.media.some(media => media.mimeType?.startsWith('image/')) && !post.tags.includes('sketch'));
    const expectedLarge = selected(large, post => post.tags.includes('coastal') && post.publishedAt?.startsWith('2026-10-') === true && post.media.some(media => media.mimeType?.startsWith('image/')) && !post.tags.includes('sketch'));
    expect(expectedSmall).toEqual(['large_post_0005', 'large_post_0035']);
    expect(expectedLarge).toEqual(['large_post_0005', 'large_post_0035', 'large_post_0750']);
    expect((smallResult.body as any).selection.postIds).toEqual(expectedSmall);
    expect((largeResult.body as any).selection.postIds).toEqual(expectedLarge);
    expect((largeResult.body as any).refinementState.excludedPostIds).toEqual(selected(large, post => post.tags.includes('sketch')));
    expect((largeResult.body as any).result.selector).toEqual(firstSelection.selector);
    expect(smallSeen).toHaveLength(1);
    expect(largeSeen).toHaveLength(1);
    expect(smallSeen[0]!.responseSchema).not.toBe(REAL_LIBRARY_MODEL_RESPONSE_SCHEMA);
    expect(smallSeen[0]!.responseSchema).toEqual(largeSeen[0]!.responseSchema);
    expect(JSON.stringify(REAL_LIBRARY_MODEL_RESPONSE_SCHEMA)).not.toContain('this_month');
    const smallInput = smallSeen[0]!.input as unknown[];
    const largeInput = largeSeen[0]!.input as unknown[];
    expect(smallInput).toEqual(largeInput);
    expect(JSON.stringify(smallInput)).not.toContain('large_post_');
    expect(JSON.stringify(smallInput)).not.toContain('Wonder Woman shoreline study');
    expect(buildMockLibraryVocabulary(small, firstRequest)).toEqual(buildMockLibraryVocabulary(large, firstRequest));
    expect(Buffer.byteLength(JSON.stringify({ input: smallInput, tools: [], responseSchema: smallSeen[0]!.responseSchema }), 'utf8')).toBeLessThanOrEqual(LARGE_LIBRARY_CHAT_LIMITS.modelRequestBytes);
    expect(Buffer.byteLength(JSON.stringify({ input: smallInput, tools: [], responseSchema: smallSeen[0]!.responseSchema }), 'utf8')).toBe(9965);
    expect(createHash('sha256').update(JSON.stringify({ input: smallInput, tools: [], responseSchema: smallSeen[0]!.responseSchema })).digest('hex')).toBe('8da68cfc9d012d090fe6e498eae1c575ee51485e885aedae0f48869a92bdc5dd');
  });

  it('adds a full-catalog OR union over the long description and late series while keeping prior exclusions', async () => {
    const snapshot = createMockLargeLibrarySnapshot(1001);
    const first = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot, provider: providerFor({ kind: 'selection', selection: firstSelection, intent: null }), now });
    const state = (first.body as any).refinementState as RetrievalRefinementState;
    const second = await runMockLargeLibraryChat({ latestRequest: followupRequest, state, snapshot, provider: providerFor({ kind: 'selection', selection: followupSelection, intent: null }), now });
    const expectedAdditions = ['large_post_0010', 'large_post_0011', 'large_post_0999', 'large_post_1001'];
    const expected = [...state.selectedPostIds, ...expectedAdditions].sort((a, b) => snapshot.posts.findIndex(post => post.postId === a) - snapshot.posts.findIndex(post => post.postId === b));
    expect((second.body as any).selection.postIds).toEqual(expected);
    expect((second.body as any).refinementState.excludedPostIds).toEqual(state.excludedPostIds);
    expect((second.body as any).result.selector.any).toHaveLength(2);
    expect(expected).not.toContain('large_post_0740');
    expect(expected).not.toContain('large_post_1000');
  });

  it('refuses invented values, duplicate visible family names, stale state, and provider failures without changing state', async () => {
    const snapshot = createMockLargeLibrarySnapshot(1001);
    const initial = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot, provider: providerFor({ kind: 'selection', selection: firstSelection, intent: null }), now });
    const prior = (initial.body as any).refinementState as RetrievalRefinementState;
    const invented = { ...firstSelection, requestQuote: 'Select imaginary posts', selector: { base: 'catalog', all: [tag('invented', 'imaginary')], any: [], none: [] } };
    const rejected = await runMockLargeLibraryChat({ latestRequest: 'Select imaginary posts', state: prior, snapshot, provider: providerFor({ kind: 'selection', selection: invented, intent: null }), now });
    expect((rejected.body as any).status).toBe('clarification');
    expect((rejected.body as any).refinementState).toEqual(prior);

    const duplicate = structuredClone(snapshot);
    duplicate.posts[12]!.seriesId = 'series_duplicate';
    duplicate.posts[12]!.seriesTitle = 'City of Heroes';
    const ambiguous = { mode: 'replace', requestQuote: 'City of Heroes', selector: { base: 'catalog', all: [{ field: 'series_id', value: 'series_city_heroes', requestQuote: 'City of Heroes' }], any: [], none: [] } };
    const ambiguity = await runMockLargeLibraryChat({ latestRequest: 'Select City of Heroes', state: prior, snapshot: duplicate, provider: providerFor({ kind: 'selection', selection: ambiguous, intent: null }), now });
    expect((ambiguity.body as any).status).toBe('clarification');
    expect((ambiguity.body as any).selection.postIds).toEqual(prior.selectedPostIds);

    const seen: Array<Record<string, unknown>> = [];
    const invalidState = { ...prior, selectedPostIds: ['foreign_post'] };
    const stale = await runMockLargeLibraryChat({ latestRequest: followupRequest, state: invalidState, snapshot, provider: providerFor({ kind: 'selection', selection: followupSelection, intent: null }, seen), now });
    expect(stale.status).toBe(400);
    expect(seen).toHaveLength(0);

    const failed = await runMockLargeLibraryChat({ latestRequest: followupRequest, state: prior, snapshot, provider: providerFor({}, [], true), now });
    expect((failed.body as any).selection.postIds).toEqual(prior.selectedPostIds);
    expect((failed.body as any).refinementState).toEqual(prior);
  });

  it('refuses vocabulary overflow before dispatch and keeps the input free of state IDs', async () => {
    const snapshot = createMockLargeLibrarySnapshot(1001);
    snapshot.posts[0]!.tags.push(...Array.from({ length: 30 }, (_, index) => `long_vocab_tag_${index}_` + 'v'.repeat(300)));
    const seen: Array<Record<string, unknown>> = [];
    const result = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot, provider: providerFor({}, seen), now });
    expect((result.body as any).status).toBe('clarification');
    expect((result.body as any).message).toContain('selection metadata');
    expect(seen).toHaveLength(0);

    const byteOverflow = createMockLargeLibrarySnapshot(1001);
    byteOverflow.posts[0]!.tags.push(...Array.from({ length: 30 }, (_, index) => `long_tag_${index}_` + 'x'.repeat(300)));
    const byteSeen: Array<Record<string, unknown>> = [];
    const byteLimited = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: byteOverflow, provider: providerFor({}, byteSeen), now });
    expect((byteLimited.body as any).message).toContain('selection metadata');
    expect(byteSeen).toHaveLength(0);

    const promptOverflow = createMockLargeLibrarySnapshot(1001);
    promptOverflow.posts[0]!.tags.push(...Array.from({ length: 40 }, (_, index) => `wide_tag_${index}_` + 'x'.repeat(160)));
    const promptSeen: Array<Record<string, unknown>> = [];
    const promptLimited = await runMockLargeLibraryChat({ latestRequest: 'x'.repeat(3999), state: null, snapshot: promptOverflow, provider: providerFor({}, promptSeen), now });
    expect((promptLimited.body as any).message).toContain('input limit');
    expect(promptSeen).toHaveLength(0);

    const safe = createMockLargeLibrarySnapshot(1001);
    const chosenState: RetrievalRefinementState = { v: 2, scope: 'real_library_retrieval', catalogRevision: safe.catalogRevision, selectedPostIds: ['large_post_1001'], excludedPostIds: [] };
    const capture: Array<Record<string, unknown>> = [];
    await runMockLargeLibraryChat({ latestRequest: followupRequest, state: chosenState, snapshot: safe, provider: providerFor({ kind: 'clarification', question: 'Please clarify.' }, capture), now });
    const input = JSON.stringify(capture[0]!.input);
    expect(input).toContain('selected_count');
    expect(input).not.toContain('large_post_1001');
    expect(input).not.toContain('excluded_post_ids');
  });

  it('offers only grounded date candidates with London-relative values and enforces the same request schema', async () => {
    const candidates = buildMockDateCandidates('today yesterday this month last month 2026-10-18 2026-10 September 2026 2026-02-30 2026-10-180', { receivedAtUtc: now.toISOString(), localDate: '2026-10-18', timezone: 'Europe/London' });
    expect(candidates).toEqual([
      { value: 'today', requestQuote: 'today', ops: ['on'] },
      { value: 'yesterday', requestQuote: 'yesterday', ops: ['on'] },
      { value: 'this_month', requestQuote: 'this month', ops: ['in_month'] },
      { value: 'last_month', requestQuote: 'last month', ops: ['in_month'] },
      { value: '2026-10-18', requestQuote: '2026-10-18', ops: ['on', 'before', 'after', 'on_or_before', 'on_or_after'] },
      { value: '2026-10', requestQuote: '2026-10', ops: ['in_month'] },
      { value: '2026-09', requestQuote: 'September 2026', ops: ['in_month'] }
    ]);
    const londonBoundary = buildMockDateCandidates('today', { receivedAtUtc: '2026-06-30T23:30:00.000Z', localDate: '2026-07-01', timezone: 'Europe/London' });
    expect(londonBoundary).toEqual([{ value: 'today', requestQuote: 'today', ops: ['on'] }]);
    expect(resolveDatePredicate({ field: 'created_date', op: 'on', value: 'today', requestQuote: 'today' }, { receivedAtUtc: '2026-06-30T23:30:00.000Z', localDate: '2026-07-01', timezone: 'Europe/London' })?.resolvedValue).toBe('2026-07-01');
    const schema = createMockLargeLibraryResponseSchema(candidates);
    const valid = { result: { kind: 'selection', intent: null, selection: { mode: 'replace', requestQuote: firstRequest, selector: { base: 'catalog', all: [{ field: 'published_date', op: 'in_month', value: 'this_month', requestQuote: 'this month' }], any: [], none: [] } } } };
    const computedRelative = structuredClone(valid);
    computedRelative.result.selection.selector.all[0]!.value = '2026-10';
    expect(matchesSchema(valid, schema)).toBe(true);
    expect(matchesSchema(computedRelative, schema)).toBe(false);
    const invalidCalendar = structuredClone(valid);
    invalidCalendar.result.selection.selector.all = [{ field: 'published_date', op: 'on', value: '2026-02-30', requestQuote: '2026-02-30' }];
    const invalidCalendarSchema = createMockLargeLibraryResponseSchema(buildMockDateCandidates('2026-02-30', { receivedAtUtc: now.toISOString(), localDate: '2026-10-18', timezone: 'Europe/London' }));
    expect(matchesSchema(invalidCalendar, invalidCalendarSchema)).toBe(false);
  });

  it('rejects computed dates and candidate overflow without changing prior state, with bounded diagnostics', async () => {
    const snapshot = createMockLargeLibrarySnapshot(1001);
    const initial = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot, provider: providerFor({ kind: 'selection', selection: firstSelection, intent: null }), now });
    const prior = (initial.body as any).refinementState as RetrievalRefinementState;
    const badDate = { mode: 'replace', requestQuote: 'this month', selector: { base: 'selection', all: [{ field: 'published_date', op: 'in_month', value: 'this_month', requestQuote: 'this month' }, { field: 'published_date', op: 'in_month', value: '2026-10', requestQuote: 'this month' }], any: [], none: [] } };
    const seen: Array<Record<string, unknown>> = [];
    const rejected = await runMockLargeLibraryChat({ latestRequest: 'Narrow to posts published this month', state: prior, snapshot, provider: providerFor({ kind: 'selection', selection: badDate, intent: null }, seen), now });
    expect((rejected.body as any).selection.postIds).toEqual(prior.selectedPostIds);
    expect((rejected.body as any).refinementState).toEqual(prior);
    expect((rejected.body as any).diagnostic).toMatchObject({ stage: 'schema', code: 'response_schema_rejected', group: 'all', index: 1, dateTerm: { field: 'published_date', op: 'in_month', value: '2026-10', requestQuote: 'this month' } });
    expect(seen[0]!.responseSchema).not.toBe(REAL_LIBRARY_MODEL_RESPONSE_SCHEMA);

    const hugeDate = { ...badDate, selector: { ...badDate.selector, all: [badDate.selector.all[0], { ...badDate.selector.all[1], value: `\u0001${'x'.repeat(300)}` }] } };
    const huge = await runMockLargeLibraryChat({ latestRequest: 'Narrow to posts published this month', state: prior, snapshot, provider: providerFor({ kind: 'selection', selection: hugeDate, intent: null }), now });
    const dateTerm = (huge.body as any).diagnostic.dateTerm;
    expect(dateTerm.value.length).toBeLessThanOrEqual(120);
    expect(dateTerm.value).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);

    const tooMany = Array.from({ length: 17 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`).join(' ');
    const overflowSeen: Array<Record<string, unknown>> = [];
    const overflow = await runMockLargeLibraryChat({ latestRequest: `Find dates ${tooMany}`, state: prior, snapshot, provider: providerFor({}, overflowSeen), now });
    expect((overflow.body as any).status).toBe('clarification');
    expect(overflowSeen).toHaveLength(0);
  });

  it('creates and updates only a fresh proof report path, preserving an existing report byte-for-byte', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'relay-large-chat-report-'));
    const existingPath = join(directory, 'existing.json');
    const freshPath = join(directory, 'new.json');
    try {
      const original = '{ "keep": true }\n';
      await writeFile(existingPath, original, 'utf8');
      await expect(createLargeLibraryProofReportWriter(existingPath, { changed: true })).rejects.toThrow();
      expect(await readFile(existingPath, 'utf8')).toBe(original);
      const writer = await createLargeLibraryProofReportWriter(freshPath, { turn: 0, cases: [] });
      await writer({ turn: 1, diagnostic: { code: 'bounded' } });
      expect(JSON.parse(await readFile(freshPath, 'utf8'))).toEqual({ turn: 1, diagnostic: { code: 'bounded' } });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('offers the complete 112-entry wide vocabulary and preserves matching, exclusions, and late additions', async () => {
    const small = createMockLargeLibrarySnapshot(40, 'wide_vocab');
    const large = createMockLargeLibrarySnapshot(1001, 'wide_vocab');
    const compact = createMockLargeLibrarySnapshot(40);
    const smallVocabulary = buildMockLibraryVocabulary(small, firstRequest);
    const largeVocabulary = buildMockLibraryVocabulary(large, firstRequest);
    const entryCount = (vocab: typeof smallVocabulary) => vocab.tags.length + vocab.mentionedWorks.length + vocab.mentionedSeries.length + vocab.mentionedCollections.length + vocab.publishStates.length + vocab.mediaTypes.length + vocab.mediaRoles.length + vocab.processingStatuses.length + vocab.mentionedPosts.length;
    expect(entryCount(smallVocabulary)).toBe(107);
    expect(Buffer.byteLength(JSON.stringify(smallVocabulary), 'utf8')).toBeLessThan(LARGE_LIBRARY_CHAT_LIMITS.vocabularyBytes);
    expect(smallVocabulary).toEqual(largeVocabulary);
    expect(smallVocabulary.tags).toHaveLength(99);
    expect(smallVocabulary.tags.indexOf('coastal') + 1).toBe(98);
    expect(smallVocabulary.tags).toContain('aaa_095');
    expect(smallVocabulary.mentionedWorks).toEqual([]);
    expect(smallVocabulary.mentionedCollections).toEqual([]);
    expect(smallVocabulary.mentionedSeries).toEqual([]);
    expect(small.catalogRevision).not.toBe(compact.catalogRevision);

    const firstSmallCalls: Array<Record<string, unknown>> = [], firstLargeCalls: Array<Record<string, unknown>> = [];
    const selectedSmall = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: small, provider: providerFor({ kind: 'selection', selection: firstSelection, intent: null }, firstSmallCalls), now });
    const selectedLarge = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: large, provider: providerFor({ kind: 'selection', selection: firstSelection, intent: null }, firstLargeCalls), now });
    const expectedSmall = selected(small, post => post.tags.includes('coastal') && post.publishedAt?.startsWith('2026-10-') === true && post.media.some(media => media.mimeType?.startsWith('image/')) && !post.tags.includes('sketch'));
    const expectedLarge = selected(large, post => post.tags.includes('coastal') && post.publishedAt?.startsWith('2026-10-') === true && post.media.some(media => media.mimeType?.startsWith('image/')) && !post.tags.includes('sketch'));
    expect((selectedSmall.body as any).selection.postIds).toEqual(expectedSmall);
    expect((selectedLarge.body as any).selection.postIds).toEqual(expectedLarge);
    expect((selectedLarge.body as any).refinementState.excludedPostIds).toEqual(selected(large, post => post.tags.includes('sketch')));
    expect(firstSmallCalls).toHaveLength(1);
    expect(firstLargeCalls).toHaveLength(1);
    expect(firstSmallCalls[0]!.input).toEqual(firstLargeCalls[0]!.input);
    expect(firstSmallCalls[0]!.responseSchema).toEqual(firstLargeCalls[0]!.responseSchema);
    const userMessage = (firstLargeCalls[0]!.input as any[]).find(message => message.role === 'user');
    const suppliedVocabulary = JSON.parse(userMessage.content[0].text).vocabulary;
    expect(suppliedVocabulary).toEqual(largeVocabulary);
    expect(Buffer.byteLength(JSON.stringify({ input: firstLargeCalls[0]!.input, tools: [], responseSchema: firstLargeCalls[0]!.responseSchema }), 'utf8')).toBeLessThanOrEqual(LARGE_LIBRARY_CHAT_LIMITS.modelRequestBytes);

    const followCalls: Array<Record<string, unknown>> = [];
    const follow = await runMockLargeLibraryChat({ latestRequest: followupRequest, state: (selectedLarge.body as any).refinementState, snapshot: large, provider: providerFor({ kind: 'selection', selection: followupSelection, intent: null }, followCalls), now });
    const excluded = selected(large, post => post.tags.includes('sketch'));
    const followMatches = selected(large, post => post.seriesId === 'series_city_heroes' || post.descriptionText.toLocaleLowerCase('en-GB').includes('wonder woman'));
    const expectedFollow = [...new Set([...expectedLarge, ...followMatches.filter(id => !excluded.includes(id))])].sort((a, b) => large.posts.findIndex(post => post.postId === a) - large.posts.findIndex(post => post.postId === b));
    expect((follow.body as any).selection.postIds).toEqual(expectedFollow);
    expect((follow.body as any).refinementState.excludedPostIds).toEqual(excluded);
    expect(followCalls).toHaveLength(1);
    const followPayload = JSON.parse(((followCalls[0]!.input as any[]).find(message => message.role === 'user')).content[0].text);
    expect(followPayload.vocabulary.mentionedSeries).toEqual([{ id: 'series_city_heroes', title: 'City of Heroes' }]);
    expect(followPayload.vocabulary.mentionedWorks).toEqual([]);

    const tagRequest = 'Also add posts tagged aaa_095';
    const tagCalls: Array<Record<string, unknown>> = [];
    const tagged = await runMockLargeLibraryChat({ latestRequest: tagRequest, state: (selectedLarge.body as any).refinementState, snapshot: large, provider: providerFor({ kind: 'selection', intent: null, selection: { mode: 'add', requestQuote: tagRequest, selector: { base: 'catalog', all: [{ field: 'tag', value: 'aaa_095', requestQuote: 'aaa_095' }], any: [], none: [] } } }, tagCalls), now });
    expect((tagged.body as any).selection.postIds).toEqual([...new Set([...expectedLarge, ...selected(large, post => post.tags.includes('aaa_095'))])].sort((a, b) => large.posts.findIndex(post => post.postId === a) - large.posts.findIndex(post => post.postId === b)));
    expect((tagged.body as any).refinementState.excludedPostIds).toEqual(excluded);
    expect(tagCalls).toHaveLength(1);
  });

  it('clarifies duplicate visible family names and invented wide-vocabulary identifiers without changing selection', async () => {
    const snapshot = createMockLargeLibrarySnapshot(1001, 'wide_vocab');
    const first = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot, provider: providerFor({ kind: 'selection', selection: firstSelection, intent: null }), now });
    const prior = (first.body as any).refinementState;
    const duplicateRequest = 'Select Twin Lantern';
    const duplicate = await runMockLargeLibraryChat({ latestRequest: duplicateRequest, state: prior, snapshot, provider: providerFor({ kind: 'selection', intent: null, selection: { mode: 'replace', requestQuote: duplicateRequest, selector: { base: 'selection', all: [{ field: 'series_id', value: 'series_twin_a', requestQuote: 'Twin Lantern' }], any: [], none: [] } } }), now });
    expect((duplicate.body as any).status).toBe('clarification');
    expect((duplicate.body as any).refinementState).toEqual(prior);
    const inventedRequest = 'Select posts tagged unicorn';
    const invented = await runMockLargeLibraryChat({ latestRequest: inventedRequest, state: prior, snapshot, provider: providerFor({ kind: 'selection', intent: null, selection: { mode: 'replace', requestQuote: inventedRequest, selector: { base: 'selection', all: [{ field: 'tag', value: 'unicorn', requestQuote: 'unicorn' }], any: [], none: [] } } }), now });
    expect((invented.body as any).status).toBe('clarification');
    expect((invented.body as any).refinementState).toEqual(prior);
    expect(buildMockLibraryVocabulary(snapshot, duplicateRequest).mentionedSeries).toEqual([{ id: 'series_twin_a', title: 'Twin Lantern' }, { id: 'series_twin_b', title: 'Twin Lantern' }]);
  });

  it('grounds only request-mentioned gallery families across 100 and 500 posts', async () => {
    const small = createMockLargeLibrarySnapshot(100, 'gallery_allowance');
    const large = createMockLargeLibrarySnapshot(500, 'gallery_allowance');
    expect(new Set(large.posts.map(post => post.workId)).size).toBe(500);
    expect(new Set(large.posts.map(post => post.workTitle)).size).toBe(500);
    const smallVocabulary = buildMockLibraryVocabulary(small, firstRequest);
    const largeVocabulary = buildMockLibraryVocabulary(large, firstRequest);
    expect(smallVocabulary).toEqual(largeVocabulary);
    expect(smallVocabulary.mentionedWorks).toEqual([]);
    expect(smallVocabulary.mentionedSeries).toEqual([]);
    expect(smallVocabulary.mentionedCollections).toEqual([]);
    expect(smallVocabulary.tags.filter(tag => tag.startsWith('gallery_tag_'))).toHaveLength(80);
    const rawFamilies = (snapshot: ReturnType<typeof createMockLargeLibrarySnapshot>) => ({
      works: [...new Map(snapshot.posts.map(post => [post.workId, { id: post.workId, title: post.workTitle }])).values()],
      series: [...new Map(snapshot.posts.map(post => [post.seriesId, { id: post.seriesId, title: post.seriesTitle }])).values()],
      collections: [...new Map(snapshot.posts.flatMap(post => post.collections.map(item => [item.id, item]))).values()]
    });
    expect(Buffer.byteLength(JSON.stringify(rawFamilies(small)), 'utf8')).toBeGreaterThan(LARGE_LIBRARY_CHAT_LIMITS.vocabularyBytes);
    expect(Buffer.byteLength(JSON.stringify(rawFamilies(large)), 'utf8')).toBeGreaterThan(LARGE_LIBRARY_CHAT_LIMITS.vocabularyBytes);
    expect(Buffer.byteLength(JSON.stringify(smallVocabulary), 'utf8')).toBeLessThan(LARGE_LIBRARY_CHAT_LIMITS.vocabularyBytes);

    const initialSmall = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: small, provider: providerFor({ kind: 'selection', intent: null, selection: firstSelection }), now });
    const initialLarge = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: large, provider: providerFor({ kind: 'selection', intent: null, selection: firstSelection }), now });
    const oracle = (snapshot: typeof large) => snapshot.posts.filter(post => post.tags.includes('coastal') && post.publishedAt?.startsWith('2026-10-') === true && post.media.some(media => media.mimeType?.startsWith('image/')) && !post.tags.includes('sketch')).map(post => post.postId);
    const excluded = large.posts.filter(post => post.tags.includes('sketch')).map(post => post.postId);
    expect((initialSmall.body as any).selection.postIds).toEqual(oracle(small));
    expect((initialLarge.body as any).selection.postIds).toEqual(oracle(large));
    expect((initialLarge.body as any).refinementState.excludedPostIds).toEqual(excluded);
    const follow = await runMockLargeLibraryChat({ latestRequest: followupRequest, state: (initialLarge.body as any).refinementState, snapshot: large, provider: providerFor({ kind: 'selection', intent: null, selection: followupSelection }), now });
    const additions = large.posts.filter(post => post.seriesId === 'series_city_heroes' || post.descriptionText.toLocaleLowerCase('en-GB').includes('wonder woman')).map(post => post.postId).filter(id => !excluded.includes(id));
    const expectedFollow = [...new Set([...oracle(large), ...additions])].sort((left, right) => large.posts.findIndex(post => post.postId === left) - large.posts.findIndex(post => post.postId === right));
    expect((follow.body as any).selection.postIds).toEqual(expectedFollow);
    expect((follow.body as any).refinementState.excludedPostIds).toEqual(excluded);
    expect(expectedFollow).not.toContain('gallery_100');
    expect(expectedFollow).not.toContain('gallery_490');

    const titleRequest = 'Select Synthetic Gallery Work 0500 — moonlight study';
    const lastWork = large.posts[499]!;
    expect(buildMockLibraryVocabulary(large, titleRequest).mentionedWorks).toEqual([{ id: lastWork.workId, title: lastWork.workTitle }]);
    const titleSelection = { mode: 'replace', requestQuote: titleRequest, selector: { base: 'catalog', all: [{ field: 'work_id', value: lastWork.workId, requestQuote: lastWork.workTitle }], any: [], none: [] } };
    const selectedTitle = await runMockLargeLibraryChat({ latestRequest: titleRequest, state: null, snapshot: large, provider: providerFor({ kind: 'selection', intent: null, selection: titleSelection }), now });
    expect((selectedTitle.body as any).selection.postIds).toEqual([lastWork.postId]);

    const idRequest = `Select work ${lastWork.workId}`;
    expect(buildMockLibraryVocabulary(large, idRequest).mentionedWorks).toEqual([{ id: lastWork.workId, title: lastWork.workTitle }]);
    const idSelection = { mode: 'replace', requestQuote: idRequest, selector: { base: 'catalog', all: [{ field: 'work_id', value: lastWork.workId, requestQuote: lastWork.workId }], any: [], none: [] } };
    const selectedId = await runMockLargeLibraryChat({ latestRequest: idRequest, state: null, snapshot: large, provider: providerFor({ kind: 'selection', intent: null, selection: idSelection }), now });
    expect((selectedId.body as any).selection.postIds).toEqual([lastWork.postId]);

    const seriesRequest = `Select ${lastWork.seriesTitle}`;
    expect(buildMockLibraryVocabulary(large, seriesRequest).mentionedSeries).toContainEqual({ id: lastWork.seriesId, title: lastWork.seriesTitle });
    const seriesSelection = { mode: 'replace', requestQuote: seriesRequest, selector: { base: 'catalog', all: [{ field: 'series_id', value: lastWork.seriesId, requestQuote: lastWork.seriesTitle! }], any: [], none: [] } };
    const selectedSeries = await runMockLargeLibraryChat({ latestRequest: seriesRequest, state: null, snapshot: large, provider: providerFor({ kind: 'selection', intent: null, selection: seriesSelection }), now });
    expect((selectedSeries.body as any).selection.postIds).toEqual(large.posts.filter(post => post.seriesId === lastWork.seriesId).map(post => post.postId));
    const collectionRequest = `Select ${lastWork.collections[0]!.title}`;
    expect(buildMockLibraryVocabulary(large, collectionRequest).mentionedCollections).toContainEqual(lastWork.collections[0]);
    const collectionSelection = { mode: 'replace', requestQuote: collectionRequest, selector: { base: 'catalog', all: [{ field: 'collection_id', value: lastWork.collections[0]!.id, requestQuote: lastWork.collections[0]!.title }], any: [], none: [] } };
    const selectedCollection = await runMockLargeLibraryChat({ latestRequest: collectionRequest, state: null, snapshot: large, provider: providerFor({ kind: 'selection', intent: null, selection: collectionSelection }), now });
    expect((selectedCollection.body as any).selection.postIds).toEqual(large.posts.filter(post => post.collections.some(collection => collection.id === lastWork.collections[0]!.id)).map(post => post.postId));
  });

  it('clarifies duplicate, partial, and prefix-colliding family names without changing state', async () => {
    const snapshot = createMockLargeLibrarySnapshot(100, 'gallery_allowance');
    const twinRequest = 'Select TWIN LANTERN';
    const twins = buildMockLibraryVocabulary(snapshot, twinRequest).mentionedSeries;
    expect(twins).toEqual([{ id: 'gallery_series_twin_a', title: 'Twin Lantern' }, { id: 'gallery_series_twin_b', title: 'twin lantern' }]);
    const state: RetrievalRefinementState = { v: 2, scope: 'real_library_retrieval', catalogRevision: snapshot.catalogRevision, selectedPostIds: [snapshot.posts[0]!.postId], excludedPostIds: [] };
    const duplicate = await runMockLargeLibraryChat({ latestRequest: twinRequest, state, snapshot, provider: providerFor({ kind: 'selection', intent: null, selection: { mode: 'replace', requestQuote: twinRequest, selector: { base: 'selection', all: [{ field: 'series_id', value: twins[0]!.id, requestQuote: 'TWIN LANTERN' }], any: [], none: [] } } }), now });
    expect((duplicate.body as any).status).toBe('clarification');
    expect((duplicate.body as any).refinementState).toEqual(state);

    const prefixSnapshot = createMockLargeLibrarySnapshot(100, 'gallery_allowance');
    prefixSnapshot.posts[0]!.workTitle = 'Synthetic Prefix Work';
    prefixSnapshot.posts[1]!.workTitle = 'Synthetic Prefix Work Extended';
    const prefixRequest = 'Select Synthetic Prefix Work Extended';
    const prefixPairs = buildMockLibraryVocabulary(prefixSnapshot, prefixRequest).mentionedWorks;
    expect(prefixPairs).toHaveLength(2);
    const prefixSelection = { mode: 'replace', requestQuote: prefixRequest, selector: { base: 'catalog', all: [{ field: 'work_id', value: prefixPairs[0]!.id, requestQuote: 'Synthetic Prefix Work Extended' }], any: [], none: [] } };
    const prefix = await runMockLargeLibraryChat({ latestRequest: prefixRequest, state: null, snapshot: prefixSnapshot, provider: providerFor({ kind: 'selection', intent: null, selection: prefixSelection }), now });
    expect((prefix.body as any).status).toBe('clarification');
    expect(buildMockLibraryVocabulary(snapshot, 'Select Synthetic Gallery Work 050').mentionedWorks).toEqual([]);
  });
});
