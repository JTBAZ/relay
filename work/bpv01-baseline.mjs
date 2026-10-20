import { mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = 'work/bpv01-baseline';
await mkdir(root);
const sha = v => createHash('sha256').update(v).digest('hex');
const walk = async dir => (await Promise.all((await readdir(dir,{withFileTypes:true})).map(async e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))).flat();
const previous = JSON.parse(await readFile('work/bpc01-baseline/baseline.json','utf8'));
const paths = new Set([...Object.keys(previous.source), ...await walk('src/editor-bench'), ...await walk('tests/editor-bench'), ...await walk('web/app/components/previewizer'),
 'web/lib/previewizer-template-config.ts','web/lib/studio-session-context.tsx','web/app/layout.tsx','web/app/editor-bench/page.tsx',
 ...['README.md','WORK-ITEMS.md','DISPATCH.md','EDITOR-BENCH-PLAN.md','BENCH-PREPARATION-CONTEXT-PLAN.md'].map(p=>`docs/conversational-planning/${p}`),'docs/relay-cheaper-model-handoff.md']);
const source={};
for (const path of [...paths].sort()) {const data=await readFile(path);source[path]=sha(data);await mkdir(dirname(`${root}/${path}`),{recursive:true});await copyFile(path,`${root}/${path}`);}
const reports={};
for(const p of (await readdir('outputs')).filter(p=>p.startsWith('editor-bench-')&&p.endsWith('.json')))reports[`outputs/${p}`]=sha(await readFile(`outputs/${p}`));
const rows=JSON.parse(await readFile('.relay-data/gallery-editor-budget.json','utf8'));
const remaining=phase=>(phase==='development'?15:10)-rows.filter(r=>r.phase===phase).reduce((s,r)=>s+(r.settled&&r.actualUsd!==null?r.actualUsd:r.reservedUsd),0);
const ledger={rows:rows.length,sha256:sha(JSON.stringify(rows)),developmentRemainingUsd:+remaining('development').toFixed(8),heldoutRemainingUsd:+remaining('heldout').toFixed(8)};
const git=args=>execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,...args],{encoding:'utf8'}).trim();
await writeFile(`${root}/baseline.json`,JSON.stringify({head:git(['rev-parse','HEAD']),branch:git(['branch','--show-current']),source,reports,ledger},null,2));
process.stdout.write(JSON.stringify({sourceFiles:paths.size,reports:Object.keys(reports).length,ledger}));
