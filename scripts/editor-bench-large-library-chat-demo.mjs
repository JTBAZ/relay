#!/usr/bin/env node
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { createMockLargeLibrarySnapshot } from '../dist/src/editor-bench/large-library-chat-fixture.js';
import { buildMockLibraryVocabulary, LARGE_LIBRARY_CHAT_LIMITS, runMockLargeLibraryChat } from '../dist/src/editor-bench/large-library-chat.js';
import { createLargeLibraryProofReportWriter } from '../dist/src/editor-bench/large-library-chat-report.js';
import { createEditorBenchRuntime } from '../dist/src/editor-bench/runtime.js';

const firstRequest = 'Select images tagged for the coast and published this month, excluding sketches.';
const followupRequest = 'Also add the full City of Heroes series and every piece whose description mentions Wonder Woman.';
const now = new Date('2026-10-18T12:00:00.000Z');
const liveReportPath = join(resolve(process.cwd()), 'outputs', 'editor-bench-large-library-chat-date-recheck-blc02.json');
const wideVocabReportPath = join(resolve(process.cwd()), 'outputs', 'editor-bench-large-library-chat-wide-vocab-blc03.json');
const allowanceReportPath = join(resolve(process.cwd()), 'outputs', 'editor-bench-gallery-allowance-blc04.json');
const firstSelection = {
  mode: 'replace', requestQuote: firstRequest,
  selector: { base: 'catalog', all: [
    { field: 'media_type', value: 'image', requestQuote: 'images' },
    { field: 'tag', value: 'coastal', requestQuote: 'coast' },
    { field: 'published_date', op: 'in_month', value: 'this_month', requestQuote: 'this month' }
  ], any: [], none: [{ field: 'tag', value: 'sketch', requestQuote: 'sketches' }] }
};
const followupSelection = {
  mode: 'add', requestQuote: followupRequest,
  selector: { base: 'catalog', all: [], any: [
    { field: 'series_id', value: 'series_city_heroes', requestQuote: 'full City of Heroes series' },
    { field: 'description', value: 'Wonder Woman', requestQuote: 'description mentions Wonder Woman' }
  ], none: [] }
};
const outcome = selection => ({ result: { kind: 'selection', selection, intent: null } });
const cannedProvider = selection => ({ async respond() { return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(outcome(selection)) }] }] }; } });
function oracle(post) { return post.tags.includes('coastal') && post.publishedAt?.startsWith('2026-10-') === true && post.media.some(media => media.mimeType?.startsWith('image/')) && !post.tags.includes('sketch'); }
function vocabularyEntryCount(vocab) { return Object.values(vocab).reduce((sum, values) => sum + values.length, 0); }
function fullFamilyCatalog(snapshot) {
  const distinct = values => [...new Map(values.filter(item => item.id && item.title).map(item => [item.id, item])).values()];
  return {
    works: distinct(snapshot.posts.map(post => ({ id: post.workId, title: post.workTitle }))),
    series: distinct(snapshot.posts.map(post => ({ id: post.seriesId, title: post.seriesTitle }))),
    collections: distinct(snapshot.posts.flatMap(post => post.collections.map(item => ({ id: item.id, title: item.title }))))
  };
}
function vocabularyCategoryCounts(vocab) { return Object.fromEntries(Object.entries(vocab).map(([key, values]) => [key, values.length])); }
function printResult(mode, result) {
  if (!('scope' in result.body)) throw new Error(result.body.message);
  console.log(JSON.stringify({ mode, status: result.body.status, selectedPostIds: result.body.selection.postIds, excludedPostIds: result.body.refinementState.excludedPostIds, usage: result.body.usage ?? null }, null, 2));
}

