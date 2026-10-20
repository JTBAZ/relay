// One-off root acceptance record; no provider, database or platform calls.
import assert from 'node:assert/strict';
import { readFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const sha = value => createHash('sha256').update(value).digest('hex');
const baseline = JSON.parse(await readFile('work/bct01-preservation-baseline.json', 'utf8'));
const changedSource = ['src/editor-bench/conversation.ts','tests/editor-bench/conversation.test.ts','src/editor-bench/curation.ts','src/editor-bench/distribution-variant-adapter.ts','src/editor-bench/fixtures.ts','src/editor-bench/manual-posting-event.ts','src/editor-bench/schedule-review.ts','src/editor-bench/schedule-routes.ts','src/editor-bench/selector.ts','web/app/editor-bench/EditorBenchClient.tsx','web/lib/editor-bench.ts'];
const protectedSource = {};
const unrelatedSourceDrift = [];
for (const [path, expected] of Object.entries(baseline.source)) {
  if (changedSource.includes(path)) continue;
  const actual = sha(await readFile(path));
  if (path === 'src/server.ts' && actual !== expected) {
    assert.equal(actual, 'e0f9b9056c6f3006090958c55e1797af8d1014c8d09f1fa3a1f780bd6cb59e57');
    unrelatedSourceDrift.push({path,baselineSha256:expected,currentSha256:actual,reason:'Concurrent Goal Cycle authentication/idempotency changes, outside BCT-01; preserved. Existing bench registration/provider wiring is unchanged against the fixed Git baseline.'});
  } else { assert.equal(actual, expected, path); protectedSource[path] = actual; }
}
for (const [path, expected] of Object.entries(baseline.reports)) assert.equal(sha(await readFile(path)), expected, path);
const ledger = JSON.parse(await readFile('.relay-data/gallery-editor-budget.json', 'utf8'));
assert.equal(sha(JSON.stringify(ledger.slice(0, baseline.ledgerRows))), baseline.ledgerSha);
const preflight = JSON.parse(await readFile('outputs/editor-bench-conversation-preflight-bct01-posting-correction.json', 'utf8'));
const corrective = JSON.parse(await readFile('outputs/editor-bench-conversation-live-bct01-correction.json', 'utf8'));
const posting = JSON.parse(await readFile('outputs/editor-bench-conversation-live-bct01-posting-correction.json', 'utf8'));
const failure = JSON.parse(await readFile('outputs/editor-bench-conversation-live-bct01.json', 'utf8'));
assert(preflight.passed && posting.passed);
assert.equal(corrective.budget.paidCalls, 2);
assert(corrective.turns[1].passed && corrective.turns[2].outcome === 'clarification');
assert.equal(posting.budget.paidCalls, 1);
const newRows = ledger.slice(baseline.ledgerRows);
assert.equal(newRows.length, 5); assert(newRows.every(row => row.settled && row.actualUsd !== null));
const spent = row => row.settled && row.actualUsd !== null ? row.actualUsd : row.reservedUsd;
const development = ledger.filter(row => row.phase === 'development').reduce((sum, row) => sum + spent(row), 0);
const heldout = ledger.filter(row => row.phase === 'heldout').reduce((sum, row) => sum + spent(row), 0);
const git = (...args) => execFileSync('git', ['-c','safe.directory=C:/Users/jorda/Documents/Codex/2026-10-11/c/work/relay', ...args], { encoding: 'utf8' }).trim();
const sourceHashes = Object.fromEntries(await Promise.all(changedSource.map(async path => [path,sha(await readFile(path))])));
const proof = {
  ticket: 'BCT-01', date: '2026-10-19', acceptance: 'Mock-only backend capability; minimal UI source reviewed, frontend execution deferred',
  plannedBy: 'Sol High', implementedBy: 'Luna High', acceptedBy: 'root',
  branch: git('branch','--show-current'), reviewBaseline: '57af13aafae7e18e862fe3b49c353cf774d1c930',
  review: { skill: 'Ponytail Review', scope: 'Only BCT-01 hunks against the fixed baseline in the listed tracked files, entire new conversation module/test, and connected selector/compiler/distribution callers', files: changedSource, sourceHashes,
    resolved: ['Effective tags stay current across later catalog/selection/posting turns','Deictic edit targets must be literal and independently grounded','Turn generations and confirmation guards prevent stale reviews','Receipt retries retain immutable receipts and return current context','Read-only snapshot recovery before another paid turn','Rename-only schema simplified while exact quoted replacement is verified on the server','Destination posting copy is explicitly distinguished from a source metadata rename'],
    remainingInScopeDefects: [], uiReview: 'Source-only against existing bench conventions and current Web Interface Guidelines; no frontend commands or browser QA' },
  checks: JSON.parse(await readFile('work/bct01-final-checks.json', 'utf8')),
  evidence: { cannedSequence: 'outputs/editor-bench-conversation-preflight-bct01-posting-correction.json', originalLiveFailure: 'outputs/editor-bench-conversation-live-bct01.json', correctiveLive: 'outputs/editor-bench-conversation-live-bct01-correction.json', finalPostingLive: 'outputs/editor-bench-conversation-live-bct01-posting-correction.json',
    originalLive: { calls: 2, selectionPassed: true, renameRejectedWithoutEdit: true, historicalPredicateUnknown: true, postingCanceled: true },
    corrective: { paidCalls: 2, selection: 'Canned seed from original passing live case', renameReviewAndSeparateConfirmation: true, postingClarifiedWithoutWrite: true },
    finalPosting: { paidCalls: 1, selectionAndRename: 'Canned seeds from separately passing live cases', postingReviewAndSeparateConfirmation: true, checks: posting.checks },
    languageQualityLimit: 'A small bounded X example, not a broad reliability measurement or a freshly live three-stage sequence' },
  preservation: { historicalAndCurrentFailureReportsUnchanged: Object.keys(baseline.reports).length, reportHashes: baseline.reports, previousLedgerRowsUnchanged: baseline.ledgerRows, previousLedgerPrefixSha256: baseline.ledgerSha, protectedSource, unrelatedSourceDrift },
  budget: { ledger: 'C:/Users/jorda/Documents/Codex/2026-10-11/c/work/relay/.relay-data/gallery-editor-budget.json', rows: ledger.length, sha256: sha(JSON.stringify(ledger)), developmentRemainingUsd: Number((15-development).toFixed(8)), heldoutRemainingUsd: Number((10-heldout).toFixed(8)), paidCalls: newRows.length, actualUsd: newRows.reduce((sum,row)=>sum+row.actualUsd,0), reservationsUsd: newRows.reduce((sum,row)=>sum+row.reservedUsd,0), ceiling: {calls:5,reservationsUsd:0.05}, initialFailureActualUsd: failure.budget.actualUsd },
  limitations: ['Synthetic 16-post complete catalog only; large-Library retrieval remains a separate capability','One operation per turn; exactly one selected post for rename, tag change or posting','Literal replacement text only; one direct X or DeviantArt cue','Session, effective edits, receipts and posting records are API-instance memory and expire or disappear on restart','Posting is manual; no durable Schedule Rail write, real Library/DB or platform operation','Frontend tests, lint, typecheck, build and browser QA deferred; existing API not restarted','Changes remain local; no commit, push or deployment']
};
assert(proof.budget.reservationsUsd <= 0.05);
const output = await open('outputs/editor-bench-conversation-proof.json','wx');
await output.writeFile(JSON.stringify(proof,null,2)+'\n'); await output.close();
console.log(JSON.stringify({acceptance:proof.acceptance,checks:proof.checks,budget:proof.budget,preservedReports:proof.preservation.historicalAndCurrentFailureReportsUnchanged}));
