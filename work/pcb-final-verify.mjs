import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname,'..'), read = path => readFileSync(resolve(root,path)), json = path => JSON.parse(read(path));
const sha = value => createHash('sha256').update(value).digest('hex');
const audit = json('work/pcb-final-audit-latest.json'), report = json('outputs/editor-bench-product-handoff-proof-pcb06.json');
assert.equal(audit.ledger.unchanged,true); assert.deepEqual(audit.changedConfiguration,[]); assert.deepEqual(audit.changedPriorReports,[]);
for(const [file, hash] of Object.entries(report.sourceHashes)) assert.equal(sha(read(file)),hash,`Current source drift: ${file}`);
for(const phase of ['04','05']) {
  const file = `outputs/editor-bench-product-${phase === '04' ? 'drafts' : 'schedule'}-proof-pcb${phase}.json`, prior = json(file);
  assert.equal(sha(read(file)),report.preservation.priorTicketReports[file]);
  for(const [source, hash] of Object.entries(prior.sourceHashes)) assert.equal(sha(read(`work/pcb${phase}-accepted/${source}`)),hash);
}
const docs = ['docs/relay-cheaper-model-handoff.md','docs/conversational-planning/README.md','docs/conversational-planning/DISPATCH.md','docs/conversational-planning/EDITOR-BENCH-PLAN.md','docs/conversational-planning/WORK-ITEMS.md','docs/conversational-planning/PRODUCT-CONVERSATION-CONNECTION-PLAN.md'];
for(const doc of docs) {
  const before = resolve(root,'work/pcb-final-baseline',doc);
  assert.ok(existsSync(before));
  const checked = spawnSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'-c','core.autocrlf=false','-c','core.whitespace=cr-at-eol','diff','--no-index','--check','--',before,resolve(root,doc)],{cwd:root,encoding:'utf8',shell:false,windowsHide:true});
  assert.equal(checked.stdout,'',doc); assert.ok(checked.status === 0 || checked.status === 1,doc);
  assert.ok(read(doc).toString().includes('PCB-01 through PCB-06 backend delivery accepted'));
}
const handoff = read(docs[0]).toString();
for(const name of ['relay-implementation-report.md','relay-ce02-v2-semantic-review.md','relay-demo-test-flight.md','relay-evaluation-cost-summary.json']) assert.ok(handoff.includes(`C:/Users/jorda/Documents/Codex/2026-10-11/c/outputs/${name}`));
const record = {date:'2026-10-21',accepted:['PCB-04','PCB-05','PCB-06'],sourceSnapshotFiles:Object.keys(report.sourceHashes).length,priorReportCount:audit.priorReportCount,priorReportsUnchanged:true,phase04And05ReportsAndSnapshotsUnchanged:true,environmentUnchanged:true,ledger:audit.ledger,documentationFiles:docs,externalReportLinksPreserved:true,concurrentExcludedWork:'Patreon/auth/extension and schema changes outside the PCB task were preserved; only the scoped route/protocol hunks are accepted.',deferred:'Product mounting, frontend/extension build/typecheck/runtime, actual-account/live R2 and installed destination validation.',paidCalls:0};
writeFileSync(resolve(root,'work/pcb-final-verification.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(record));