async function main() {
  const mode = process.argv[2];
  if (!mode) {
    const snapshot = createMockLargeLibrarySnapshot(1001);
    console.log('OFFLINE CANNED EXAMPLE: this fixed response does not parse arbitrary natural-language requests.');
    const result = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot, provider: cannedProvider(firstSelection), now });
    if (!('scope' in result.body)) throw new Error(result.body.message);
    const expectedSelectedPostIds = snapshot.posts.filter(oracle).map(post => post.postId);
    const expectedExcludedPostIds = snapshot.posts.filter(post => post.tags.includes('sketch')).map(post => post.postId);
    console.log(JSON.stringify({ mode: 'offline-canned', expectedSelectedPostIds, actualSelectedPostIds: result.body.selection.postIds, expectedExcludedPostIds, actualExcludedPostIds: result.body.refinementState.excludedPostIds }, null, 2));
    return;
  }
  if (!['--live', '--interactive', '--live-proof', '--preflight', '--wide-vocab-preflight', '--wide-vocab-proof', '--allowance-preflight', '--allowance-proof'].includes(mode)) throw new Error('Use no flags for the canned offline example, --live "request", --interactive, --preflight, --live-proof, --wide-vocab-preflight, --wide-vocab-proof, --allowance-preflight, or --allowance-proof.');
  if (['--preflight', '--wide-vocab-preflight', '--allowance-preflight'].includes(mode)) {
    const profile = mode === '--wide-vocab-preflight' ? 'wide_vocab' : mode === '--allowance-preflight' ? 'gallery_allowance' : 'compact';
    await preflightProof(profile);
    return;
  }
  const runtime = await createEditorBenchRuntime({ repoRoot: resolve(process.cwd()), env: process.env });
  if (!runtime.status.enabled || !runtime.editorProvider) throw new Error(`Live runtime unavailable (${runtime.status.reason ?? 'unknown'}).`);
  if (mode === '--live') {
    const liveRequest = process.argv.slice(3).join(' ').trim();
    if (!liveRequest) throw new Error('Pass a request after --live.');
    const result = await runMockLargeLibraryChat({ latestRequest: liveRequest, state: null, snapshot: createMockLargeLibrarySnapshot(1001), provider: runtime.editorProvider, now });
    printResult('explicit-live', result);
    return;
  }
  if (mode === '--interactive') {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const snapshot = createMockLargeLibrarySnapshot(1001);
    let state = null;
    try {
      for (;;) {
        const latestRequest = (await rl.question('Selection request (blank to quit): ')).trim();
        if (!latestRequest) break;
        const result = await runMockLargeLibraryChat({ latestRequest, state, snapshot, provider: runtime.editorProvider, now });
        if ('scope' in result.body) state = result.body.refinementState;
        printResult('interactive-live', result);
      }
    } finally { rl.close(); }
    return;
  }
  const profile = mode === '--wide-vocab-proof' ? 'wide_vocab' : mode === '--allowance-proof' ? 'gallery_allowance' : 'compact';
  await liveProof(runtime.editorProvider, profile);
}

