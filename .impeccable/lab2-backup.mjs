import {config} from 'dotenv';import {spawnSync} from 'node:child_process';import {stat} from 'node:fs/promises';
config({quiet:true});const u=new URL(process.env.DATABASE_URL);if(u.hostname!=='127.0.0.1'||u.pathname!=='/relay_dev')throw new Error('Unexpected database');
const file='.relay-data/lab2-before-migrations-20261021.dump';
const result=spawnSync('C:/Users/jorda/Documents/Codex/2026-10-11/c/work/postgres-runtime/package/native/bin/pg_dump.exe',['-h',u.hostname,'-p',u.port,'-U',decodeURIComponent(u.username),'-d',u.pathname.slice(1),'-Fc','-f',file],{env:{...process.env,PGPASSWORD:decodeURIComponent(u.password)},encoding:'utf8'});
if(result.status!==0)throw new Error(result.stderr||String(result.error));console.log({backup:file,bytes:(await stat(file)).size});
