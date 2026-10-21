import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const hash = path => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const file = 'src/distribution/distribution-package.ts';
const expected = JSON.parse(readFileSync(resolve(root, 'work/pcb-final-baseline/baseline.json'))).source[file];
const before = hash(file);
if (before !== expected) { console.log('Package implementation already changed; baseline run skipped.'); process.exit(0); }
const prefix = `work/pcb06-package-baseline-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`;
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/distribution-package.test.ts', '--reporter=json', `--outputFile=${prefix}.json`], { cwd: root, env: { ...process.env, OPENAI_API_KEY: '', DOTENV_CONFIG_QUIET: 'true' }, shell: false, windowsHide: true, encoding: 'utf8', timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
writeFileSync(resolve(root, `${prefix}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`, { flag: 'wx' });
const report = { exitCode: result.status, report: `${prefix}.json`, log: `${prefix}.log`, sourceUnchangedDuringRun: hash(file) === before };
writeFileSync(resolve(root, `${prefix}.exit.json`), JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify(report));
