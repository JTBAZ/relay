import {readFile,writeFile} from 'node:fs/promises';
const seed=JSON.parse(await readFile('tests/fixtures/pilot-ux-seed.json','utf8'));
const login=await fetch('http://localhost:8788/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:seed.accounts.creatorAva.email,password:seed.defaultDevPassword})});
const value=await login.json();const token=value.data?.token??value.token;
if(!token){console.log({login:login.status,error:value.error});process.exit(1)}
const headers={authorization:`Bearer ${token}`};
for(const path of ['/api/v1/gallery/editor/capabilities?creator_id=rcx_pilot_dev_ava','/api/v1/creator/style-profile','/api/v1/creator/schedule-rail','/api/v1/relay/library/staging?creator_id=rcx_pilot_dev_ava']){
 const response=await fetch('http://localhost:8788'+path,{headers});const body=await response.json();console.log({path,status:response.status,data:body.data??body.error});
}
