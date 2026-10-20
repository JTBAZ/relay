import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const baseline=JSON.parse(await readFile('work/bpv01-baseline/baseline.json','utf8'));
const sha=v=>createHash('sha256').update(v).digest('hex');
const changed=[];let diff='';
for(const [path,before] of Object.entries(baseline.source)){
 const data=await readFile(path);if(sha(data)===before)continue;
 changed.push(path);
 const result=spawnSync('git',['diff','--no-index','--',`work/bpv01-baseline/${path}`,path],{encoding:'utf8'});
 if(result.status!==1)throw Error(`${path}: unexpected diff status ${result.status}`);
 diff+=result.stdout;
}
await writeFile('work/bpv01-task.diff',diff);
await writeFile('work/bpv01-changed-files.json',JSON.stringify(changed,null,2));
process.stdout.write(JSON.stringify(changed));
