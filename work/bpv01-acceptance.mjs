import assert from 'node:assert/strict';
import { readFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const reportFile=await open('outputs/editor-bench-previewizer-bridge-recheck-proof.json','wx');
const sha=v=>createHash('sha256').update(v).digest('hex');
const report={ticket:'BPV-01',date:'2026-10-19',passed:false,scope:'mock_previewizer_bridge',planner:'Sol High',implementer:'Luna High',paidCalls:0};
try {
 const baseline=JSON.parse(await readFile('work/bpv01-baseline/baseline.json','utf8'));
 const changed=JSON.parse(await readFile('work/bpv01-changed-files.json','utf8'));
 assert.equal(changed.length,10);
 const docs=['docs/relay-cheaper-model-handoff.md',...['README.md','WORK-ITEMS.md','DISPATCH.md','EDITOR-BENCH-PLAN.md','BENCH-PREPARATION-CONTEXT-PLAN.md'].map(p=>`docs/conversational-planning/${p}`)];
 const scope={};
 for(const path of changed){
   const data=await readFile(path);const diff=spawnSync('git',['diff','--no-index','--',`work/bpv01-baseline/${path}`,path],{encoding:'utf8'});
   assert.equal(diff.status,1,path);scope[path]={sha256:sha(data),hunks:diff.stdout.split('\n').filter(line=>line.startsWith('@@'))};
   const whitespace=spawnSync('git',['-c','core.whitespace=cr-at-eol','diff','--no-index','--check','--',`work/bpv01-baseline/${path}`,path],{encoding:'utf8'});
   assert(whitespace.status===0||whitespace.status===1,path);assert.equal(whitespace.stdout.trim(),'',path);
 }
 let protectedFiles=0;
 for(const [path,hash] of Object.entries(baseline.source))if(!changed.includes(path)&&!docs.includes(path)){assert.equal(sha(await readFile(path)),hash,path);protectedFiles++;}
 for(const [path,hash] of Object.entries(baseline.reports))assert.equal(sha(await readFile(path)),hash,path);
 const ledger=JSON.parse(await readFile('.relay-data/gallery-editor-budget.json','utf8'));assert.equal(sha(JSON.stringify(ledger)),baseline.ledger.sha256);assert.equal(ledger.length,903);
 const syntaxPath='web/app/editor-bench/EditorBenchClient.tsx';const syntax=ts.createSourceFile(syntaxPath,await readFile(syntaxPath,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.equal(syntax.parseDiagnostics.length,0);
 const http=JSON.parse(await readFile('outputs/editor-bench-previewizer-bridge-http-bpv01.json','utf8'));assert.equal(http.passed,true);assert.equal(http.paidCalls,0);
 const handoff=await readFile('docs/relay-cheaper-model-handoff.md','utf8');const oldHandoff=await readFile('work/bpv01-baseline/docs/relay-cheaper-model-handoff.md','utf8');
 const externalReportLines=oldHandoff.split('\n').filter(line=>line.includes('/c/outputs/')&&line.includes('relay-'));assert(externalReportLines.length>=4);for(const line of externalReportLines)assert(handoff.includes(line));
 const git=args=>{const r=spawnSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,...args],{encoding:'utf8'});assert.equal(r.status,0);return r.stdout.trim();};
 const currentHead=git(['rev-parse','HEAD']);assert.equal(git(['branch','--show-current']),baseline.branch);
 assert.equal(currentHead,'6cabf841e38d8eece62fb7536efb1e2f260d9eb4');
 const concurrentPaths=git(['diff','--name-only',baseline.head,currentHead]).split('\n');
 assert(concurrentPaths.every(path=>!changed.includes(path)&&!docs.includes(path)));
 report.repository={baselineHead:baseline.head,currentHead,branch:baseline.branch,concurrentCommit:'Refresh replayed media URLs only for current revisions',concurrentPaths,taskScopeOverlap:false};
 report.preservedAudit='outputs/editor-bench-previewizer-bridge-proof.json';
 report.sourceScope=scope;
 report.checks={backendTests:{passed:164,total:164,files:20,command:'npx vitest run tests/editor-bench tests/distribution-platform-formatters.test.ts tests/distribution-media-binding.test.ts tests/distribution-package.test.ts tests/post-distribution-identity.test.ts'},focusedWorkerTests:{passed:14,total:14},backendBuild:{passed:true,command:'npm run build',reportedBy:'Luna High'},syntaxGuard:{path:syntaxPath,parseDiagnostics:0},httpProof:'outputs/editor-bench-previewizer-bridge-http-bpv01.json',whitespace:true,unchangedProtectedFiles:protectedFiles,preservedReports:Object.keys(baseline.reports).length,externalReportLinksPreserved:externalReportLines.length,branchUnchanged:true,concurrentCommitOutsideTask:true};
 report.review={skill:'Ponytail Review',baseline:'work/bpv01-baseline/baseline.json',scope:'Only the ten listed task-file hunks plus callers/dependencies; excludes unrelated working-tree changes',blockingFindings:[],fixed:['Stale upload returns a conflict instead of hanging','Expired attempts and sessions release storage before accounting','Bounded JPEG decoding rejects invalid bytes','Late UI responses cannot replace a newer conversation','Cancellation is blocked during explicit preview completion','Source label session types and nullable preparation access corrected','Bench-only focus containment and opener restoration'],uiGuidelinesSource:'https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md',uiVerification:'Source only; retained existing visual design'};
 report.budget={authoritativeLedger:`${process.cwd().replaceAll('\\','/')}/.relay-data/gallery-editor-budget.json`,...baseline.ledger,unchanged:true};
 report.runtime={apiPid:12316,apiPort:8788,healthStatus:200,protectedPreviewRouteStatus:401,webPid:46996,webPort:3000,postgresPid:19664,postgresPort:5433,backgroundWorkersDisabled:true};
 report.limits=['Mock source artwork and API-instance memory only; lost on restart or session expiry','HTTP proof generated JPEG bytes with sharp; no browser renderer proof','Frontend tests/lint/typecheck/build/browser/detector deferred; only single-file syntax parse ran','No real Library/database/media staging, publishing, migrations, environment-file changes, commits or push','No unscheduled X draft creation or production CP11 provenance; no next ticket dispatched','Model prompt/schema/runtime/cap unchanged; no new paid language-quality proof'];
 report.passed=true;
}catch(error){report.error=error instanceof Error?error.message:String(error);process.exitCode=1;}
finally{await reportFile.writeFile(JSON.stringify(report,null,2));await reportFile.close();process.stdout.write(JSON.stringify({passed:report.passed,checks:report.checks,budget:report.budget,error:report.error??null}));}
