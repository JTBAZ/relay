// Bounded one-off proof over synthetic metadata and an isolated API instance.
import assert from 'node:assert/strict';
import { open, readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { registerBenchScheduleRoutes } from '../dist/src/editor-bench/schedule-routes.js';
import { createBenchDistributionVariantAdapter } from '../dist/src/editor-bench/distribution-variant-adapter.js';
import { createBenchFixture, createBenchPostCards, BENCH_IDS } from '../dist/src/editor-bench/fixtures.js';
import { createEditorBenchRuntime } from '../dist/src/editor-bench/runtime.js';

const live = process.argv.includes('--live');
const postingCorrection = process.argv.includes('--posting-correction');
const correction = process.argv.includes('--correction') || postingCorrection;
const recheck = process.argv.includes('--recheck');
const path = correction ? `outputs/editor-bench-conversation-${live ? 'live' : 'preflight'}-bct01-${postingCorrection ? 'posting-correction' : 'correction'}.json` : live ? 'outputs/editor-bench-conversation-live-bct01.json' : process.argv.includes('--final-preflight') ? 'outputs/editor-bench-conversation-preflight-bct01-final.json' : recheck ? 'outputs/editor-bench-conversation-preflight-bct01-recheck.json' : 'outputs/editor-bench-conversation-preflight-bct01.json';
const file = await open(path, 'wx');
const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const ledgerPath = '.relay-data/gallery-editor-budget.json';
const beforeLedger = JSON.parse(await readFile(ledgerPath, 'utf8'));
const originalFixtureHash = sha(createBenchFixture());
const initialSourceTitle = createBenchPostCards()[0].title;
const newTitle = 'Aurora Study Part 1';
const selectionText = 'Select Aurora Study, excluding posts tagged sketch.';
const renameText = 'Rename the selected post to "Aurora Study Part 1".';
const postingText = 'Prepare the selected artwork for X with the title "Aurora Study Part 1" on 2026-10-26 at 10:00 Europe/London.';
const actions = [
  { kind: 'selection', selection: { mode: 'replace', requestQuote: selectionText, selector: { base: 'catalog', all: [{ field: 'title', value: 'Aurora Study', requestQuote: 'Aurora Study' }], any: [], none: [{ field: 'tag', value: 'sketch', requestQuote: 'sketch' }] } } },
  { kind: 'rename', targetQuote: 'selected post', title: newTitle },
  { kind: 'posting', event: { kind: 'manual_posting_event', destination: 'x', source_ref: { mode: 'selection', id: null }, title_text: newTitle, time_kind: 'absolute_local', local_date: '2026-10-26', weekday: null, weekday_qualifier: null, local_time: '10:00', timezone: 'Europe/London', time_text: '2026-10-26 at 10:00 Europe/London' } },
];
const adapter = createBenchDistributionVariantAdapter();
const report = { ticket: 'BCT-01', date: '2026-10-19', mode: live ? 'live_mock_http' : 'canned_mock_http', passed: false, calls: [], turns: [], checks: {}, limitations: ['Synthetic fixture only', 'Ephemeral API-instance session and posting records', 'Frontend execution deferred', 'No real Library, database or platform operations'] };
const priorFailureRaw = await readFile('outputs/editor-bench-conversation-live-bct01.json');
const priorFailure = JSON.parse(priorFailureRaw);
const priorCorrectionRaw = postingCorrection ? await readFile('outputs/editor-bench-conversation-live-bct01-correction.json') : null;
const priorCorrection = priorCorrectionRaw ? JSON.parse(priorCorrectionRaw) : null;
const priorPaidCalls = priorFailure.budget.paidCalls + (priorCorrection?.budget.paidCalls ?? 0);
const priorReservations = priorFailure.budget.reservationsUsd + (priorCorrection?.budget.reservationsUsd ?? 0);
report.priorFailureSha256 = sha(priorFailureRaw);
report.priorCorrectionSha256 = priorCorrectionRaw ? sha(priorCorrectionRaw) : null;
report.selectionProvenance = postingCorrection ? 'Canned selection and confirmed rename seed from separately passing live cases; only posting is freshly live' : correction ? 'Canned seed from prior passing live selection; corrective paid calls cover rename and posting only' : 'Model interpretation in live mode';
let currentTurn = 0, providerCalls = 0;
try {
  const runtime = live ? await createEditorBenchRuntime({ repoRoot: process.cwd(), env: { ...process.env, NODE_ENV: 'development', RELAY_EDITOR_BENCH_LIVE: '1' } }) : null;
  if (live) { assert(runtime.status.enabled && runtime.editorProvider); assert(runtime.status.remainingUsd >= 0.03); }
  const provider = { async respond(payload) {
    assert(++providerCalls <= 3);
    const serialized = JSON.stringify({ input: payload.input, tools: payload.tools, responseSchema: payload.responseSchema });
    assert(Buffer.byteLength(serialized) <= 24 * 1024); assert.deepEqual(payload.tools, []);
    const data = JSON.parse(payload.input[1].content[0].text);
    assert.equal(data.catalog.posts.length, 16);
    assert.equal(data.catalog.posts.find(p => p.id === BENCH_IDS.posts[0]).visibleName, currentTurn === 2 ? newTitle : initialSourceTitle);
    if (currentTurn > 0) assert.deepEqual(data.currentSelection, [BENCH_IDS.posts[0]]);
    const paid = live && (!correction || currentTurn > (postingCorrection ? 1 : 0));
    const result = paid ? await runtime.editorProvider.respond(payload) : { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result: actions[currentTurn] }) }] }] };
    let decision;
    try { decision = JSON.parse(result.output.filter(x => x.type === 'message').flatMap(x => x.content ?? []).filter(x => x.type === 'output_text').map(x => x.text).join('')).result; } catch { decision = null; }
    report.calls.push({ expectedKind: actions[currentTurn].kind, paid, actualKind: ['selection','rename','tags','posting','clarification'].includes(decision?.kind) ? decision.kind : 'invalid', inputBytes: Buffer.byteLength(serialized), inputSha256: sha(serialized), catalogSize: data.catalog.posts.length, currentRevision: data.currentRevision, groundedTargetQuote: decision?.targetQuote ?? null, replacementSha256: typeof decision?.title === 'string' ? sha(decision.title) : null, usage: result.usage ?? null });
    if (paid) assert(result.usage?.calls === 1 && Number.isFinite(result.usage.costUsd));
    return result;
  } };
  const app = express(); app.use(express.json());
  registerBenchScheduleRoutes(app, { development: true, signingSecret: randomBytes(32), traceId: () => 'bct01-root',
    authenticateCreator: async req => ({ creatorId: req.headers['x-proof-owner'] === 'foreign' ? 'foreign' : 'proof-owner', accountId: 'proof-account' }), guardMutation: async () => true,
    createEvent: async () => { throw Error('Unexpected database write'); }, readEvent: async () => { throw Error('Unexpected database read'); }, distributionVariantAdapter: adapter, getVariantEditProvider: async () => provider });
  const start = await request(app).post('/api/v1/editor-bench/schedule/conversation/session').send({}); assert.equal(start.status, 201);
  let session = start.body.data;
  const originalTitle = session.cards.find(c => c.postId === BENCH_IDS.posts[0]).title;
  const expectedExcluded = session.cards.filter(c => c.tags.includes('sketch')).map(c => c.postId);
  let editToken, editReceipt;
  for (const [index, latestRequest] of [selectionText, renameText, postingText].entries()) {
    currentTurn = index;
    const before = structuredClone(session);
    const reviewed = await request(app).post('/api/v1/editor-bench/schedule/conversation/turn').send({ sessionId: session.sessionId, revision: session.revision, latestRequest });
    const data = reviewed.body.data;
    report.turns.push({ requestSha256: sha(latestRequest), httpStatus: reviewed.status, outcome: data?.status ?? null, diagnostic: data?.diagnostic ?? null, renameValidation: data?.renameValidation ?? null, message: typeof data?.message === 'string' ? data.message.slice(0,300) : null, passed: false });
    assert.equal(reviewed.status, 200);
    session = data;
    assert.deepEqual(session.selection.postIds, [BENCH_IDS.posts[0]]);
    assert.deepEqual(session.selection.excludedPostIds, expectedExcluded);
    if (index === 0) { assert.equal(data.status, 'selected'); assert.equal(adapter.size(), 0); }
    else {
      assert.equal(data.status, 'review'); assert(data.reviewToken);
      assert.equal(data.revision, before.revision);
      assert.equal(data.cards.find(c => c.postId === BENCH_IDS.posts[0]).title, index === 1 ? originalTitle : newTitle);
      assert.equal(adapter.size(), 0);
      if (index === 1) editToken = data.reviewToken;
      const confirmed = await request(app).post('/api/v1/editor-bench/schedule/conversation/confirm').send({ sessionId: data.sessionId, reviewToken: data.reviewToken });
      assert.equal(confirmed.status, 201);
      session = confirmed.body.data;
      assert.equal(session.revision, before.revision + 1);
      assert.equal(session.cards.find(c => c.postId === BENCH_IDS.posts[0]).title, newTitle);
      assert.deepEqual(session.selection.excludedPostIds, expectedExcluded);
      if (index === 1) { editReceipt = session.receipt; assert.equal(adapter.size(), 0); }
      else {
        assert.equal(adapter.size(), 1);
        const row = adapter.snapshot()[0];
        assert.equal(row.variant.advice.bench_source_v1.source.title, newTitle);
        assert.equal(row.variant.postText, newTitle); assert.equal(row.event.title, newTitle);
        assert.equal(row.variant.status, 'draft'); assert.equal(row.event.status, 'pending');
        assert.deepEqual(row.variant.attempts, []); assert.deepEqual(row.variant.postbotTasks, []);
        assert.equal(row.event.linkage.variant_id, row.variant.id);
      }
    }
    report.turns.at(-1).passed = true;
  }
  const retry = await request(app).post('/api/v1/editor-bench/schedule/conversation/confirm').send({ sessionId: session.sessionId, reviewToken: editToken });
  assert.equal(retry.status, 200); assert.deepEqual(retry.body.data.receipt, editReceipt); assert.equal(retry.body.data.revision, session.revision);
  const refreshed = await request(app).get(`/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}`);
  assert.equal(refreshed.status, 200); assert.equal(refreshed.body.data.revision, session.revision);
  assert.equal(refreshed.body.data.cards.find(c => c.postId === BENCH_IDS.posts[0]).title, newTitle);
  const foreignRead = await request(app).get(`/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}`).set('x-proof-owner','foreign'); assert.equal(foreignRead.status,404);
  const foreign = await request(app).post('/api/v1/editor-bench/schedule/conversation/turn').set('x-proof-owner','foreign').send({ sessionId: session.sessionId, revision: session.revision, latestRequest: 'Select Aurora Study.' }); assert.equal(foreign.status, 404);
  const stale = await request(app).post('/api/v1/editor-bench/schedule/conversation/turn').send({ sessionId: session.sessionId, revision: 0, latestRequest: 'Select Aurora Study.' }); assert.equal(stale.status, 409);
  assert.equal(providerCalls, 3); assert.equal(sha(createBenchFixture()), originalFixtureHash);
  report.checks = { selectionAndExclusionsPreserved: true, literalRenameSeparateConfirmation: true, currentNameInNextModelTurn: true, currentSourcePinnedToPosting: true, postingSeparateConfirmation: true, immutableReceiptRetryWithCurrentContext: true, ownedReadOnlySnapshotRecovery: true, foreignAndStaleNoProviderCall: true, originalFixtureUnchanged: true, linkedDraftAndPendingEvent: true, databaseAndPublishOperations: 0 };
  report.passed = true;
} catch (error) { report.failure = { name: error?.name ?? 'Error', code: error?.code ?? null, message: 'Proof stopped at first failure without retry' }; process.exitCode = 1; }
finally {
  const afterLedger = JSON.parse(await readFile(ledgerPath,'utf8'));
  assert.deepEqual(afterLedger.slice(0,beforeLedger.length),beforeLedger);
  assert.equal(sha(await readFile('outputs/editor-bench-conversation-live-bct01.json')), report.priorFailureSha256);
  if (priorCorrectionRaw) assert.equal(sha(await readFile('outputs/editor-bench-conversation-live-bct01-correction.json')), report.priorCorrectionSha256);
  const added=afterLedger.slice(beforeLedger.length);
  report.budget={initialRows:beforeLedger.length,finalRows:afterLedger.length,previousRowsUnchanged:true,providerCalls,paidCalls:live?added.length:0,reservationsUsd:added.reduce((n,r)=>n+r.reservedUsd,0),actualUsd:added.every(r=>r.settled&&r.actualUsd!==null)?added.reduce((n,r)=>n+r.actualUsd,0):null,ledgerSha256:sha(afterLedger),newRows:added.map(({id,model,phase,reservedUsd,actualUsd,settled})=>({id,model,phase,reservedUsd,actualUsd,settled}))};
  assert(added.length <= (postingCorrection ? 1 : correction ? 2 : 3) && report.budget.reservationsUsd <= (correction ? (postingCorrection ? 0.05 : 0.04) - priorReservations : 0.03)); if(!live) assert.equal(added.length,0);
  if(correction) {
    report.budget.combinedPaidCalls = priorPaidCalls + added.length;
    report.budget.combinedReservationsUsd = priorReservations + report.budget.reservationsUsd;
    assert(report.budget.combinedPaidCalls <= (postingCorrection ? 5 : 4) && report.budget.combinedReservationsUsd <= (postingCorrection ? 0.05 : 0.04));
  }
  await file.writeFile(JSON.stringify(report,null,2)+'\n'); await file.close();
  console.log(JSON.stringify({passed:report.passed,path,turns:report.turns,budget:report.budget}));
}
