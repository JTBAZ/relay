import fs from 'node:fs';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import ts from 'typescript';
const baseline=JSON.parse(fs.readFileSync('work/bgb01-baseline/baseline.json','utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const approved=['src/editor-bench/conversation.ts','src/editor-bench/schedule-routes.ts','web/lib/editor-bench.ts','web/app/editor-bench/EditorBenchClient.tsx','tests/editor-bench/conversation.test.ts'];
const added=process.argv.slice(2);
const gitArgs=['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'-c','core.whitespace=cr-at-eol','-c','core.autocrlf=false'];
const git=a=>cp.execFileSync('git',[...gitArgs,...a],{encoding:'utf8'}).trim();
const scope={};
for(const p of approved){
  if(hash(p)===baseline.source[p])continue;
  const r=cp.spawnSync('git',[...gitArgs,'diff','--no-index','--unified=0','--','work/bgb01-baseline/'+p,p],{encoding:'utf8'});
  if(r.status!==1)throw Error('Expected scoped diff '+p);
  const check=cp.spawnSync('git',[...gitArgs,'diff','--no-index','--check','--','work/bgb01-baseline/'+p,p],{encoding:'utf8'});
  if(check.stdout.trim()||check.stderr.trim()||check.status>1)throw Error('Whitespace check '+p+': '+check.stdout+check.stderr);
  scope[p]={sha256:hash(p),hunks:r.stdout.split(/\r?\n/).filter(line=>line.startsWith('@@'))};
}
for(const p of added){if(baseline.source[p])throw Error('Not new '+p);scope[p]={sha256:hash(p),newFile:true};}
const changedOutsideScope=Object.entries(baseline.source).filter(([p,h])=>!approved.includes(p)&&!p.startsWith('docs/')&&hash(p)!==h).map(([p])=>p);
const source=ts.createSourceFile('EditorBenchClient.tsx',fs.readFileSync('web/app/editor-bench/EditorBenchClient.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
if(source.parseDiagnostics.length)throw Error('One-file TSX syntax diagnostics: '+JSON.stringify(source.parseDiagnostics.map(d=>d.messageText)));
for(const[p,h]of Object.entries(baseline.reports))if(hash(p)!==h)throw Error('Prior report modified '+p);
const ledger=JSON.parse(fs.readFileSync('.relay-data/gallery-editor-budget.json','utf8'));
const ledgerHash=crypto.createHash('sha256').update(JSON.stringify(ledger)).digest('hex');
if(ledgerHash!==baseline.ledger.sha256)throw Error('Ledger changed');
const config=JSON.parse(fs.readFileSync('work/bgb01-config-before.json','utf8'));
for(const[p,h]of Object.entries(config.hashes))if(hash(p)!==h)throw Error('Configuration modified '+p);
const unchangedEvidencePaths=['src/editor-bench/distribution-variant-adapter.ts','src/distribution/distribution-package.ts','tests/distribution-package.test.ts','web/lib/relay-extension-messaging.ts'];
for(const p of unchangedEvidencePaths)if(hash(p)!==baseline.source[p])throw Error('Expected unchanged connected path '+p);
const extensionSourcePaths=Object.keys(baseline.source).filter(p=>p.startsWith('extension/'));
for(const p of extensionSourcePaths)if(hash(p)!==baseline.source[p])throw Error('Unexpected extension modification '+p);
const result={ticket:'BGB-01',branch:git(['branch','--show-current']),head:git(['rev-parse','HEAD']),baselineHead:baseline.head,scope,changedOutsideScope,protectedSourceCount:Object.entries(baseline.source).filter(([p,h])=>hash(p)===h).length,tsxParseDiagnostics:0,taskWhitespace:true,priorReportsPreserved:Object.keys(baseline.reports).length,ledger:{...baseline.ledger,sha256:ledgerHash},unchangedEvidencePaths,extensionSourcesUnchanged:extensionSourcePaths.length,configurationHashesUnchanged:true,paidCalls:0};
const out=fs.openSync('work/bgb01-final-audit.json','wx');fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');fs.closeSync(out);
console.log(JSON.stringify({branch:result.branch,head:result.head,scopedPaths:Object.keys(scope),changedOutsideScope,priorReportsPreserved:result.priorReportsPreserved,tsxParseDiagnostics:0,ledgerUnchanged:true,extensionSourcesUnchanged:extensionSourcePaths.length}));
