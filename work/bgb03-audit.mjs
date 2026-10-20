import fs from 'node:fs';
import cp from 'node:child_process';
import {createHash} from 'node:crypto';
const baseline=JSON.parse(fs.readFileSync('work/bgb03-baseline/baseline.json','utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const args=['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'-c','core.autocrlf=false','-c','core.whitespace=cr-at-eol'];
const scope={};
for(const p of ['src/editor-bench/conversation.ts','tests/editor-bench/conversation.test.ts']){
  const diff=cp.spawnSync('git',[...args,'diff','--no-index','--unified=0','--','work/bgb03-baseline/'+p,p],{encoding:'utf8'});
  if(diff.status!==1)throw Error('Expected scoped change '+p);
  const check=cp.spawnSync('git',[...args,'diff','--no-index','--check','--','work/bgb03-baseline/'+p,p],{encoding:'utf8'});
  if(check.status>1||check.stdout.trim()||check.stderr.trim())throw Error('Whitespace check '+p+': '+check.stdout+check.stderr);
  scope[p]={sha256:hash(p),hunks:diff.stdout.split(/\r?\n/).filter(line=>line.startsWith('@@'))};
}
for(const[p,h]of Object.entries(baseline.reports))if(hash(p)!==h)throw Error('Prior evidence changed '+p);
for(const[p,h]of Object.entries(baseline.configHashes))if(hash(p)!==h)throw Error('Configuration changed '+p);
const ledger=JSON.parse(fs.readFileSync('.relay-data/gallery-editor-budget.json','utf8'));
if(createHash('sha256').update(JSON.stringify(ledger)).digest('hex')!==baseline.ledger.sha256)throw Error('Paid transport ran before preflight/audit');
const unexpected=Object.entries(baseline.source).filter(([p,h])=>!Object.hasOwn(scope,p)&&!p.startsWith('docs/')&&hash(p)!==h).map(([p])=>p);
const extensionPaths=Object.keys(baseline.source).filter(p=>p.startsWith('extension/'));for(const p of extensionPaths)if(hash(p)!==baseline.source[p])throw Error('Extension source changed '+p);
const git=a=>cp.execFileSync('git',[...args,...a],{encoding:'utf8'}).trim();
const report={ticket:'BGB-03',branch:git(['branch','--show-current']),head:git(['rev-parse','HEAD']),baselineHead:baseline.head,scope,unexpectedChanges:unexpected,priorEvidenceFilesPreserved:Object.keys(baseline.reports).length,configurationUnchanged:true,ledgerBeforePaid:baseline.ledger,extensionPathsUnchanged:extensionPaths.length,taskWhitespace:true};
fs.writeFileSync('work/bgb03-prelive-audit.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