async function liveProof(provider, profile = 'compact') {
  const isWide = profile === 'wide_vocab';
  const isAllowance = profile === 'gallery_allowance';
  const smallCount = isAllowance ? 100 : 40, largeCount = isAllowance ? 500 : 1001;
  const reportPath = isAllowance ? allowanceReportPath : isWide ? wideVocabReportPath : liveReportPath;
  // Fixed synthetic requests and their complete-snapshot oracle are checked before any paid call.
  const small = createMockLargeLibrarySnapshot(smallCount, profile), large = createMockLargeLibrarySnapshot(largeCount, profile);
  const expected40 = small.posts.filter(oracle).map(post => post.postId);
  const expected1001 = large.posts.filter(oracle).map(post => post.postId);
  const expectedExcluded = large.posts.filter(post => post.tags.includes('sketch')).map(post => post.postId);
  const followupMatches = large.posts.filter(post => post.seriesId === 'series_city_heroes' || post.descriptionText.toLocaleLowerCase('en-GB').includes('wonder woman')).map(post => post.postId);
  const expectedFinal = [...new Set([...expected1001, ...followupMatches.filter(id => !expectedExcluded.includes(id))])].sort((a, b) => large.posts.findIndex(post => post.postId === a) - large.posts.findIndex(post => post.postId === b));
  const smallVocabulary = buildMockLibraryVocabulary(small, firstRequest);
  const largeVocabulary = buildMockLibraryVocabulary(large, firstRequest);
  const vocabularyEntries = vocabularyEntryCount(smallVocabulary);
  const vocabularyBytes = Buffer.byteLength(JSON.stringify(smallVocabulary), 'utf8');
  const rawFamilyBytes = [small, large].map(snapshot => Buffer.byteLength(JSON.stringify(fullFamilyCatalog(snapshot)), 'utf8'));
  if (JSON.stringify(smallVocabulary) !== JSON.stringify(largeVocabulary)) throw new Error('Request-grounded metadata changed with snapshot size; no live calls made.');
  if (isWide && (smallVocabulary.tags.filter(tag => tag.startsWith('aaa_')).length !== 96 || smallVocabulary.tags.indexOf('coastal') + 1 !== 98 || smallVocabulary.mentionedWorks.length + smallVocabulary.mentionedSeries.length + smallVocabulary.mentionedCollections.length !== 0)) throw new Error('Wide vocabulary profile was not complete or compact; no live calls made.');
  if (isAllowance && (smallVocabulary.mentionedWorks.length + smallVocabulary.mentionedSeries.length + smallVocabulary.mentionedCollections.length !== 0 || rawFamilyBytes.some(bytes => bytes <= 8 * 1024))) throw new Error('Allowance family filtering did not keep the ordinary request compact; no live calls made.');
  const smallCaptured = [], largeCaptured = [], followCaptured = [];
  const capture = (selection, rows) => ({ async respond(request) { rows.push(request); return cannedProvider(selection).respond(request); } });
  const pre40 = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: small, provider: capture(firstSelection, smallCaptured), now });
  const pre1001 = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: large, provider: capture(firstSelection, largeCaptured), now });
  const preFollow = await runMockLargeLibraryChat({ latestRequest: followupRequest, state: pre1001.body.refinementState, snapshot: large, provider: capture(followupSelection, followCaptured), now });
  const ids = result => 'scope' in result.body ? result.body.selection.postIds : null;
  const excluded = result => 'scope' in result.body ? result.body.refinementState.excludedPostIds : null;
  if (JSON.stringify(ids(pre40)) !== JSON.stringify(expected40) || JSON.stringify(ids(pre1001)) !== JSON.stringify(expected1001) || JSON.stringify(excluded(pre1001)) !== JSON.stringify(expectedExcluded) || JSON.stringify(ids(preFollow)) !== JSON.stringify(expectedFinal) || JSON.stringify(smallCaptured[0]?.input) !== JSON.stringify(largeCaptured[0]?.input) || JSON.stringify(smallCaptured[0]?.responseSchema) !== JSON.stringify(largeCaptured[0]?.responseSchema)) throw new Error('Fixed no-cost proof preflight did not match the full-catalog oracle; no live calls made.');
  const preflightBytes = [...smallCaptured, ...largeCaptured, ...followCaptured].map(request => Buffer.byteLength(JSON.stringify({ input: request.input, tools: request.tools, responseSchema: request.responseSchema }), 'utf8'));
  if (preflightBytes.some(bytes => bytes > 16 * 1024)) throw new Error('The fixed proof prompt exceeds the input limit; no live calls made.');

  const capUsd = 0.03, maxCalls = 3;
  const callReservation = ((16 * 1024 + 2048) * 0.20 + 3000 * 1.20) / 1_000_000;
  let reservedUsd = 0, calls = 0;
  const guarded = { async respond(args) {
    if (calls >= maxCalls || reservedUsd + callReservation > capUsd) throw new Error('Large-library proof reservation cap reached.');
    calls++; reservedUsd += callReservation;
    return provider.respond(args);
  } };
  const report = { mode: isAllowance ? 'gallery-allowance-live-proof' : isWide ? 'wide-vocab-live-proof' : 'live-proof', capUsd, conservativeReservationPerCall: Number(callReservation.toFixed(8)), conservativeReservedUsd: 0, calls: 0, vocabularyEntries, vocabularyCategoryCounts: vocabularyCategoryCounts(smallVocabulary), vocabularyBytes, rawFamilyBytes, preflightBytes, cases: [] };
  // Exclusive report creation happens before the first provider call; existing evidence is never overwritten.
  const writeReport = await createLargeLibraryProofReportWriter(reportPath, report);
  const hasTerms = (selector, group, expected) => selector && expected.every(wanted => selector[group]?.some(actual => Object.entries(wanted).every(([key, value]) => actual[key] === value)));
  const firstCriteria = result => 'scope' in result.body && hasTerms(result.body.result?.selector, 'all', [{ field: 'media_type', value: 'image' }, { field: 'tag', value: 'coastal' }, { field: 'published_date', op: 'in_month', value: 'this_month' }]) && hasTerms(result.body.result?.selector, 'none', [{ field: 'tag', value: 'sketch' }]);
  const followCriteria = result => 'scope' in result.body && result.body.result?.selector?.any?.length === 2 && hasTerms(result.body.result.selector, 'any', [{ field: 'series_id', value: 'series_city_heroes' }, { field: 'description', value: 'Wonder Woman' }]);
  const record = async (caseId, result, expectedSelected, expectedExcludedIds, selectorCheck) => {
    const row = { caseId, responseStatus: result.body.status ?? 'error', message: result.body.message ?? result.body.error ?? null,
      actualSelector: 'scope' in result.body ? result.body.result?.selector ?? null : null,
      actualSelectedPostIds: ids(result) ?? [], actualExcludedPostIds: excluded(result) ?? [], diagnostic: 'scope' in result.body ? result.body.diagnostic ?? null : null, expectedSelectedPostIds: expectedSelected,
      expectedExcludedPostIds: expectedExcludedIds, selectorCriteriaPassed: selectorCheck(result), usage: 'scope' in result.body ? result.body.usage ?? null : null };
    report.calls++;
    report.conservativeReservedUsd = Number(reservedUsd.toFixed(8));
    report.cases.push(row);
    await writeReport(report);
    const usage = row.usage;
    if (!('scope' in result.body) || row.responseStatus !== 'selected' || !row.selectorCriteriaPassed || JSON.stringify(row.actualSelectedPostIds) !== JSON.stringify(expectedSelected) || JSON.stringify(row.actualExcludedPostIds) !== JSON.stringify(expectedExcludedIds) || !usage?.known || !Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens) || !Number.isFinite(usage.costUsd)) throw new Error(`${caseId} failed semantic, oracle, or known-usage checks; report saved to ${reportPath}.`);
    if (isWide || isAllowance) {
      const baseline = caseId.startsWith('followup_') ? { input: 1358, output: 102 } : { input: 1727, output: 129 };
      const normalized = (usage.inputTokens * 0.20 + usage.outputTokens * 1.20) / 1_000_000;
      const baselineCost = (baseline.input * 0.20 + baseline.output * 1.20) / 1_000_000;
      if (usage.inputTokens > baseline.input * 2 || normalized > baselineCost * 1.5) throw new Error(`${caseId} exceeded the metadata input or normalized-cost gate; report saved to ${reportPath}.`);
      row.normalizedUncachedCostUsd = Number(normalized.toFixed(10));
      report.cases[report.cases.length - 1] = row;
      await writeReport(report);
    }
    return row;
  };
  const firstSmall = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: small, provider: guarded, now });
  const rowSmall = await record(`initial_${smallCount}`, firstSmall, expected40, small.posts.filter(post => post.tags.includes('sketch')).map(post => post.postId), firstCriteria);
  const firstLarge = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: large, provider: guarded, now });
  const rowLarge = await record(`initial_${largeCount}`, firstLarge, expected1001, expectedExcluded, firstCriteria);
  const tokenDelta = Math.abs(rowSmall.usage.inputTokens - rowLarge.usage.inputTokens);
  if (tokenDelta > Math.max(100, 0.05 * Math.max(rowSmall.usage.inputTokens, rowLarge.usage.inputTokens))) throw new Error(`Initial input-token difference ${tokenDelta} exceeds the allowed 5%/100-token margin; follow-up stopped. Report saved to ${reportPath}.`);
  const follow = await runMockLargeLibraryChat({ latestRequest: followupRequest, state: firstLarge.body.refinementState, snapshot: large, provider: guarded, now });
  const rowFollow = await record(`followup_${largeCount}`, follow, expectedFinal, expectedExcluded, followCriteria);
  if (reservedUsd > capUsd) throw new Error(`Conservative reservation exceeded cap; report saved to ${reportPath}.`);
  console.log(JSON.stringify({ reportPath, calls, conservativeReservedUsd: Number(reservedUsd.toFixed(8)), capUsd, initialInputTokenDelta: tokenDelta, usage: [rowSmall.usage, rowLarge.usage, rowFollow.usage] }, null, 2));
}

