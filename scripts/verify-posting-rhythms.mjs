/** Isolated loopback Postgres proof. Never resets the configured application database. */
import 'dotenv/config';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const configured=process.env.DATABASE_URL;
if(!configured)throw Error('Configure a local DATABASE_URL before running this proof.');
const target=new URL(configured);
if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname))throw Error('This proof only creates databases on loopback Postgres.');
const name='relay_rhythm_test_'+randomBytes(8).toString('hex'),adminUrl=new URL(target);adminUrl.pathname='/postgres';
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();let created=false;
const run=(args,env)=>{const result=spawnSync(process.execPath,args,{env,stdio:'inherit'});if(result.status!==0)throw Error('Posting Rhythms verification failed.');};
try{
  await admin.query('CREATE DATABASE '+name);created=true;target.pathname='/'+name;
  const env={...process.env,DATABASE_URL:target.toString(),RHYTHM_TEST_DATABASE_URL:target.toString()};
  run(['node_modules/prisma/build/index.js','db','push'],env);
  const privateDb=new Client({connectionString:target.toString()});await privateDb.connect();
  try{const sql=(await Promise.all(['20261019150000_posting_rhythms','20261019160000_posting_rhythm_windows'].map(id=>readFile('prisma/migrations/'+id+'/migration.sql','utf8')))).join('\n');for(const statement of sql.match(/ALTER TABLE "creator_posting_rhythm[^;]+ENABLE ROW LEVEL SECURITY;|CREATE UNIQUE INDEX "creator_posting_rhythms_default_context"[^;]+;/g)||[])await privateDb.query(statement);}finally{await privateDb.end();}
  run(['node_modules/vitest/vitest.mjs','run','tests/posting-rhythms'],env);
  console.log('Posting Rhythms: isolated Postgres and interface checks passed.');
}finally{
  if(created){await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);await admin.query('DROP DATABASE '+name);}
  await admin.end();
}
