import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import cp from 'node:child_process';
const read = p => fs.readFileSync(p, 'utf8');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const baseline = JSON.parse(read('work/bpx01-baseline/baseline.json'));
const files = ['src/editor-bench/conversation.ts', 'src/editor-bench/distribution-variant-adapter.ts', 'src/editor-bench/schedule-routes.ts', 'tests/editor-bench/conversation.test.ts', 'web/app/editor-bench/EditorBenchClient.tsx', 'web/lib/editor-bench.ts', 'web/next.config.mjs'];
const changed = Object.entries(baseline.source).filter(([p, h]) => hash(p) !== h).map(([p]) => p);
assert.deepEqual([...changed].sort(), [...files].sort());
for (const [p, h] of Object.entries(baseline.reports)) assert.equal(hash(p), h, p);
const ledgerPath = 'C:/Users/jorda/Documents/Codex/2026-10-11/c/work/relay/.relay-data/gallery-editor-budget.json';
const ledger = JSON.parse(read(ledgerPath));
const ledgerHash = crypto.createHash('sha256').update(JSON.stringify(ledger)).digest('hex');
assert.equal(ledgerHash, baseline.ledger.sha256);
const http = JSON.parse(read('outputs/editor-bench-previewizer-x-draft-http-bpx01.json'));
assert.equal(http.passed, true);
const git = args => cp.execFileSync('git', ['-c', 'safe.directory='+process.cwd().replaceAll('\\','/'), ...args], {encoding:'utf8'}).trim();
const head = git(['rev-parse', 'HEAD']);
const branch = git(['branch', '--show-current']);
const concurrentCommitPaths = git(['diff', '--name-only', baseline.head, head]).split('\n').filter(Boolean);
assert(!concurrentCommitPaths.some(p => files.includes(p)));
const whitespace = files.map(p => {
  const r = cp.spawnSync('git', ['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'-c','core.whitespace=cr-at-eol','diff','--no-index','--check','--','work/bpx01-baseline/'+p,p], {encoding:'utf8'});
  assert([0,1].includes(r.status)); assert.equal(r.stdout.trim(), '');
  return {file:p, clean:true};
});
const report = {
  ticket:'BPX-01', acceptedFor:'temporary mock backend and source-reviewed bench wiring', date:'2026-10-19',
  models:{plan:'Sol High',implementation:'Luna High',review:'root'}, branch, baselineHead:baseline.head, head, concurrentCommitPaths,
  taskScope:files.map(p=>({path:p,before:baseline.source[p],after:hash(p)})), protectedSourcePathsUnchanged:Object.keys(baseline.source).length-files.length,
  checks:{focusedConversation:{passed:21,failed:0},backendBuild:'passed by Luna after final source edits',
    broaderBackend:{files:20,passedFiles:19,failedFiles:1,passed:168,failed:3,
      command:'npx vitest run tests/editor-bench tests/distribution-platform-formatters.test.ts tests/distribution-media-binding.test.ts tests/distribution-package.test.ts tests/post-distribution-identity.test.ts',
      failures:{file:'tests/distribution-package.test.ts',tests:['returns main media for Patreon full routing','returns preview media for X preview routing','returns invalid_media_binding when preview id missing from plan'],
        error:"TypeError: Cannot read properties of undefined (reading 'findFirst')",location:'src/distribution/distribution-package.ts:155',
        cause:'Separate uncommitted posting-rhythm integration calls prisma.postDistributionPlan.findFirst; existing stub does not define postDistributionPlan.',
        ownership:'Outside BPX-01; production package and fixture were not edited by this task. Timing relative to BPX baseline is unknown; not claimed as a baseline failure.',fixed:false}},
    compiledHttpProof:'outputs/editor-bench-previewizer-x-draft-http-bpx01.json',httpChecks:http.checks,
    tsxSyntaxOnly:'passed; zero TypeScript parser diagnostics for EditorBenchClient.tsx',whitespace,
    scopedPonytailReview:'No remaining blocking findings in the seven task-file hunks versus work/bpx01-baseline and their callers. Checked owner and source/export binding, exact copy, pending review invalidation, successful-token replay, immutable receipts, failed-commit atomicity, confirmation races and bounded shared-byte retention.',
    uiSourceReview:'Semantic buttons, focus states, image dimensions/alt, text wrapping and readable field differences checked against current Web Design Guidelines; no rendered or browser check.'},
  runtime:{apiPort:8788,previousPid:48724,apiPid:49960,health:200,unauthenticatedReview:401,unauthenticatedConfirm:401,backgroundWorkers:'disabled',temporarySessionsReset:true},
  budget:{ledgerPath,canonicalSha256:ledgerHash,...baseline.ledger,paidCalls:0,priorReportsPreserved:Object.keys(baseline.reports).length},
  limits:['Mock fixtures and temporary API-instance records; no live Library or database draft persistence','One selected completed export per review; separate explicit Confirm creates an unscheduled draft, no event','Publishing remains manual; this ticket does not add extension handoff for unscheduled drafts','Initial template provenance and revision-0 history recorded; changing copy or export makes another immutable draft, not an edit of the earlier one','32 draft identities and 64 successful review-token receipts per session; 1,024 adapter draft rows per API instance','JPEG <=1 MiB; shared retained bytes <=4 MiB per session /32 MiB total; session expires after two idle hours; API restart clears state','Frontend tests, lint, typecheck, build, detector and browser/render QA deferred; real browser export and JPEG rewrite journey unverified','No paid-language proof; deterministic mock HTTP proof and existing prompt-size cap only'],
};
fs.writeFileSync('outputs/editor-bench-previewizer-x-draft-proof.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const note = '**BPX-01 accepted for the mock bench, 2026-10-19:** Sol High planned / Luna High implemented / root reviewed [X drafts from confirmed previews](BENCH-PREVIEWIZER-X-DRAFT-PLAN.md). After “Use as preview”, each selected item offers **Review X draft → Confirm X draft**. Review shows the actual JPEG and exact recorded copy; Confirm creates an unscheduled mock variant with that export as its only attachment. Originals, conversation choices, earlier drafts and their pinned exports remain unchanged. [Acceptance and known failures](../../outputs/editor-bench-previewizer-x-draft-proof.json), [HTTP proof](../../outputs/editor-bench-previewizer-x-draft-http-bpx01.json). Focused 21 tests, backend build and allowed TSX syntax check passed; broader backend run passed 168 tests and failed 3 unrelated distribution-package tests because a separate posting-rhythm lookup lacks a database-stub field. Those failures are recorded, not fixed here. Frontend testing stays deferred; publishing stays manual. Zero paid calls; ledger 903 unchanged. API reloaded; refresh for a fresh temporary session. No next ticket dispatched. Older entries are historical.';
for(const p of ['docs/conversational-planning/WORK-ITEMS.md','docs/conversational-planning/README.md','docs/conversational-planning/DISPATCH.md','docs/conversational-planning/EDITOR-BENCH-PLAN.md']){
  const old = read(p), end = old.indexOf('\n'); assert(!old.includes('**BPX-01 accepted for'));
  fs.writeFileSync(p,old.slice(0,end+1)+'\n'+note+'\n'+old.slice(end+1));
}
const handoff='docs/relay-cheaper-model-handoff.md';
const oldHandoff=read(handoff), end=oldHandoff.indexOf('\n');
const update='**BPX-01 accepted for the mock bench, 2026-10-19.** Sol High planned and Luna High implemented [X drafts from confirmed Previewizer exports](conversational-planning/BENCH-PREVIEWIZER-X-DRAFT-PLAN.md). The approved slice adds per-item **Review X draft → Confirm X draft** after an explicit “Use as preview”. Review displays the actual exported JPEG, exact current-title or recorded literal X copy, and field differences. Confirmation creates an unscheduled mock plan/variant with preview-only media binding and revision-0 source/export/template provenance. Originals, selections/exclusions, preparation choices and previously confirmed records remain intact. Changed copy or a new export can create another separately confirmed immutable draft. There is no new event, publishing action or production persistence.\n\nCurrent branch is `'+branch+'`, HEAD `'+head+'`. Changes remain local/uncommitted; a separate ingestion commit advanced HEAD without touching BPX files. Root reviewed only the seven approved source/test/config files against `work/bpx01-baseline/` and their connected callers. The narrow Next rewrite serves owned preview JPEGs through the existing API. [Root acceptance](../outputs/editor-bench-previewizer-x-draft-proof.json), [canned HTTP proof](../outputs/editor-bench-previewizer-x-draft-http-bpx01.json). Focused conversation tests 21/21, Luna’s backend build, and the allowed one-file TSX syntax check passed. The broader run passed 168 tests across 19 files and failed three distribution-package tests: a separate uncommitted posting-rhythm lookup at `src/distribution/distribution-package.ts:155` expects `postDistributionPlan.findFirst`, missing from the test stub. This ticket changed neither that path nor its fixture; the failures are preserved in acceptance evidence. The full run is not green.\n\nAPI 8788 reloaded as PID 49960; health 200 and both protected draft routes returned unauthenticated 401. Refresh the bench for a fresh conversation; reload cleared temporary sessions/exports. Background workers remain disabled. Drafts and JPEG pins expire with their two-hour idle session or API restart. Caps: 32 draft identities /64 successful confirmation-token receipts per session, 1,024 draft-only adapter rows per API instance; JPEG and retained-byte limits remain 1 MiB /4 MiB per session /32 MiB global. Old draft rows cannot fall back to original artwork if an export expires. Unscheduled draft editing, dated scheduling/handoff for these drafts, live Library and production CP11 remain separate work. Publishing is manual. Frontend tests/lint/typecheck/build/detector/browser/render QA remain deferred; actual browser export and image rewrite behavior are not verified. No further ticket dispatched.\n\nBudget: no paid calls. All 55 earlier reports and original external report links/absolute paths are preserved. Authoritative ledger remains 903 rows, **$0.35674 development /$8.9690346 heldout**, canonical SHA-256 `'+ledgerHash+'`, at `C:\\Users\\jorda\\Documents\\Codex\\2026-10-11\\c\\work\\relay\\.relay-data\\gallery-editor-budget.json`. Earlier status entries below are historical.';
fs.writeFileSync(handoff,oldHandoff.slice(0,end+1)+'\n'+update+'\n'+oldHandoff.slice(end+1));
const plan='docs/conversational-planning/BENCH-PREVIEWIZER-X-DRAFT-PLAN.md';
let planText=read(plan).replace('Status: root-approved ticket for Luna High.', 'Status: accepted for the temporary mock slice, 2026-10-19; Sol High planned, Luna High implemented, root reviewed. [Acceptance and known failures](../../outputs/editor-bench-previewizer-x-draft-proof.json).');
planText=planText.replace('and `web/app/editor-bench/EditorBenchClient.tsx`.', 'and `web/app/editor-bench/EditorBenchClient.tsx`; root also approved the required narrow JPEG rewrite in `web/next.config.mjs`.');
planText+='\nAccepted limits: 64 successful review-token receipts per session in addition to the bounds above. This preserves exact-token retry behavior without unbounded token storage. Focused conversation 21/21, backend build, syntax-only TSX check and no-cost HTTP proof passed. Broader backend run: 168 passed /3 failures in the separate distribution-package stub after an unrelated posting-rhythm lookup; full failure detail is preserved in the root evidence. No paid calls or front-end testing. API reloaded; refresh the bench. No next ticket dispatched.\n';
fs.writeFileSync(plan,planText);
console.log(JSON.stringify({accepted:true,head,branch,sourceFiles:files.length,priorReportsPreserved:Object.keys(baseline.reports).length,ledgerUnchanged:true}));
