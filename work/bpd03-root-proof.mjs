// One-off mock HTTP acceptance proof. --live permits at most three ledger-backed calls.
import assert from 'node:assert/strict';
import { readFile, open } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { registerBenchScheduleRoutes } from '../dist/src/editor-bench/schedule-routes.js';
import { createBenchDistributionVariantAdapter, loadBenchVariantSource } from '../dist/src/editor-bench/distribution-variant-adapter.js';
import { createEditorBenchRuntime } from '../dist/src/editor-bench/runtime.js';
import { createBenchFixture, BENCH_IDS } from '../dist/src/editor-bench/fixtures.js';
import { validateBenchVariantEditDecision } from '../dist/src/editor-bench/variant-chat.js';

const live = process.argv.includes('--live');
const correction = process.argv.includes('--correction');
const path = correction
  ? (live ? 'outputs/editor-bench-posting-variant-chat-recheck-bpd03.json' : 'outputs/editor-bench-posting-variant-chat-correction-preflight-bpd03.json')
  : (live ? 'outputs/editor-bench-posting-variant-chat-live-bpd03.json' : 'outputs/editor-bench-posting-variant-chat-preflight-bpd03.json');
const file = await open(path, 'wx'); // Reserve evidence before any provider use; never overwrite earlier proof.
const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const ledgerPath = '.relay-data/gallery-editor-budget.json';
const initialLedger = JSON.parse(await readFile(ledgerPath, 'utf8'));
const earlierFailure = correction ? JSON.parse(await readFile('outputs/editor-bench-posting-variant-chat-live-bpd03.json', 'utf8')) : null;
if (correction) { assert.equal(earlierFailure.ledger.callsAttempted, 1); assert.equal(earlierFailure.passed, false); }
const fixtureHash = sha(createBenchFixture());
const report = { ticket: 'BPD-03', mode: live ? 'live_mock_http' : 'canned_mock_http', date: '2026-10-18', passed: false, cases: [], calls: [], limitations: ['Mock ephemeral API state only', 'Frontend execution deferred', 'No publishing or database operation'] };
const adapter = createBenchDistributionVariantAdapter();
let activeCase;
let calls = 0;
const output = result => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }] });
try {
  const runtime = live ? await createEditorBenchRuntime({ repoRoot: process.cwd(), env: { ...process.env, NODE_ENV: 'development', RELAY_EDITOR_BENCH_LIVE: '1' } }) : null;
  if (live) { assert(runtime.status.enabled); assert(runtime.editorProvider); assert(runtime.status.remainingUsd >= 0.03); }
  const provider = { async respond(payload) {
    assert(++calls <= (correction ? 2 : 3), 'Proof call limit');
    const data = JSON.parse(payload.input[1].content[0].text);
    assert.equal(payload.tools.length, 0);
    assert(Buffer.byteLength(JSON.stringify({ input: payload.input, tools: payload.tools, responseSchema: payload.responseSchema })) <= 16384);
    assert(Buffer.byteLength(JSON.stringify(data.candidates)) <= 8192);
    assert.equal(data.candidates.length, 2);
    assert(data.candidates.every(c => !('description' in c) && !('revisions' in c) && !('media' in c)));
    const candidate = data.candidates.find(c => c.destination === activeCase.destination);
    assert.equal(candidate.currentRevision, activeCase.revision);
    assert.equal(candidate.currentText, activeCase.before);
    const result = live ? await runtime.editorProvider.respond(payload) : output({ decision: 'edit', candidateHandle: candidate.handle, targetReferenceQuote: activeCase.target, replacementQuote: `"${activeCase.after}"`, newText: activeCase.after, requestQuote: data.latest_user_request });
    if (live) assert(result.usage && result.usage.calls === 1 && Number.isFinite(result.usage.costUsd));
    let modelDecision = null;
    try { modelDecision = JSON.parse(result.output.filter(x => x.type === 'message').flatMap(x => x.content ?? []).filter(x => x.type === 'output_text').map(x => x.text).join('')).result; } catch { /* recorded as invalid without raw output */ }
    report.calls.push({ inputSha256: sha({ input: payload.input, tools: payload.tools, responseSchema: payload.responseSchema }), candidateCount: data.candidates.length, candidateBytes: Buffer.byteLength(JSON.stringify(data.candidates)), inputBytes: Buffer.byteLength(JSON.stringify({ input: payload.input, tools: payload.tools, responseSchema: payload.responseSchema })), providerDecision: ['edit','clarification'].includes(modelDecision?.decision) ? modelDecision.decision : 'invalid', decisionGroundingValid: !!validateBenchVariantEditDecision(modelDecision, data.latest_user_request), targetQuoteSha256: typeof modelDecision?.targetReferenceQuote === 'string' ? sha(modelDecision.targetReferenceQuote) : null, replacementSha256: typeof modelDecision?.newText === 'string' ? sha(modelDecision.newText) : null, usage: result.usage ?? null });
    return result;
  } };
  const app = express(); app.use(express.json());
  registerBenchScheduleRoutes(app, {
    development: true, signingSecret: randomBytes(32), traceId: () => 'bpd03-root-proof',
    authenticateCreator: async () => ({ creatorId: 'bpd03-mock-owner', accountId: 'bpd03-mock-account' }), guardMutation: async () => true,
    createEvent: async () => { throw Error('Unexpected database event path'); }, readEvent: async () => { throw Error('Unexpected database read path'); },
    distributionVariantAdapter: adapter, loadBenchVariantSource: (_owner, postId, ids) => loadBenchVariantSource(postId, ids), getVariantEditProvider: async () => provider,
  });
  for (const destination of ['x', 'deviantart']) {
    const latestRequest = `Create a ${destination} cue titled Aurora at 10:00 Europe/London on 2026-10-24`;
    const response = await request(app).post('/api/v1/editor-bench/schedule/review').send({ latestRequest, selectedPostIds: [BENCH_IDS.posts[0]], selectedMediaIds: [BENCH_IDS.media[0]], structuredIntent: { kind: 'manual_posting_event', destination, source_ref: { mode: 'selection', id: null }, title_text: 'Aurora', time_kind: 'absolute_local', local_date: '2026-10-24', weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: '10:00 Europe/London on 2026-10-24' } });
    assert.equal(response.status, 200);
    const confirm = await request(app).post('/api/v1/editor-bench/schedule/confirm').send({ reviewToken: response.body.data.reviewToken });
    assert.equal(confirm.status, 201);
  }
  const initialRows = adapter.snapshot();
  const cases = [
    { destination: 'x', target: 'X', before: 'Aurora', after: 'A first look at Aurora Study—full release tomorrow.', revision: 0, latestRequest: 'Change the X caption to "A first look at Aurora Study—full release tomorrow."' },
    { destination: 'deviantart', target: 'DeviantArt', before: 'Aurora', after: 'Aurora Study — First Look', revision: 0, latestRequest: 'Change the DeviantArt title to "Aurora Study — First Look".' },
    { destination: 'x', target: 'A first look at Aurora Study—full release tomorrow.', before: 'A first look at Aurora Study—full release tomorrow.', after: 'Aurora Study Part One is ready to share.', revision: 1, latestRequest: 'For the X draft whose caption is "A first look at Aurora Study—full release tomorrow.", replace it with "Aurora Study Part One is ready to share."' },
  ];
  for (const item of (correction ? [cases[0], cases[2]] : cases)) {
    activeCase = item;
    const before = adapter.snapshot();
    const reviewed = await request(app).post('/api/v1/editor-bench/schedule/variant-edit/chat').send({ latestRequest: item.latestRequest });
    assert.equal(reviewed.status, 200);
    const review = reviewed.body.data;
    report.cases.push({ destination: item.destination, expectedRevision: item.revision, decision: review?.decision ?? null, diagnostic: review?.diagnostic ?? null, requestSha256: sha(item.latestRequest), replacementSha256: sha(item.after), passed: false });
    assert.equal(review.decision, 'review'); assert.equal(review.expectedRevision, item.revision);
    assert.equal(review.oldText, item.before); assert.equal(review.newText, item.after); assert(review.reviewToken);
    assert.deepEqual(adapter.snapshot(), before, 'Review must not write');
    const saved = await request(app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: review.reviewToken });
    assert.equal(saved.status, 201); assert.equal(saved.body.data.revision, item.revision + 1);
    const receipt = saved.body.data.receipt;
    assert.equal(receipt.variant[item.destination === 'x' ? 'postText' : 'title'], item.after); assert.equal(receipt.event.title, item.after);
    const original = initialRows.find(r => r.variant.id === receipt.variant.id);
    assert.deepEqual(receipt.variant.advice.bench_source_v1, original.variant.advice.bench_source_v1);
    assert.deepEqual(receipt.plan, original.plan);
    assert.equal(receipt.variant.scheduledFor, original.variant.scheduledFor);
    assert.deepEqual(receipt.variant.mediaIds, original.variant.mediaIds);
    assert.deepEqual(receipt.variant.advice.bench_variant_revisions_v1.revisions[0], original.variant.advice.bench_variant_revisions_v1.revisions[0]);
    assert.equal(receipt.variant.advice.bench_variant_revisions_v1.revisions.length, item.revision + 2);
    const retry = await request(app).post('/api/v1/editor-bench/schedule/variant-edit/confirm').send({ reviewToken: review.reviewToken });
    assert.equal(retry.status, 200); assert.equal(retry.body.data.reused, true);
    report.cases.at(-1).passed = true;
  }
  assert.equal(sha(createBenchFixture()), fixtureHash);
  report.checks = { singleCallPerChat: true, reviewReadOnly: true, confirmationSeparate: true, currentRevisionFollowup: true, literalUnicodePreserved: true, originalsAndProvenancePreserved: true, scheduleAndMediaUnchanged: true, appendOnlyHistory: true, retryReuse: true, databaseAndPublishCalls: 0 };
  report.passed = true;
} catch (error) {
  report.failure = { name: error?.name ?? 'Error', message: error?.code ? String(error.code) : 'Proof assertion or provider failed; stop without retry' };
  process.exitCode = 1;
} finally {
  const finalLedger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  assert.deepEqual(finalLedger.slice(0, initialLedger.length), initialLedger, 'Historical ledger rows changed');
  const added = finalLedger.slice(initialLedger.length);
  report.ledger = { initialRows: initialLedger.length, finalRows: finalLedger.length, previousRowsUnchanged: true, callsAttempted: calls, reservationsUsd: added.reduce((n,r) => n+r.reservedUsd,0), actualUsd: added.every(r => r.settled && r.actualUsd !== null) ? added.reduce((n,r) => n+r.actualUsd,0) : null, ledgerSha256: sha(finalLedger), newRows: added.map(({id,model,phase,reservedUsd,actualUsd,settled}) => ({id,model,phase,reservedUsd,actualUsd,settled})) };
  if (live) { assert(added.length <= (correction ? 2 : 3)); assert(report.ledger.reservationsUsd + (earlierFailure?.ledger.reservationsUsd ?? 0) <= 0.03); } else assert.equal(added.length, 0);
  if (correction) report.previousFailurePreserved = { path: 'outputs/editor-bench-posting-variant-chat-live-bpd03.json', sha256: sha(await readFile('outputs/editor-bench-posting-variant-chat-live-bpd03.json')), historicalCause: 'unknown; model output was not retained', cumulativeCallsAttempted: earlierFailure.ledger.callsAttempted + (live ? calls : 0), cumulativeReservationsUsd: earlierFailure.ledger.reservationsUsd + report.ledger.reservationsUsd };
  await file.writeFile(JSON.stringify(report, null, 2)+'\n'); await file.close();
  console.log(JSON.stringify({ passed: report.passed, report: path, cases: report.cases, ledger: report.ledger }));
}