async function preflightProof(profile = 'compact') {
  const isWide = profile === 'wide_vocab';
  const isAllowance = profile === 'gallery_allowance';
  const smallCount = isAllowance ? 100 : 40, largeCount = isAllowance ? 500 : 1001;
  const small = createMockLargeLibrarySnapshot(smallCount, profile), large = createMockLargeLibrarySnapshot(largeCount, profile);
  const expectedSmall = small.posts.filter(oracle).map(post => post.postId), expectedLarge = large.posts.filter(oracle).map(post => post.postId);
  const expectedExcluded = large.posts.filter(post => post.tags.includes('sketch')).map(post => post.postId);
  const followupMatches = large.posts.filter(post => post.seriesId === 'series_city_heroes' || post.descriptionText.toLocaleLowerCase('en-GB').includes('wonder woman')).map(post => post.postId);
  const expectedFinal = [...new Set([...expectedLarge, ...followupMatches.filter(id => !expectedExcluded.includes(id))])].sort((a, b) => large.posts.findIndex(post => post.postId === a) - large.posts.findIndex(post => post.postId === b));
  const captured = [];
  const capture = selection => ({ async respond(request) { captured.push(request); return cannedProvider(selection).respond(request); } });
  const a = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: small, provider: capture(firstSelection), now });
  const b = await runMockLargeLibraryChat({ latestRequest: firstRequest, state: null, snapshot: large, provider: capture(firstSelection), now });
  const follow = await runMockLargeLibraryChat({ latestRequest: followupRequest, state: b.body.refinementState, snapshot: large, provider: capture(followupSelection), now });
  const bytes = captured.map(request => Buffer.byteLength(JSON.stringify({ input: request.input, tools: request.tools, responseSchema: request.responseSchema }), 'utf8'));
  if (JSON.stringify(a.body.selection.postIds) !== JSON.stringify(expectedSmall) || JSON.stringify(b.body.selection.postIds) !== JSON.stringify(expectedLarge) || JSON.stringify(b.body.refinementState.excludedPostIds) !== JSON.stringify(expectedExcluded) || JSON.stringify(follow.body.selection.postIds) !== JSON.stringify(expectedFinal) || JSON.stringify(follow.body.refinementState.excludedPostIds) !== JSON.stringify(expectedExcluded) || JSON.stringify(captured[0].input) !== JSON.stringify(captured[1].input) || JSON.stringify(captured[0].responseSchema) !== JSON.stringify(captured[1].responseSchema) || bytes.some(value => value > LARGE_LIBRARY_CHAT_LIMITS.modelRequestBytes)) throw new Error('No-cost preflight failed.');
  const smallVocabulary = buildMockLibraryVocabulary(small, firstRequest), largeVocabulary = buildMockLibraryVocabulary(large, firstRequest);
  if (JSON.stringify(smallVocabulary) !== JSON.stringify(largeVocabulary)) throw new Error('Complete vocabulary changed with snapshot size.');
  const vocabularyEntries = vocabularyEntryCount(smallVocabulary);
  const vocabularyBytes = Buffer.byteLength(JSON.stringify(smallVocabulary), 'utf8');
  const rawFamilyBytes = [small, large].map(snapshot => Buffer.byteLength(JSON.stringify(fullFamilyCatalog(snapshot)), 'utf8'));
  const followPayload = JSON.parse(captured[2].input.find(message => message.role === 'user').content[0].text);
  if (isWide && (smallVocabulary.tags.filter(tag => tag.startsWith('aaa_')).length !== 96 || smallVocabulary.tags.indexOf('coastal') + 1 !== 98)) throw new Error('Wide vocabulary profile did not meet its unchanged facet preflight.');
  if (isAllowance && (smallVocabulary.mentionedWorks.length + smallVocabulary.mentionedSeries.length + smallVocabulary.mentionedCollections.length !== 0 || rawFamilyBytes.some(value => value <= LARGE_LIBRARY_CHAT_LIMITS.vocabularyBytes) || followPayload.vocabulary.mentionedSeries.length !== 1 || followPayload.vocabulary.mentionedSeries[0].id !== 'series_city_heroes')) throw new Error('Allowance family filtering did not meet its mention-only preflight.');
  console.log(JSON.stringify({ mode: isAllowance ? 'gallery-allowance-no-cost-preflight' : isWide ? 'wide-vocab-no-cost-preflight' : 'no-cost-preflight', expectedSmall, actualSmall: a.body.selection.postIds, expectedLarge, actualLarge: b.body.selection.postIds, expectedFinal, actualFinal: follow.body.selection.postIds, expectedExcluded, actualExcluded: follow.body.refinementState.excludedPostIds, identicalModelInput: true, vocabularyEntries, vocabularyCategoryCounts: vocabularyCategoryCounts(smallVocabulary), vocabularyBytes, rawFamilyBytes, coastalTagPosition: smallVocabulary.tags.indexOf('coastal') + 1, familyOptionsForFollowup: followPayload.vocabulary.mentionedSeries, byteLimits: LARGE_LIBRARY_CHAT_LIMITS, serializedRequestBytes: bytes, conservativeReservationPerCall: Number((((16 * 1024 + 2048) * 0.20 + 3000 * 1.20) / 1_000_000).toFixed(8)), totalReservationForThreeCalls: Number((3 * (((16 * 1024 + 2048) * 0.20 + 3000 * 1.20) / 1_000_000)).toFixed(8)) }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Demo failed.'); process.exitCode = 1; });
