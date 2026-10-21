import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const files = ['src/distribution/conversation-draft-variants.ts','src/editor-bench/real-library-conversation-routes.ts','src/gallery-editor/types.ts','src/distribution/schedule-rail-service.ts','src/goal-cycle/planner/schedule-local.ts','tests/editor-bench/real-library-draft-variants-postgres.integration.test.ts','tests/goal-cycle/schedule-local.test.ts','tests/schedule-rail-service.test.ts'];
const git = ['-c',`safe.directory=${root.replaceAll('\\','/')}`,'-c','core.autocrlf=false','-c','core.whitespace=cr-at-eol','diff','--no-index'];
let patch = '', whitespace = '';
for (const file of files) {
  const before = resolve(root,'work/pcb04-accepted',file), after = resolve(root,file);
  if (existsSync(before)) {
    patch += spawnSync('git',[...git,'--ignore-space-at-eol','--',before,after],{cwd:root,encoding:'utf8',shell:false,windowsHide:true}).stdout ?? '';
    whitespace += spawnSync('git',[...git,'--check','--',before,after],{cwd:root,encoding:'utf8',shell:false,windowsHide:true}).stdout ?? '';
  } else patch += `\nNEW FILE ${file}\n${readFileSync(after,'utf8')}\n`;
}
const prefix = `work/pcb05-review-${new Date().toISOString().replaceAll(/[:.]/g,'-')}`;
writeFileSync(resolve(root,`${prefix}.diff`),patch,{flag:'wx'});
writeFileSync(resolve(root,`${prefix}.json`),JSON.stringify({files,patch:`${prefix}.diff`,whitespace},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({scope:`${prefix}.json`,files:files.length,whitespace}));
