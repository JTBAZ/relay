import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..'), base = resolve(root, 'work/pcb-final-baseline');
if (existsSync(base)) throw new Error('PCB03 baseline already exists');
mkdirSync(base);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [];
function walk(path) { for (const item of readdirSync(resolve(root, path), { withFileTypes: true })) { const file = `${path}/${item.name}`; if (item.isDirectory()) walk(file); else if (/\.(ts|tsx|json|md|prisma)$/.test(file)) files.push(file); } }
for (const path of ['src/editor-bench','src/gallery-editor','src/distribution','src/relay','src/storage','src/extension','extension/src','tests/editor-bench','docs/conversational-planning']) walk(path);
files.push('src/server.ts','prisma/schema.prisma','docs/relay-cheaper-model-handoff.md','web/lib/previewizer-session.ts','web/app/components/previewizer/previewizer-client.tsx','web/app/components/distribution/PreviewizerOverlay.tsx');
for (const file of readdirSync(resolve(root, 'tests'))) if (/gallery-editor|preview-template|relay.*upload|media.*storage|distribution|postbot|schedule-rail|extension/.test(file) && file.endsWith('.ts')) files.push(`tests/${file}`);
const source = {};
for (const file of new Set(files)) { source[file] = sha(readFileSync(resolve(root, file))); const target = resolve(base, file); mkdirSync(dirname(target), { recursive: true }); copyFileSync(resolve(root, file), target); }
const reports = {};
for (const file of readdirSync(resolve(root, 'outputs'))) if (file.startsWith('editor-bench-') && /\.(json|ndjson)$/.test(file)) reports[`outputs/${file}`] = sha(readFileSync(resolve(root, 'outputs', file)));
const config = {};
for (const file of ['.env','web/.env.local']) if (existsSync(resolve(root,file))) config[file] = sha(readFileSync(resolve(root,file)));
const ledger = JSON.parse(readFileSync(resolve(root,'.relay-data/gallery-editor-budget.json')));
const git = (...args) => execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{cwd:root,encoding:'utf8'}).trim();
const snapshot = { branch:git('rev-parse','--abbrev-ref','HEAD'), head:git('rev-parse','HEAD'), source, reports, config, ledger:{rows:ledger.length, sha256:sha(JSON.stringify(ledger))} };
writeFileSync(resolve(base,'baseline.json'),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({ files:Object.keys(source).length, reports:Object.keys(reports).length, branch:snapshot.branch, head:snapshot.head, ledger:snapshot.ledger }));
