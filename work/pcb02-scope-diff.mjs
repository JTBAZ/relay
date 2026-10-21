import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const files = [
  'src/editor-bench/conversation.ts', 'src/editor-bench/library-selection-catalog.ts',
  'src/editor-bench/real-library-conversation-routes.ts', 'src/editor-bench/real-library-edit-review.ts',
  'src/gallery-editor/service.ts', 'src/gallery-editor/types.ts', 'src/gallery-editor/routes.ts', 'src/server.ts',
  'tests/editor-bench/real-library-conversation-routes.test.ts',
  'tests/editor-bench/real-library-conversation-postgres.integration.test.ts'
];
const args = ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-c', 'core.autocrlf=false', '-c', 'core.whitespace=cr-at-eol', 'diff', '--no-index'];
let patch = '', whitespace = '';
for (const file of files) {
  const before = resolve(root, 'work/pcb02-baseline', file), after = resolve(root, file);
  if (existsSync(before)) {
    const diff = spawnSync('git', [...args, '--', before, after], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
    patch += diff.stdout ?? '';
    const check = spawnSync('git', [...args, '--check', '--', before, after], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
    whitespace += check.stdout ?? '';
  } else patch += `\nNEW FILE: ${file}\n${readFileSync(after, 'utf8')}\n`;
}
const prefix = `work/pcb02-review-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`;
writeFileSync(resolve(root, `${prefix}.diff`), patch, { flag: 'wx' });
writeFileSync(resolve(root, `${prefix}.json`), JSON.stringify({ files, patch: `${prefix}.diff`, whitespace }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ files: files.length, patch: `${prefix}.diff`, whitespace }));
