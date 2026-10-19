import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const baseline = {
  "source": {
    "src/editor-bench/distribution-variant-adapter.ts": "9584294231acdbbbf0d025adeeec2e514f23670c9af01c8ba6184dc499b13415",
    "src/editor-bench/schedule-routes.ts": "d250d77de8cff2b31391348bd1b413f864dfa9fe02e543899fb42fd2111a438d",
    "src/server.ts": "b40f806373bfa1f8e469d0ad149fc827b0c582515971f92c3c604dafa3371e4d",
    "prisma/schema.prisma": "efd5d7617f4274be3d294ae450738411eb463b3ab1008153fac3ff0d1d9a41df",
    "src/distribution/distribution-row-builders.ts": "1a6cd60256492cb237f41b1b02e48c3739c186c8e8e371286d1ee67a64a1ca11",
    "src/distribution/post-distribution-service.ts": "a595b2d0fe2fb8671843474dc82914a01ff6408982651d0113045f8122e530dd",
    "src/editor-bench/large-library-chat.ts": "deb0265dd677642a59dcd3315aa7719278b5f1663bff3bcee0be054f6b567f49",
    "src/editor-bench/chat.ts": "c5251f327553bcd9d5f90198317a228d03290edfd495a7e0d74bfcc1cae1866d",
    "src/editor-bench/runtime.ts": "3be02e56889256ed38f731ec6c17a76a4bfcab0f5ffdb35574341438a82ef0d8"
  },
  "reports": {
    "outputs/editor-bench-gallery-allowance-blc04.json": "a94c5ab63af22ee7096118fda42e9d5b140e35b28b79c961b5b6d1ece1a20f3d",
    "outputs/editor-bench-gallery-allowance-proof.json": "38525165af9b21712ee5651c6fb0b2c5a9d7e587d1314165e3259cd63d1b1645",
    "outputs/editor-bench-large-library-chat-date-fix-proof.json": "94ae59530f63747521ff7648a946e3f63b413657aaf3af3a2908a15923460a16",
    "outputs/editor-bench-large-library-chat-date-recheck-blc02.json": "fdd6858a86fc9cb55fca33335529e91ec528dfd913f4267c8062291fc192d698",
    "outputs/editor-bench-large-library-chat-live.json": "41d0e1d5718d4babc4e0a90352f1e412f16de112631fb40379dbf2f314b84225",
    "outputs/editor-bench-large-library-chat-proof.json": "96c9905881c812bf2c77d01d7a1f2d3ed8e73146ec79023648be078b61554a48",
    "outputs/editor-bench-large-library-chat-wide-vocab-blc03.json": "25a4c3398eca68d29391eb96d83ea2caf33b2f27f7875d57897abf536751f064",
    "outputs/editor-bench-large-library-chat-wide-vocab-proof.json": "7c28ff900fb23eeaed88683bda1ef80d08ac0dfd50bd769b9c6bdb60e5f38763",
    "outputs/editor-bench-posting-variant-edit-proof.json": "dc1977c5eda34374d183aec652b534c81d92caf7ccbe9a0ab6295d76766573d7",
    "outputs/editor-bench-posting-variant-proof.json": "f1b830aa7b53002a3b07110b0226d34258635a0ea0062ad96d1959de0600d2f7"
  },
  "ledgerSha256": "9bac2e7527a1b69fe281e8af02596105261937dc41622e1b005b26c57f89a589"
};
const sha = x => createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const read = async path => JSON.parse(await readFile(path,'utf8'));
const protectedPaths = ['prisma/schema.prisma','src/distribution/distribution-row-builders.ts','src/distribution/post-distribution-service.ts','src/editor-bench/large-library-chat.ts','src/editor-bench/chat.ts','src/editor-bench/runtime.ts'];
const sourcePaths = ['src/editor-bench/variant-chat.ts','src/editor-bench/distribution-variant-adapter.ts','src/editor-bench/schedule-routes.ts','src/server.ts','tests/editor-bench/schedule-routes.test.ts','web/app/editor-bench/EditorBenchClient.tsx','web/lib/editor-bench.ts',...protectedPaths];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async p => [p,sha(await readFile(p))])));
for (const p of protectedPaths) assert.equal(sourceHashes[p],baseline.source[p],p);
const previousReportHashes = Object.fromEntries(await Promise.all(Object.keys(baseline.reports).map(async p => [p,sha(await readFile(p))])));
assert.deepEqual(previousReportHashes,baseline.reports);
const failurePath = 'outputs/editor-bench-posting-variant-chat-live-bpd03.json';
assert.equal(sha(await readFile(failurePath)),'6dc80db092d9518bd4b43b27712096e701a3c9e0ce3673aace0ec03a1238e77f');
const failure = await read(failurePath);
const preflight = await read('outputs/editor-bench-posting-variant-chat-preflight-bpd03.json');
const correctedPreflight = await read('outputs/editor-bench-posting-variant-chat-correction-preflight-bpd03.json');
const recheck = await read('outputs/editor-bench-posting-variant-chat-recheck-bpd03.json');
assert(preflight.passed && correctedPreflight.passed && recheck.passed && !failure.passed);
const rows = await read('.relay-data/gallery-editor-budget.json');
assert.equal(rows.length,894);
assert.equal(sha(rows.slice(0,891)),baseline.ledgerSha256);
const newRows=rows.slice(891);
assert(newRows.every(r=>r.phase==='development' && r.settled && r.actualUsd!==null));
const spent=r=>r.settled && r.actualUsd!==null?r.actualUsd:r.reservedUsd;
const dev=rows.filter(r=>r.phase==='development').reduce((s,r)=>s+spent(r),0);
const heldout=rows.filter(r=>r.phase==='heldout').reduce((s,r)=>s+spent(r),0);
const round=n=>Number(n.toFixed(8));
const report={
 ticket:'BPD-03',date:'2026-10-18',branch:'codex/conversational-gallery-editor',
 accepted:'Mock-only chat connection, source-reviewed composer wiring and bounded X runtime proof; broad language quality and frontend execution remain unverified',
 roles:{plan:'Sol High',implementation:'Luna High',acceptance:'root'},
 checks:{initialRootBackendTests:146,initialTestFiles:19,finalAffectedRouteTests:32,distinctBackendChecks:150,
 backendBuild:'passed by Luna after correction',cannedThreeTurnHttpProof:true,correctedCannedTwoTurnProof:true,
 liveInitialXReviewConfirm:true,liveCurrentRevisionXFollowup:true,deviantArt:'canned HTTP and backend only; not live-tested this slice',
 quotedLiteralUnicodePreserved:true,noWriteBeforeExplicitConfirm:true,originalAndSourcePinPreserved:true,
 appendOnlyRevisionHistory:true,currentRevisionAndRetryReuse:true,ownershipAndLinkGuards:true,byteLimitsAndNoHiddenTruncation:true,
 ambiguityAndLiteralGuards:true,providerFailureNoMutation:true,frontend:'source review only; tests/lint/typecheck/build/browser deferred',
 databaseOperations:0,publishCalls:0,apiRestart:false},
 firstFailure:{path:failurePath,preservedSha256:sha(await readFile(failurePath)),decision:'clarification',historicalCause:'unknown; original model output and question not retained',actualUsd:failure.ledger.actualUsd},
 correction:'Explicit response envelope, supported field mapping and distinct worked example; existing schema and literal/target/confirmation checks unchanged; bounded diagnostic stages added',
 reports:{preflight:'outputs/editor-bench-posting-variant-chat-preflight-bpd03.json',correctionPreflight:'outputs/editor-bench-posting-variant-chat-correction-preflight-bpd03.json',liveRecheck:'outputs/editor-bench-posting-variant-chat-recheck-bpd03.json'},
 budget:{authoritativeLedger:'C:\\Users\\jorda\\Documents\\Codex\\2026-10-11\\c\\work\\relay\\.relay-data\\gallery-editor-budget.json',
 calls:newRows.length,actualUsd:round(newRows.reduce((s,r)=>s+r.actualUsd,0)),reservationsUsd:round(newRows.reduce((s,r)=>s+r.reservedUsd,0)),maxCalls:3,maxReservationsUsd:0.03,
 ledgerRows:rows.length,developmentRemainingUsd:round(Math.min(15-dev,25-dev-heldout)),heldoutRemainingUsd:round(10-heldout),previous891RowsUnchanged:true,ledgerSha256:sha(rows)},
 limitations:['Temporary API-instance mock drafts/history; running API not restarted','One quoted X posting-text or DeviantArt title replacement per request, <=200 trimmed UTF-16 code units','Complete candidate metadata <=8KiB; full input/tools/schema <=16KiB; oversized requests clarify','No AI rewriting, new field edits, source rebase, real Library activation, production persistence, billing or autonomous publishing','Two passing live X turns demonstrate those cases, not general natural-language reliability','Frontend source-only acceptance; no browser journey is claimed'],
 protectedSourceUnchanged:protectedPaths,sourceHashes,previousReportHashes,previous10ReportsUnchanged:true
};
assert(report.budget.calls<=3 && report.budget.reservationsUsd<=0.03);
await writeFile('outputs/editor-bench-posting-variant-chat-proof.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({accepted:report.accepted,checks:report.checks,budget:report.budget}));

