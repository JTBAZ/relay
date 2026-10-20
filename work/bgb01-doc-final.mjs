import fs from 'node:fs';
import crypto from 'node:crypto';
const paths=['docs/relay-cheaper-model-handoff.md',...['WORK-ITEMS.md','DISPATCH.md','README.md','EDITOR-BENCH-PLAN.md'].map(p=>'docs/conversational-planning/'+p)];
const replacements=[['same3','same three'],['exit0','exit 0'],['API8788','API 8788'],['PID47096','PID 47096'],['health200','health 200'],['unauthenticated401','unauthenticated 401'],['targets8788','targets 8788'],['all55','all 55'],['after2 hours','after 2 hours'],['Current16 posts ×2 destinations,32','Current 16 posts × 2 destinations, 32'],['tokens,1 MiB','tokens, 1 MiB'],['API and1,024','API and 1,024'],['ledger remains903','ledger remains 903'],['ledger903','ledger 903'],['All64','All 64']];
const hashes={};
for(const p of paths){const text=fs.readFileSync(p,'utf8'),at=text.indexOf('**BDA-01');if(at<0)throw Error('Missing history marker '+p);let prefix=text.slice(0,at);for(const[a,b]of replacements)prefix=prefix.replaceAll(a,b);prefix=prefix.replaceAll('\\\\','\\');const next=prefix+text.slice(at);fs.writeFileSync(p,next);if(!next.endsWith(text.slice(at)))throw Error('History changed');hashes[p]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
fs.writeFileSync('work/bgb01-documentation-final.json',JSON.stringify({hashes,historySuffixesPreserved:true,originalExternalPathsPreserved:true},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({documents:paths.length,historyPreserved:true}));
