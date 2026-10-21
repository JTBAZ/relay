import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const prefix = `work/pcb06-root-tests-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`;
const files = [
  'tests/editor-bench/real-library-conversation-routes.test.ts',
  'tests/editor-bench/conversation.test.ts',
  'tests/post-distribution-identity.test.ts',
  'tests/post-distribution-promo-instance.test.ts',
  'tests/distribution-package.test.ts',
  'tests/distribution-media-binding.test.ts',
  'tests/extension-cross-post-package.test.ts',
  'tests/extension-cross-post-x-package.test.ts',
  'tests/extension-cross-post-deviantart-package.test.ts',
  'tests/extension-consent-flow.test.ts',
  'tests/auth/extension-consent-code.test.ts'
];
const env = { ...process.env, OPENAI_API_KEY: '', DOTENV_CONFIG_QUIET: 'true' };
delete env.GALLERY_EDITOR_TEST_DATABASE_URL;
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', ...files, '--reporter=json', `--outputFile=${prefix}.json`], { cwd: root, env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
writeFileSync(resolve(root, `${prefix}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`, { flag: 'wx' });
const record = { files, exitCode: result.status, error: result.error?.code ?? null, report: `${prefix}.json`, log: `${prefix}.log` };
writeFileSync(resolve(root, `${prefix}.exit.json`), JSON.stringify(record, null, 2), { flag: 'wx' });
console.log(JSON.stringify(record));
if (result.status !== 0) process.exitCode = 1;
