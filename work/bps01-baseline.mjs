import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const old=JSON.parse(fs.readFileSync('work/bpx01-baseline/baseline.json','utf8'));
const files=[...new Set([...Object.keys(old.source),'src/distribution/creator-schedule-event-service.ts','src/distribution/creator-schedule-event-contract.ts','src/distribution/distribution-package.ts','tests/distribution-package.test.ts','tests/helpers/distribution-media-pair.ts','src/conversational-planning/calendar-resolver.ts','tests/conversational-planning/calendar-resolver.test.ts','docs/conversational-planning/BENCH-PREVIEWIZER-X-DRAFT-PLAN.md'])].filter(p=>fs.existsSync(p));
const dest='work/bps01-baseline'; fs.mkdirSync(dest,{recursive:false});
const source={};for(const p of files){const d=path.join(dest,p);fs.mkdirSync(path.dirname(d),{recursive:true});fs.copyFileSync(p,d);source[p]=hash(p);}
const reports=Object.fromEntries(fs.readdirSync('outputs').filter(p=>/^editor-bench-.*\.json$/.test(p)).map(p=>['outputs/'+p,hash('outputs/'+p)]));
const ledger=JSON.parse(fs.readFileSync('.relay-data/gallery-editor-budget.json','utf8'));
const ledgerHash=crypto.createHash('sha256').update(JSON.stringify(ledger)).digest('hex');
if(ledgerHash!==old.ledger.sha256)throw Error('Budget changed; inspect before any paid call.');
const git=a=>cp.execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),...a],{encoding:'utf8'}).trim();
const baseline={head:git(['rev-parse','HEAD']),branch:git(['branch','--show-current']),source,reports,ledger:old.ledger};
fs.writeFileSync(dest+'/baseline.json',JSON.stringify(baseline,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:files.length,reports:Object.keys(reports).length,head:baseline.head,ledgerRows:baseline.ledger.rows,ledgerUnchanged:true}));
