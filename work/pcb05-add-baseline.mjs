import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const files = ['src/goal-cycle/planner/schedule-local.ts', 'tests/goal-cycle/schedule-local.test.ts'];
const hashes = {};
for (const file of files) {
  const bytes = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'show', `HEAD:${file}`], { cwd: root, windowsHide: true });
  const target = resolve(root, 'work/pcb04-accepted', file);
  mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes, { flag: 'wx' });
  hashes[file] = createHash('sha256').update(bytes).digest('hex');
}
writeFileSync(resolve(root, 'work/pcb05-additional-baseline.json'), JSON.stringify({ reason: 'These two tracked files were clean in the initial git status and outside the initial snapshot directories; capture their unchanged HEAD as the pre-PCB05 source.', files: hashes }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ captured: files }));
