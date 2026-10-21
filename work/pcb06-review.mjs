import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const files = ['src/distribution/conversation-draft-variants.ts','src/editor-bench/real-library-conversation-routes.ts','src/gallery-editor/types.ts','src/distribution/distribution-package.ts','src/distribution/post-distribution-service.ts','src/server.ts','src/extension/cross-post-media-entries.ts','extension/src/lib/cross-post-fetch.ts','extension/src/lib/cross-post-flow.ts','extension/src/lib/cross-post-tab-inject.ts','extension/src/lib/managed-cross-post-handoff.ts','extension/src/content/fill-x-compose.ts','extension/src/content/fill-deviantart-submit.ts','tests/editor-bench/real-library-draft-variants-postgres.integration.test.ts'];
const git = ['-c',`safe.directory=${root.replaceAll('\\','/')}`,'-c','core.autocrlf=false','-c','core.whitespace=cr-at-eol','diff','--no-index'];
let patch = '', whitespace = '', excludedServerHunks = 0;
for (const file of files) {
  const before = ['work/pcb05-accepted','work/pcb04-accepted','work/pcb-final-baseline'].map(dir => resolve(root,dir,file)).find(existsSync), after = resolve(root,file);
  if (before) {
    let delta = spawnSync('git',[...git,'--ignore-space-at-eol','--',before,after],{cwd:root,encoding:'utf8',shell:false,windowsHide:true}).stdout ?? '';
    if(file === 'src/server.ts') {
      const parts = delta.split(/(?=^@@ )/m), header = parts.shift() ?? '';
      const owned = parts.filter(hunk => /extensionAccount|handoffR2|managed_handoff_v1|creatorId: extensionCreatorId/.test(hunk));
      excludedServerHunks = parts.length - owned.length;
      delta = header + owned.join('');
    }
    patch += delta;
    whitespace += spawnSync('git',[...git,'--check','--',before,after],{cwd:root,encoding:'utf8',shell:false,windowsHide:true}).stdout ?? '';
  } else patch += `\nNEW FILE ${file}\n${readFileSync(after,'utf8')}\n`;
}
const prefix = `work/pcb06-review-${new Date().toISOString().replaceAll(/[:.]/g,'-')}`;
writeFileSync(resolve(root,`${prefix}.diff`),patch,{flag:'wx'});
writeFileSync(resolve(root,`${prefix}.json`),JSON.stringify({files,hunkScope:{'src/server.ts':'Only existing /api/v1/extension/cross-post/attempts/:attempt_id route; concurrent Patreon/session hunks are excluded.'},excludedServerHunks,patch:`${prefix}.diff`,whitespace},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({scope:`${prefix}.json`,files:files.length,whitespace}));
