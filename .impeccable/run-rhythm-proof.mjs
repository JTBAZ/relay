import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const target=JSON.parse(await readFile('work/rhythm-proof-target.json','utf8'));
if(!/^relay_rhythm_test_[a-f0-9]{16}$/.test(target.name))throw Error('Invalid proof database');
const url=new URL(process.env.DATABASE_URL);if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Loopback required');url.pathname='/'+target.name;
const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/posting-rhythms/postgres.integration.test.ts'],{env:{...process.env,DATABASE_URL:url.toString(),RHYTHM_TEST_DATABASE_URL:url.toString()},stdio:'inherit'});
process.exitCode=result.status;
