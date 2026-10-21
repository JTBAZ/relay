import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const files = ['src/editor-bench/real-library-conversation-routes.ts','src/editor-bench/real-library-preview-export.ts','src/gallery-editor/types.ts','src/server.ts','src/storage/relay-upload-r2.ts','tests/editor-bench/real-library-preview-export-postgres.integration.test.ts','tests/relay-upload-r2.test.ts'];
const git = ['-c',`safe.directory=${root.replaceAll('\\','/')}`,'-c','core.autocrlf=false','-c','core.whitespace=cr-at-eol','diff','--no-index'];
let patch = '', whitespace = '';
for (const file of files) {
  const before = resolve(root,'work/pcb03-baseline',file), after = resolve(root,file);
  if (existsSync(before)) {
    patch += spawnSync('git',[...git,'--ignore-space-at-eol','--',before,after],{cwd:root,encoding:'utf8',shell:false,windowsHide:true}).stdout ?? '';
    whitespace += spawnSync('git',[...git,'--check','--',before,after],{cwd:root,encoding:'utf8',shell:false,windowsHide:true}).stdout ?? '';
  } else patch += `\nNEW FILE ${file}\n${readFileSync(after,'utf8')}\n`;
}
const prefix = `work/pcb03-review-${new Date().toISOString().replaceAll(/[:.]/g,'-')}`;
writeFileSync(resolve(root,`${prefix}.diff`),patch,{flag:'wx'});
writeFileSync(resolve(root,`${prefix}.json`),JSON.stringify({files,patch:`${prefix}.diff`,whitespace},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({scope:`${prefix}.json`,files:files.length,whitespace}));
