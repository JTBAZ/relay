import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
import { createDisposableDatabase, getDisposableDatabaseUrl, dropDisposableDatabase } from '../scripts/conversational-plan-test-db.mjs';

const root = resolve(import.meta.dirname, '..');
const config = parse(readFileSync(resolve(root, '.env')));
const runId = new Date().toISOString().replaceAll(/[:.]/g, '-');
const prefix = resolve(root, `work/pcb04-postgres-${runId}`);
const record = { migrations: null, tests: null, cleanup: null };
const handle = await createDisposableDatabase({ bootstrapUrl: process.env.CONVERSATIONAL_PLAN_TEST_BOOTSTRAP_URL || config.DATABASE_URL, ordinaryDatabaseUrl: config.DATABASE_URL });
const databaseUrl = getDisposableDatabaseUrl(handle);
const env = { ...process.env };
const removed = new Set(['CONVERSATIONAL_PLAN_TEST_BOOTSTRAP_URL', 'CONVERSATIONAL_PLAN_TEST_DATABASE_URL', 'GALLERY_EDITOR_TEST_DATABASE_URL', 'DATABASE_URL', 'DIRECT_URL', 'SHADOW_DATABASE_URL', 'NODE_OPTIONS', 'NODE_PATH', 'OPENAI_API_KEY', 'RELAY_EDITOR_BENCH_LIVE_ENABLED']);
for (const key of Object.keys(env)) if (removed.has(key.toUpperCase()) || /^(PG|DOTENV_CONFIG_)/i.test(key)) delete env[key];
Object.assign(env, { DATABASE_URL: databaseUrl, GALLERY_EDITOR_TEST_DATABASE_URL: databaseUrl, DOTENV_CONFIG_QUIET: 'true', OPENAI_API_KEY: '', RELAY_EDITOR_BENCH_LIVE_ENABLED: '0' });
function run(kind, args) {
  const child = spawnSync(process.execPath, args, { cwd: root, env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
  const log = `${child.stdout ?? ''}\n${child.stderr ?? ''}`.replaceAll(databaseUrl, '[disposable database URL]');
  writeFileSync(`${prefix}-${kind}.log`, log, { flag: 'wx' });
  return { exitCode: child.status, signal: child.signal, error: child.error?.code ?? null, log: `${prefix}-${kind}.log` };
}
try {
  record.migrations = run('migrations', [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy']);
  if (record.migrations.exitCode === 0) record.tests = run('tests', [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/editor-bench/real-library-conversation-postgres.integration.test.ts', 'tests/editor-bench/real-library-preview-export-postgres.integration.test.ts', 'tests/editor-bench/real-library-draft-variants-postgres.integration.test.ts']);
} finally {
  try { record.cleanup = await dropDisposableDatabase(handle); }
  catch (error) { record.cleanup = { kind: 'failed', code: error.code ?? 'cleanup_uncertain' }; }
  writeFileSync(`${prefix}.json`, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify(record));
if (record.migrations?.exitCode !== 0 || record.tests?.exitCode !== 0 || record.cleanup?.kind !== 'dropped') process.exitCode = 1;
