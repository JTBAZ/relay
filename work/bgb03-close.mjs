import fs from 'node:fs';
import cp from 'node:child_process';
import {createHash} from 'node:crypto';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const canonicalHash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const requireTrue = (x, message) => { if (!x) throw Error(message); };
const baseline = read('work/bgb03-baseline/baseline.json');
const audit = read('work/bgb03-prelive-audit.json');
const livePath = 'outputs/editor-bench-generic-batch-live-bgb03.json';
const preflightPath = 'outputs/editor-bench-generic-batch-preflight-bgb03.json';
const live = read(livePath), preflight = read(preflightPath);
const tests = read('work/bgb03-root-tests.json');
const build = read('work/bgb03-luna-build-02.exit.json');
const runtime = read('work/bgb03-runtime.json');
const ledgerPath = '.relay-data/gallery-editor-budget.json';
const ledger = read(ledgerPath);
requireTrue(live.passed && preflight.passed && live.calls.length === 6 && live.cases.length === 3, 'Bounded proof failed');
requireTrue(live.cases.every(c => c.passed && c.originalsUnchanged && c.reviewReadOnly), 'Scenario safeguards failed');
requireTrue(live.cases.reduce((n,c) => n + c.drafts.length, 0) === 9, 'Expected nine confirmed mock drafts');
requireTrue(tests.numPassedTests === 35 && tests.numFailedTests === 0 && tests.testResults.length === 3 && build.exitCode === 0, 'Verification failed');
requireTrue(runtime.health === 200 && Object.values(runtime.protectedPosts).every(s => s === 401), 'Runtime probes failed');
requireTrue(ledger.length === 913 && canonicalHash(ledger.slice(0,907)) === baseline.ledger.sha256, 'Historical ledger changed');
requireTrue(canonicalHash(ledger) === live.budget.ledgerSha256, 'Ledger changed after live proof');
requireTrue(ledger.slice(907).every(x => x.phase === 'development' && x.model === 'gpt-5.6-luna' && x.settled), 'Unexpected new ledger rows');
for (const [p,h] of Object.entries(baseline.reports)) requireTrue(hash(p) === h, 'Prior evidence changed: '+p);
for (const [p,h] of Object.entries(baseline.configHashes)) requireTrue(hash(p) === h, 'Configuration changed: '+p);
for (const [p,v] of Object.entries(audit.scope)) requireTrue(hash(p) === v.sha256, 'Reviewed source changed: '+p);
for (const [p,h] of Object.entries(baseline.source)) if (!p.startsWith('docs/') && !Object.hasOwn(audit.scope,p)) requireTrue(hash(p) === h, 'Unrelated source changed: '+p);
for (const [p,h] of Object.entries(live.baseline.hashes)) requireTrue(hash(p) === h, 'Evaluated input changed: '+p);
const gitArgs = ['-c','safe.directory='+process.cwd().replaceAll('\\','/')];
const head = cp.execFileSync('git',[...gitArgs,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
requireTrue(head === baseline.head, 'HEAD changed');
const reportPath = 'outputs/editor-bench-cheap-model-followups-proof-bgb03.json';
const report = {
  ticket:'BGB-03', status:'accepted_for_mock_bench', date:'2026-10-20', branch:audit.branch, head,
  objective:'Correct template/copy and additive-destination follow-ups without relaxing grounding or confirmation.',
  roles:{plan:'Sol High',implementation:'Luna High',acceptance:'Root scoped review and bounded evaluation'},
  plan:'docs/conversational-planning/BENCH-CHEAP-MODEL-FOLLOWUPS-PLAN.md',
  scope:audit.scope,
  changes:['Expose only owned template IDs/names in model input.','Use concise paraphrased structured examples for preparation choices and destination additions/removals.','Keep arbitrary full quoted literal copy distinct from owned template names.','Add regression coverage for preserved choices, exclusions, destination changes and the three recorded invalid BGB-02 actions.'],
  preserved:['Strict schema and exact latest-request quote grounding','Deterministic merge and 24 KiB payload cap','One cheap-model call per turn, tools empty, no retry or token-cap increase','Original metadata, selection/exclusion context and explicit per-draft confirmation','Existing separate scheduling and manual extension handoff confirmations'],
  review:{skill:'Ponytail Review',scope:'Only the two file/hunk sets above, compared with work/bgb03-baseline/, plus connected parser, routes, provider/budget and variant adapter.',remainingFindings:[],corrections:['Clarified that only templateQuote is restricted to owned templates; literal copy remains allowed.','Corrected negative replay setup to seed an actually valid active preparation before asserting unchanged state.'],whitespaceClean:true},
  verification:{backendTests:{passed:35,failed:0,files:3,report:'work/bgb03-root-tests.json',exit:'work/bgb03-root-tests.exit.json'},backendBuild:{exitCode:0,evidence:'work/bgb03-luna-build-02.exit.json'},preflight:{passed:true,scenarios:3,confirmedMockDrafts:9,paidCalls:0,path:preflightPath},live:{passed:true,turns:6,scenarios:3,confirmedMockDrafts:9,skippedDependentTurns:0,path:livePath,journal:'outputs/editor-bench-generic-batch-live-bgb03.ndjson',model:live.model,reasoningEffort:live.reasoningEffort},backendApi:runtime},
  budget:{...live.budget,authoritativeLedgerAbsolutePath:String.raw`C:\Users\jorda\Documents\Codex\2026-10-11\c\work\relay\.relay-data\gallery-editor-budget.json`,independentlyVerifiedHistoricalPrefix:true},
  evidence:{priorReportsAndJournalsUnchanged:Object.keys(baseline.reports).length,priorFailure:'outputs/editor-bench-generic-batch-live-bgb02.json',priorFailureJournal:'outputs/editor-bench-generic-batch-live-bgb02.ndjson',configurationUnchanged:true,extensionSourcePathsUnchanged:audit.extensionPathsUnchanged,sourceFrozenSinceReviewAndTests:true,baseline:'work/bgb03-baseline/baseline.json',preliveAudit:'work/bgb03-prelive-audit.json'},
  limits:['Six fixed synthetic turns are a smoke check, not a broad language-quality benchmark.','Two additive scenarios have labelled canned setup; their follow-up turns are live.','No new scheduling or extension delivery proof in this check; existing flows were unchanged.','Frontend tests/build/lint/typecheck/browser/render and live extension execution remain deferred.','Broader suite not rerun; three historical distribution-package stub failures remain recorded in BGB-01.','Mock data only; no production Library or database writes; publishing remains manual.','API reload cleared temporary bench sessions; Next, database and extension were not restarted or rebuilt.','No further ticket dispatched; changes remain local and uncommitted.'],
  referenceGuidance:['https://developers.openai.com/api/docs/guides/prompt-engineering','https://developers.openai.com/api/docs/models/gpt-5.6-luna']
};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const common = `**BGB-03 accepted for the mock bench, 2026-10-20.** Sol High planned and Luna High fixed template/copy routing and additive-destination follow-ups. The model now receives owned template IDs/names and paraphrased structured examples; strict quote grounding, the existing payload cap and explicit confirmation are unchanged. All six live cheap-model turns passed across three scenarios, producing nine separately confirmed mock drafts. Selection, exclusions, preparation choices and originals survived destination/artwork additions and destination removal. Backend tests: 35 passed in three files; backend build and no-cost HTTP preflight passed. This is a bounded smoke check, not a general accuracy claim. Earlier BGB-02 failures remain preserved; older status entries below are historical.`;
const budgetText = `Six gpt-5.6-luna calls (reasoning none) cost **$0.0045514**, reserving $0.0519952 under the $0.06 cap. Ledger: **913 rows**, **$0.34898714 development / $8.9690346 heldout** remaining. Historical ledger rows and all 71 captured prior reports/journals are unchanged. Publishing stays manual, mock data only, frontend testing deferred. The API was reloaded on 8788 (health 200; protected route probes 401), clearing temporary sessions; refresh the bench. Two startup attempts failed before the API started with process-only logging and shared-session settings required by existing split-worker behavior; those failures are preserved in the acceptance evidence. Configuration files are unchanged. No frontend or extension changes, new platform, production writes or further ticket dispatch.`;
const prepend = (p, text) => {
  const old=fs.readFileSync(p,'utf8');
  requireTrue(!old.includes('**BGB-03 accepted'), 'Already updated: '+p);
  const end=old.indexOf('\n');
  fs.writeFileSync(p,old.slice(0,end+1)+'\n'+text+'\n\n'+old.slice(end+1).replace(/^\r?\n/,''));
};
const links = (prefix) => `[Acceptance and limits](${prefix}outputs/editor-bench-cheap-model-followups-proof-bgb03.json), [live proof](${prefix}outputs/editor-bench-generic-batch-live-bgb03.json), [preserved earlier failures](${prefix}outputs/editor-bench-generic-batch-live-bgb02.json).`;
prepend('docs/relay-cheaper-model-handoff.md',common+'\n\n'+budgetText+'\n\n'+`Branch \`${audit.branch}\`, HEAD \`${head}\`; changes remain local/uncommitted. Authoritative ledger: \`${report.budget.authoritativeLedgerAbsolutePath}\`, canonical SHA-256 \`${live.budget.ledgerSha256}\`. Scoped review covered only the two implementation/test files against the BGB-03 baseline and connected code. The three historical distribution-package stub failures remain outside this task; the broader suite was not rerun. Scheduling and actual extension delivery were not retested. Original external report links and absolute paths remain below. `+links('../'));
for (const name of ['WORK-ITEMS.md','DISPATCH.md','README.md','EDITOR-BENCH-PLAN.md','BENCH-GENERIC-PREVIEW-BATCH-PLAN.md']) prepend('docs/conversational-planning/'+name,common+'\n\n'+budgetText+' '+links('../../'));
const planPath='docs/conversational-planning/BENCH-CHEAP-MODEL-FOLLOWUPS-PLAN.md';
let plan=fs.readFileSync(planPath,'utf8');
requireTrue(plan.includes('Status: root-approved for Luna High, 2026-10-20.'),'Unexpected plan status');
plan=plan.replace('Status: root-approved for Luna High, 2026-10-20. Sol High planned; two-file backend/prompt slice. Root owns final review, evaluation, evidence and continuity updates.','Status: accepted for the mock bench, 2026-10-20. Sol High planned / Luna High implemented / root reviewed. Two-file backend/prompt slice; no further ticket dispatched.');
fs.writeFileSync(planPath,plan);
prepend(planPath,common+'\n\n'+budgetText+' '+links('../../'));
console.log(JSON.stringify({report:reportPath,passed:true,liveTurns:6,confirmedMockDrafts:9,developmentRemainingUsd:live.budget.remaining.development,runtimePid:runtime.pid,priorEvidenceFilesPreserved:71,docsUpdated:7}));
